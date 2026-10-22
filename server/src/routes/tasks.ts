import express, { type Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { notifyTaskAssigned } from '../services/notifications.js';
import { createRouter, STAFF } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { taskAttachmentsLimiter } from '../middleware/security.js';
import { isoDate, likePattern, optionalText, pageQuery, TODAY_SQL } from './shared.js';

// Tasks for staff. Admin and manager manage every task. Any staff member may open any task (GET /:id,
// /by-code/:code, its comments and attachments), so a task link shared in a team chat works for everyone;
// an employee's lists stay their own: tasks assigned to their employee record (req.user.employeeId) or by them
// (created_by). Employees may create tasks on projects they are on, for any active colleague; whoever assigned
// a task may edit or delete it while it is still to do, and reviews it (in review -> completed, or back to in
// progress) when it is someone else's. Changing a task someone can merely view is a 403.
export const tasksRouter = createRouter();
// DELETE /api/comments/:id lives on its own path.
export const commentsRouter = createRouter();

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'completed', 'blocked'] as const;
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

// Status changes an employee may make on their own task. Everything else is admin/manager only.
const EMPLOYEE_TRANSITIONS: Record<string, TaskStatus[]> = {
  todo: ['in_progress'],
  in_progress: ['in_review', 'blocked'],
  blocked: ['in_progress'],
};
// Status changes an employee may make on a task they assigned to someone else: the review.
const CREATOR_TRANSITIONS: Record<string, TaskStatus[]> = {
  in_review: ['completed', 'in_progress'],
};

const isManager = (req: Request) => req.user!.role === 'admin' || req.user!.role === 'manager';
const NO_EMPLOYEE = '00000000-0000-0000-0000-000000000000';
// The assignee an employee is restricted to (null = no restriction, for admin/manager).
const assigneeScope = (req: Request): string | null => (isManager(req) ? null : (req.user!.employeeId ?? NO_EMPLOYEE));
// $1, $2 of SCOPE_SQL: the employee's own record and login (both null for admin/manager).
const viewerScope = (req: Request): [string | null, string | null] => (isManager(req) ? [null, null] : [assigneeScope(req), req.user!.id]);

export const OVERDUE_SQL = `(t.status <> 'completed' AND t.deadline < ${TODAY_SQL})`;

// A login's display name: the linked employee, else the client company, else the company itself.
export const displayNameSql = (user: string, employee: string, client: string) =>
  `coalesce(${employee}.full_name, CASE WHEN ${user}.role = 'client' THEN ${client}.company_name ELSE 'Hybrid Monks' END)`;

const TASK_COLUMNS = `
  t.id, t.task_code AS code, t.project_id AS "projectId", p.name AS "projectName", p.status AS "projectStatus",
  p.client_id AS "clientId", c.company_name AS "clientName",
  t.title, t.description, t.assignee_employee_id AS "assigneeId",
  CASE WHEN e.id IS NULL THEN NULL ELSE json_build_object('id', e.id, 'fullName', e.full_name, 'designation', e.designation) END AS assignee,
  t.start_date AS "startDate", t.deadline, t.priority, t.status, t.client_visible AS "clientVisible",
  t.requested_by_client AS "requestedByClient",
  t.completed_at AS "completedAt", t.completion_comment AS "completionComment",
  ${OVERDUE_SQL} AS overdue,
  t.created_by AS "createdBy", ${displayNameSql('cu', 'ce', 'cuc')} AS "createdByName",
  t.updated_by AS "updatedBy", t.created_at AS "createdAt", t.updated_at AS "updatedAt",
  (SELECT count(*)::int FROM task_attachments x WHERE x.task_id = t.id) AS "attachmentCount"`;

const TASK_FROM = `
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN employees e ON e.id = t.assignee_employee_id
  JOIN users cu ON cu.id = t.created_by
  LEFT JOIN employees ce ON ce.id = cu.employee_id
  LEFT JOIN clients cuc ON cuc.id = cu.client_id`;

// Lists: $1 = the employee's own record, $2 = their login (both null for admin/manager): assigned to them or by them.
const SCOPE_SQL = `($1::uuid IS NULL OR t.assignee_employee_id = $1 OR t.created_by = $2::uuid)`;

// One task: any staff member may open it.
async function getTask(id: string) {
  const [task] = await query(`SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.id = $1`, [id]);
  if (!task) throw new HttpError(404, 'Task not found', 'NOT_FOUND');
  return task;
}

// The people working on a task: admin/manager, its assignee, and whoever assigned it. They add and remove
// attachments; anyone else who opens the task only views them.
function worksOnTask(req: Request, task: { assignee_employee_id: string | null; created_by: string }): boolean {
  return (
    isManager(req) ||
    (task.assignee_employee_id !== null && task.assignee_employee_id === req.user!.employeeId) ||
    task.created_by === req.user!.id
  );
}

function parseId(raw: unknown, what = 'Task'): string {
  const result = z.uuid().safeParse(raw);
  if (!result.success) throw new HttpError(404, `${what} not found`, 'NOT_FOUND');
  return result.data;
}

// Assignees must be active employees; assigning someone also puts them on the project team.
async function assignToProject(client: PoolClient, projectId: string, employeeId: string | null | undefined) {
  if (!employeeId) return;
  const employee = (await client.query<{ status: string }>('SELECT status FROM employees WHERE id = $1', [employeeId])).rows[0];
  if (!employee || employee.status === 'inactive') {
    throw new HttpError(400, 'The assignee must be an active employee', 'VALIDATION_ERROR', [
      { path: 'assigneeId', message: 'The assignee must be an active employee' },
    ]);
  }
  await client.query(
    'INSERT INTO project_members (project_id, employee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [projectId, employeeId],
  );
}

// TSK-001, TSK-002, ... (max + 1 under a transaction-scoped lock, like employee codes). Staff and client
// requests (routes/portal.ts) share the sequence.
export async function nextTaskCode(client: PoolClient): Promise<string> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('tasks.task_code'))`);
  const next = await client.query<{ code: string }>(
    `SELECT 'TSK-' || lpad((coalesce(max(substring(task_code FROM 5)::int), 0) + 1)::text, 3, '0') AS code
       FROM tasks WHERE task_code ~ '^TSK-[0-9]+$'`,
  );
  return next.rows[0].code;
}

const datesError = () =>
  new HttpError(400, 'Deadline cannot be before the start date', 'VALIDATION_ERROR', [
    { path: 'deadline', message: 'Deadline cannot be before the start date' },
  ]);

const shareForbidden = () => new HttpError(403, 'Only an admin or manager can share a task with the client', 'FORBIDDEN');

// An employee changes or deletes a task only if they assigned it, and only while nobody has started on it.
function assertCreatorMayChange(req: Request, task: { created_by: string; status: string }) {
  if (isManager(req)) return;
  if (task.created_by !== req.user!.id) {
    throw new HttpError(403, 'Only the person who assigned this task or a manager can change it', 'FORBIDDEN');
  }
  if (task.status !== 'todo') {
    throw new HttpError(409, 'Work has started on this task. Ask a manager to change it.', 'TASK_LOCKED');
  }
}

// ---------------------------------------------------------------------------
// GET /api/tasks  (STAFF)
//   ?projectId=&assigneeId=&priority=&status=&overdue=true&requestedByClient=true&view=&search=&limit=&offset=
//   view=assigned_by_me: tasks the caller assigned to someone else. Otherwise employees get the tasks assigned
//   to them (any assigneeId param is ignored).
//   (requestedByClient=true&status=todo is the admin/manager bell: client requests nobody has started)
// ---------------------------------------------------------------------------
const listQuerySchema = pageQuery.extend({
  projectId: z.uuid().optional(),
  assigneeId: z.union([z.uuid(), z.literal('unassigned')]).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  requestedByClient: z.enum(['true', 'false']).optional(),
  view: z.enum(['assigned_by_me']).optional(),
  search: z.string().trim().max(100).optional(),
});

tasksRouter.get('/', STAFF, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  const q = parsed.data;

  const params: unknown[] = viewerScope(req);
  const where = [SCOPE_SQL];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };
  if (q.view === 'assigned_by_me') {
    add(p => `t.created_by = ${p}`, req.user!.id);
    add(p => `t.assignee_employee_id IS DISTINCT FROM ${p}::uuid`, req.user!.employeeId ?? null);
  } else if (!isManager(req)) {
    where.push('t.assignee_employee_id = $1');
  }
  if (q.projectId) add(p => `t.project_id = ${p}`, q.projectId);
  if (isManager(req) && q.assigneeId === 'unassigned') where.push('t.assignee_employee_id IS NULL');
  else if (isManager(req) && q.assigneeId) add(p => `t.assignee_employee_id = ${p}`, q.assigneeId);
  if (q.priority) add(p => `t.priority = ${p}`, q.priority);
  if (q.status) add(p => `t.status = ${p}`, q.status);
  if (q.overdue === 'true') where.push(OVERDUE_SQL);
  if (q.requestedByClient) where.push(q.requestedByClient === 'true' ? 't.requested_by_client' : 'NOT t.requested_by_client');
  if (q.search) add(p => `(t.title ILIKE ${p} OR t.task_code ILIKE ${p})`, likePattern(q.search));
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [tasks, [{ total }]] = await Promise.all([
    query(
      `SELECT ${TASK_COLUMNS} ${TASK_FROM} ${whereSql}
        ORDER BY (t.status = 'completed'), t.deadline NULLS LAST,
                 array_position(ARRAY['urgent','high','medium','low'], t.priority), t.task_code
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.limit, q.offset],
    ),
    query<{ total: number }>(`SELECT count(*)::int AS total ${TASK_FROM} ${whereSql}`, params),
  ]);
  res.json({ tasks, total, limit: q.limit, offset: q.offset });
});

// ---------------------------------------------------------------------------
// GET /api/tasks/summary  (STAFF; employees: the tasks assigned to them) - dashboard KPIs
// ---------------------------------------------------------------------------
tasksRouter.get('/summary', STAFF, async (req, res) => {
  const [summary] = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE t.status = 'todo')::int AS todo,
            count(*) FILTER (WHERE t.status = 'in_progress')::int AS "inProgress",
            count(*) FILTER (WHERE t.status = 'in_review')::int AS "inReview",
            count(*) FILTER (WHERE t.status = 'completed')::int AS completed,
            count(*) FILTER (WHERE t.status = 'blocked')::int AS blocked,
            count(*) FILTER (WHERE ${OVERDUE_SQL})::int AS overdue
       FROM tasks t WHERE ($1::uuid IS NULL OR t.assignee_employee_id = $1)`,
    [assigneeScope(req)],
  );
  res.json({ summary });
});

// ---------------------------------------------------------------------------
// GET /api/tasks/by-code/:code  (STAFF): the task behind a shared link (/task/TSK-042 in the app)
// GET /api/tasks/:id            (STAFF): any task
// ---------------------------------------------------------------------------
tasksRouter.get('/by-code/:code', STAFF, async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const [row] = /^TSK-\d{1,9}$/.test(code) ? await query<{ id: string }>('SELECT id FROM tasks WHERE task_code = $1', [code]) : [];
  if (!row) throw new HttpError(404, 'Task not found', 'NOT_FOUND');
  res.json({ task: await getTask(row.id) });
});

tasksRouter.get('/:id', STAFF, async (req, res) => {
  res.json({ task: await getTask(parseId(req.params.id)) });
});

// ---------------------------------------------------------------------------
// POST /api/tasks and PATCH /api/tasks/:id
//   admin, manager: any task. employee: create on a (not archived) project they are on, for any active
//   colleague; edit only tasks they created, while still to do. Only admin/manager share tasks with the client.
//   The assignee is notified (services/notifications.ts).
// ---------------------------------------------------------------------------
const createSchema = z
  .object({
    projectId: z.uuid(),
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: optionalText(5000),
    assigneeId: z.uuid().nullish(),
    startDate: isoDate.nullish(),
    deadline: isoDate.nullish(),
    priority: z.enum(PRIORITIES).default('medium'),
    clientVisible: z.boolean().default(false),
  })
  .refine(b => !b.startDate || !b.deadline || b.deadline >= b.startDate, {
    message: 'Deadline cannot be before the start date',
    path: ['deadline'],
  });

tasksRouter.post('/', STAFF, async (req, res) => {
  const body = parseBody(createSchema, req.body);
  if (body.clientVisible && !isManager(req)) throw shareForbidden();

  const id = await withTransaction(async client => {
    // Employees: only projects they are on (anything else reads as missing).
    const project = (
      await client.query(
        `SELECT 1 FROM projects p
          WHERE p.id = $1
            AND ($2::uuid IS NULL OR (p.status <> 'archived' AND EXISTS (
                  SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.employee_id = $2)))
          FOR SHARE`,
        [body.projectId, assigneeScope(req)],
      )
    ).rows[0];
    if (!project) {
      throw new HttpError(400, 'Project not found', 'VALIDATION_ERROR', [{ path: 'projectId', message: 'Project not found' }]);
    }
    await assignToProject(client, body.projectId, body.assigneeId);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO tasks (task_code, project_id, title, description, assignee_employee_id, start_date, deadline,
                          priority, client_visible, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING id`,
      [
        await nextTaskCode(client),
        body.projectId,
        body.title,
        body.description,
        body.assigneeId ?? null,
        body.startDate ?? null,
        body.deadline ?? null,
        body.priority,
        body.clientVisible,
        req.user!.id,
      ],
    );
    const taskId = inserted.rows[0].id;
    await notifyTaskAssigned(client, taskId, body.assigneeId, req.user!.id);
    return taskId;
  });

  await audit(req, { action: 'task.created', entityType: 'task', entityId: id, metadata: { fields: Object.keys(body) } });
  res.status(201).json({ task: await getTask(id) });
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: optionalText(5000),
    assigneeId: z.uuid().nullable(),
    startDate: isoDate.nullable(),
    deadline: isoDate.nullable(),
    priority: z.enum(PRIORITIES),
    clientVisible: z.boolean(),
  })
  .partial()
  .refine(b => Object.keys(b).length > 0, 'Nothing to update');

const TASK_COLUMN: Record<string, string> = {
  title: 'title',
  description: 'description',
  assigneeId: 'assignee_employee_id',
  startDate: 'start_date',
  deadline: 'deadline',
  priority: 'priority',
  clientVisible: 'client_visible',
};

type LockedTask = {
  project_id: string;
  start_date: string | null;
  deadline: string | null;
  requested_by_client: boolean;
  assignee_employee_id: string | null;
  created_by: string;
  status: string;
};

// The task row under FOR UPDATE (404 when missing). Every staff member can see it; each route checks who may
// change it.
async function lockTask(client: PoolClient, id: string): Promise<LockedTask> {
  const current = (
    await client.query<LockedTask>(
      `SELECT t.project_id, t.start_date, t.deadline, t.requested_by_client, t.assignee_employee_id, t.created_by, t.status
         FROM tasks t WHERE t.id = $1 FOR UPDATE`,
      [id],
    )
  ).rows[0];
  if (!current) throw new HttpError(404, 'Task not found', 'NOT_FOUND');
  return current;
}

tasksRouter.patch('/:id', STAFF, async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(updateSchema, req.body);

  await withTransaction(async client => {
    const current = await lockTask(client, id);
    assertCreatorMayChange(req, current);
    if ('clientVisible' in body && !isManager(req)) throw shareForbidden();
    // A client's own request always stays visible to that client (migration 014).
    if (current.requested_by_client && body.clientVisible === false) {
      throw new HttpError(409, 'A task the client requested stays shared with the client', 'CLIENT_REQUEST_VISIBLE');
    }
    const start = 'startDate' in body ? body.startDate : current.start_date;
    const deadline = 'deadline' in body ? body.deadline : current.deadline;
    if (start && deadline && deadline < start) throw datesError();
    if ('assigneeId' in body) await assignToProject(client, current.project_id, body.assigneeId);

    const fields = Object.keys(body) as (keyof typeof body)[];
    await client.query(
      `UPDATE tasks SET ${fields.map((f, i) => `${TASK_COLUMN[f]} = $${i + 3}`).join(', ')}, updated_by = $2 WHERE id = $1`,
      [id, req.user!.id, ...fields.map(f => body[f] ?? null)],
    );
    if ('assigneeId' in body && (body.assigneeId ?? null) !== current.assignee_employee_id) {
      await notifyTaskAssigned(client, id, body.assigneeId, req.user!.id);
    }
  });

  await audit(req, { action: 'task.updated', entityType: 'task', entityId: id, metadata: { fields: Object.keys(body) } });
  res.json({ task: await getTask(id) });
});

// ---------------------------------------------------------------------------
// DELETE /api/tasks/:id  (admin, manager; an employee: a task they created, while still to do).
// Comments and notifications go with it (ON DELETE CASCADE).
// ---------------------------------------------------------------------------
tasksRouter.delete('/:id', STAFF, async (req, res) => {
  const id = parseId(req.params.id);
  const code = await withTransaction(async client => {
    assertCreatorMayChange(req, await lockTask(client, id));
    const deleted = await client.query<{ task_code: string }>('DELETE FROM tasks WHERE id = $1 RETURNING task_code', [id]);
    return deleted.rows[0].task_code;
  });
  await audit(req, { action: 'task.deleted', entityType: 'task', entityId: id, metadata: { code } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// PATCH /api/tasks/:id/status  { status, comment? }
//   employee, own task: todo->in_progress, in_progress->in_review|blocked, blocked->in_progress
//   employee, a task they assigned to someone else: in_review->completed|in_progress (the review)
//   admin/manager: any transition. completed_at is set on completed and cleared when leaving it.
// ---------------------------------------------------------------------------
const statusSchema = z.object({
  status: z.enum(TASK_STATUSES),
  comment: optionalText(2000),
});

tasksRouter.patch('/:id/status', STAFF, async (req, res) => {
  const id = parseId(req.params.id);
  const { status, comment } = parseBody(statusSchema, req.body);

  const from = await withTransaction(async client => {
    const current = await lockTask(client, id);
    const from = current.status as TaskStatus;

    if (!isManager(req)) {
      const allowed =
        current.assignee_employee_id === req.user!.employeeId
          ? EMPLOYEE_TRANSITIONS[from]
          : current.created_by === req.user!.id
            ? CREATOR_TRANSITIONS[from]
            : undefined;
      if (!(allowed ?? []).includes(status)) {
        throw new HttpError(
          403,
          `You can't move a task from ${from.replace('_', ' ')} to ${status.replace('_', ' ')}. Ask a manager.`,
          'TRANSITION_NOT_ALLOWED',
        );
      }
    }

    // A note left when handing work over (in review) or finishing it is kept as the completion comment.
    const keepComment = comment && (status === 'in_review' || status === 'completed');
    await client.query(
      `UPDATE tasks
          SET status = $2,
              completed_at = CASE WHEN $2 = 'completed' THEN coalesce(completed_at, now()) ELSE NULL END,
              completion_comment = CASE WHEN $3::boolean THEN $4 ELSE completion_comment END,
              updated_by = $5
        WHERE id = $1`,
      [id, status, Boolean(keepComment), comment, req.user!.id],
    );
    return from;
  });

  await audit(req, { action: 'task.status_changed', entityType: 'task', entityId: id, metadata: { from, to: status } });
  res.json({ task: await getTask(id) });
});

// ---------------------------------------------------------------------------
// Comments (staff side). Employees only on tasks assigned to or by them. Staff pick the type (default
// internal_note): internal notes are never shown to clients; client_feedback is the thread shared with the client.
// ---------------------------------------------------------------------------
export const COMMENT_AUTHOR_SQL = displayNameSql('au', 'ae', 'cc');

tasksRouter.get('/:id/comments', STAFF, async (req, res) => {
  const task = await getTask(parseId(req.params.id));
  const comments = await query(
    `SELECT tc.id, tc.comment_type AS type, tc.body, tc.created_at AS "createdAt",
            tc.author_user_id AS "authorId", ${COMMENT_AUTHOR_SQL} AS "authorName", au.role AS "authorRole"
       FROM task_comments tc
       JOIN users au ON au.id = tc.author_user_id
       LEFT JOIN employees ae ON ae.id = au.employee_id
       LEFT JOIN clients cc ON cc.id = au.client_id
      WHERE tc.task_id = $1
      ORDER BY tc.created_at, tc.id`,
    [task.id],
  );
  res.json({ comments });
});

const staffCommentSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment').max(2000, 'Comments are limited to 2000 characters'),
  type: z.enum(['internal_note', 'client_feedback']).default('internal_note'),
});

tasksRouter.post('/:id/comments', STAFF, async (req, res) => {
  const task = await getTask(parseId(req.params.id));
  const { body, type } = parseBody(staffCommentSchema, req.body);
  const [comment] = await query<{ id: string }>(
    `INSERT INTO task_comments (task_id, author_user_id, comment_type, body) VALUES ($1, $2, $3, $4)
     RETURNING id, comment_type AS type, body, created_at AS "createdAt", author_user_id AS "authorId"`,
    [task.id, req.user!.id, type, body],
  );
  await audit(req, { action: 'comment.created', entityType: 'task', entityId: task.id as string, metadata: { commentId: comment.id, type } });
  res.status(201).json({ comment });
});

// ---------------------------------------------------------------------------
// Attachments (migration 017): files kept in the database and http(s) links. Any staff member who opens the
// task lists and downloads them; the people working on it (worksOnTask) add and remove them. Never shown in the
// client portal.
//   GET    /api/tasks/:id/attachments
//   POST   /api/tasks/:id/attachments/link       { url, name? }
//   POST   /api/tasks/:id/attachments/file       raw body; Content-Type, X-File-Name (URI-encoded)
//   GET    /api/tasks/:id/attachments/:attachmentId/download
//   DELETE /api/tasks/:id/attachments/:attachmentId
// ---------------------------------------------------------------------------
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_TASK = 20;

// Allowed files by extension, with the type they are served as (the browser's own claim is not trusted).
const FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};
export const ALLOWED_EXTENSIONS = Object.keys(FILE_TYPES);

const ATTACHMENT_COLUMNS = `
  a.id, a.kind, a.name, a.url, a.content_type AS "contentType", a.size_bytes AS "sizeBytes",
  a.uploaded_by AS "uploadedBy", ${displayNameSql('au', 'ae', 'ac')} AS "uploadedByName", a.created_at AS "createdAt"`;
const ATTACHMENT_FROM = `
  FROM task_attachments a
  JOIN users au ON au.id = a.uploaded_by
  LEFT JOIN employees ae ON ae.id = au.employee_id
  LEFT JOIN clients ac ON ac.id = au.client_id`;

const attachmentById = async (id: string) => (await query(`SELECT ${ATTACHMENT_COLUMNS} ${ATTACHMENT_FROM} WHERE a.id = $1`, [id]))[0];

// The task, locked, for adding an attachment: only the people working on it, at most MAX_ATTACHMENTS_PER_TASK.
async function lockForAttachment(client: PoolClient, req: Request, taskId: string) {
  const task = await lockTask(client, taskId);
  if (!worksOnTask(req, task)) {
    throw new HttpError(403, 'Only the assignee, the person who assigned this task or a manager can change its attachments', 'FORBIDDEN');
  }
  const [{ count }] = (await client.query<{ count: number }>('SELECT count(*)::int AS count FROM task_attachments WHERE task_id = $1', [taskId])).rows;
  if (count >= MAX_ATTACHMENTS_PER_TASK) {
    throw new HttpError(409, `A task can have at most ${MAX_ATTACHMENTS_PER_TASK} attachments`, 'TOO_MANY_ATTACHMENTS');
  }
}

tasksRouter.get('/:id/attachments', STAFF, async (req, res) => {
  const task = await getTask(parseId(req.params.id));
  const attachments = await query(`SELECT ${ATTACHMENT_COLUMNS} ${ATTACHMENT_FROM} WHERE a.task_id = $1 ORDER BY a.created_at, a.id`, [task.id]);
  res.json({ attachments });
});

const linkSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2000, 'Links are limited to 2000 characters')
    .refine(v => {
      try {
        return ['http:', 'https:'].includes(new URL(v).protocol);
      } catch {
        return false;
      }
    }, 'Enter a full link starting with https://'),
  name: z.string().trim().max(200).optional(),
});

tasksRouter.post('/:id/attachments/link', STAFF, taskAttachmentsLimiter, async (req, res) => {
  const taskId = parseId(req.params.id);
  const body = parseBody(linkSchema, req.body);
  const name = body.name || new URL(body.url).hostname;
  const id = await withTransaction(async client => {
    await lockForAttachment(client, req, taskId);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO task_attachments (task_id, kind, name, url, uploaded_by) VALUES ($1, 'link', $2, $3, $4) RETURNING id`,
      [taskId, name, body.url, req.user!.id],
    );
    return inserted.rows[0].id;
  });
  await audit(req, { action: 'task.attachment_added', entityType: 'task', entityId: taskId, metadata: { attachmentId: id, kind: 'link' } });
  res.status(201).json({ attachment: await attachmentById(id) });
});

// A file name as shown and downloaded: no folders, no control characters, at most 200 characters.
function cleanFileName(raw: string | undefined): string {
  let name = '';
  try {
    name = decodeURIComponent(raw ?? '');
  } catch {
    name = '';
  }
  name = name.replace(/[\u0000-\u001f\u007f]/g, '').split(/[\\/]/).pop()!.trim();
  return name.slice(-200);
}

const rawFile = express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES });

tasksRouter.post('/:id/attachments/file', STAFF, taskAttachmentsLimiter, rawFile, async (req, res) => {
  const taskId = parseId(req.params.id);
  const name = cleanFileName(req.get('X-File-Name'));
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const contentType = FILE_TYPES[extension];
  const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const invalid = (message: string) => new HttpError(400, message, 'VALIDATION_ERROR', [{ path: 'file', message }]);
  if (!name) throw invalid('The file needs a name');
  if (!contentType) throw invalid(`This type of file can't be attached. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  if (data.length === 0) throw invalid('The file is empty');

  const id = await withTransaction(async client => {
    await lockForAttachment(client, req, taskId);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO task_attachments (task_id, kind, name, content_type, size_bytes, data, uploaded_by)
       VALUES ($1, 'file', $2, $3, $4, $5, $6) RETURNING id`,
      [taskId, name, contentType, data.length, data, req.user!.id],
    );
    return inserted.rows[0].id;
  });
  await audit(req, {
    action: 'task.attachment_added',
    entityType: 'task',
    entityId: taskId,
    metadata: { attachmentId: id, kind: 'file', sizeBytes: data.length },
  });
  res.status(201).json({ attachment: await attachmentById(id) });
});

tasksRouter.get('/:id/attachments/:attachmentId/download', STAFF, async (req, res) => {
  const taskId = parseId(req.params.id);
  const attachmentId = parseId(req.params.attachmentId, 'Attachment');
  const [file] = await query<{ name: string; content_type: string; data: Buffer }>(
    `SELECT name, content_type, data FROM task_attachments WHERE id = $1 AND task_id = $2 AND kind = 'file'`,
    [attachmentId, taskId],
  );
  if (!file) throw new HttpError(404, 'Attachment not found', 'NOT_FOUND');
  // Always a download (never rendered in the app's origin); an ASCII fallback name plus the exact UTF-8 one.
  const fallback = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.setHeader('Content-Type', file.content_type);
  res.setHeader('Content-Disposition', `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(file.data);
});

tasksRouter.delete('/:id/attachments/:attachmentId', STAFF, async (req, res) => {
  const taskId = parseId(req.params.id);
  const attachmentId = parseId(req.params.attachmentId, 'Attachment');
  const kind = await withTransaction(async client => {
    const task = await lockTask(client, taskId);
    const [row] = (await client.query<{ kind: string }>('SELECT kind FROM task_attachments WHERE id = $1 AND task_id = $2', [attachmentId, taskId])).rows;
    if (!row) throw new HttpError(404, 'Attachment not found', 'NOT_FOUND');
    if (!worksOnTask(req, task)) {
      throw new HttpError(403, 'Only the assignee, the person who assigned this task or a manager can change its attachments', 'FORBIDDEN');
    }
    await client.query('DELETE FROM task_attachments WHERE id = $1', [attachmentId]);
    return row.kind;
  });
  await audit(req, { action: 'task.attachment_removed', entityType: 'task', entityId: taskId, metadata: { attachmentId, kind } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// DELETE /api/comments/:id  (staff: the author, or an admin)
// ---------------------------------------------------------------------------
commentsRouter.delete('/:id', STAFF, async (req, res) => {
  const id = parseId(req.params.id, 'Comment');
  const [comment] = await query<{ author_user_id: string; task_id: string }>(
    'SELECT tc.author_user_id, tc.task_id FROM task_comments tc WHERE tc.id = $1',
    [id],
  );
  // Every staff member can read every task's comments; only the author or an admin deletes one.
  if (!comment) throw new HttpError(404, 'Comment not found', 'NOT_FOUND');
  if (comment.author_user_id !== req.user!.id && req.user!.role !== 'admin') {
    throw new HttpError(403, 'Only the author or an admin can delete this comment', 'FORBIDDEN');
  }
  await query('DELETE FROM task_comments WHERE id = $1', [id]);
  await audit(req, { action: 'comment.deleted', entityType: 'task', entityId: comment.task_id, metadata: { commentId: id } });
  res.json({ ok: true });
});
