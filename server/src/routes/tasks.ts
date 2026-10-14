import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { createRouter, STAFF } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { isoDate, likePattern, optionalText, pageQuery, TODAY_SQL } from './shared.js';

// Tasks for staff. Admin and manager manage every task; an employee only ever sees and touches tasks
// assigned to their own employee record (req.user.employeeId), and gets 404 for anyone else's.
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

const isManager = (req: Request) => req.user!.role === 'admin' || req.user!.role === 'manager';
const NO_EMPLOYEE = '00000000-0000-0000-0000-000000000000';
// The assignee an employee is restricted to (null = no restriction, for admin/manager).
const assigneeScope = (req: Request): string | null => (isManager(req) ? null : (req.user!.employeeId ?? NO_EMPLOYEE));

export const OVERDUE_SQL = `(t.status <> 'completed' AND t.deadline < ${TODAY_SQL})`;

const TASK_COLUMNS = `
  t.id, t.task_code AS code, t.project_id AS "projectId", p.name AS "projectName", p.status AS "projectStatus",
  p.client_id AS "clientId", c.company_name AS "clientName",
  t.title, t.description, t.assignee_employee_id AS "assigneeId",
  CASE WHEN e.id IS NULL THEN NULL ELSE json_build_object('id', e.id, 'fullName', e.full_name, 'designation', e.designation) END AS assignee,
  t.start_date AS "startDate", t.deadline, t.priority, t.status, t.client_visible AS "clientVisible",
  t.completed_at AS "completedAt", t.completion_comment AS "completionComment",
  ${OVERDUE_SQL} AS overdue,
  t.created_by AS "createdBy", t.updated_by AS "updatedBy", t.created_at AS "createdAt", t.updated_at AS "updatedAt"`;

const TASK_FROM = `
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN employees e ON e.id = t.assignee_employee_id`;

// $1 = assignee scope (null for admin/manager).
const SCOPE_SQL = `($1::uuid IS NULL OR t.assignee_employee_id = $1)`;

async function getTask(req: Request, id: string) {
  const [task] = await query(`SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.id = $2 AND ${SCOPE_SQL}`, [assigneeScope(req), id]);
  if (!task) throw new HttpError(404, 'Task not found', 'NOT_FOUND');
  return task;
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

const datesError = () =>
  new HttpError(400, 'Deadline cannot be before the start date', 'VALIDATION_ERROR', [
    { path: 'deadline', message: 'Deadline cannot be before the start date' },
  ]);

// ---------------------------------------------------------------------------
// GET /api/tasks  (STAFF; employees are forced to their own tasks, any assignee param is ignored)
//   ?projectId=&assigneeId=&priority=&status=&overdue=true&clientVisible=&search=&limit=&offset=
// ---------------------------------------------------------------------------
const listQuerySchema = pageQuery.extend({
  projectId: z.uuid().optional(),
  assigneeId: z.union([z.uuid(), z.literal('unassigned')]).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(100).optional(),
});

tasksRouter.get('/', STAFF, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  const q = parsed.data;

  const params: unknown[] = [assigneeScope(req)];
  const where = [SCOPE_SQL];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };
  if (q.projectId) add(p => `t.project_id = ${p}`, q.projectId);
  if (isManager(req) && q.assigneeId === 'unassigned') where.push('t.assignee_employee_id IS NULL');
  else if (isManager(req) && q.assigneeId) add(p => `t.assignee_employee_id = ${p}`, q.assigneeId);
  if (q.priority) add(p => `t.priority = ${p}`, q.priority);
  if (q.status) add(p => `t.status = ${p}`, q.status);
  if (q.overdue === 'true') where.push(OVERDUE_SQL);
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
// GET /api/tasks/summary  (STAFF; employees: their own tasks) - dashboard KPIs
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
       FROM tasks t WHERE ${SCOPE_SQL}`,
    [assigneeScope(req)],
  );
  res.json({ summary });
});

// ---------------------------------------------------------------------------
// GET /api/tasks/:id  (STAFF; employees only their own, else 404)
// ---------------------------------------------------------------------------
tasksRouter.get('/:id', STAFF, async (req, res) => {
  res.json({ task: await getTask(req, parseId(req.params.id)) });
});

// ---------------------------------------------------------------------------
// POST /api/tasks and PATCH /api/tasks/:id  (admin, manager)
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

tasksRouter.post('/', ['admin', 'manager'], async (req, res) => {
  const body = parseBody(createSchema, req.body);

  const id = await withTransaction(async client => {
    const project = (await client.query('SELECT 1 FROM projects WHERE id = $1 FOR SHARE', [body.projectId])).rows[0];
    if (!project) {
      throw new HttpError(400, 'Project not found', 'VALIDATION_ERROR', [{ path: 'projectId', message: 'Project not found' }]);
    }
    await assignToProject(client, body.projectId, body.assigneeId);
    // TSK-001, TSK-002, ... (max + 1 under a transaction-scoped lock, like employee codes)
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('tasks.task_code'))`);
    const next = await client.query<{ code: string }>(
      `SELECT 'TSK-' || lpad((coalesce(max(substring(task_code FROM 5)::int), 0) + 1)::text, 3, '0') AS code
         FROM tasks WHERE task_code ~ '^TSK-[0-9]+$'`,
    );
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO tasks (task_code, project_id, title, description, assignee_employee_id, start_date, deadline,
                          priority, client_visible, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING id`,
      [
        next.rows[0].code,
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
    return inserted.rows[0].id;
  });

  await audit(req, { action: 'task.created', entityType: 'task', entityId: id, metadata: { fields: Object.keys(body) } });
  res.status(201).json({ task: await getTask(req, id) });
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

tasksRouter.patch('/:id', ['admin', 'manager'], async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(updateSchema, req.body);

  await withTransaction(async client => {
    const current = (
      await client.query<{ project_id: string; start_date: string | null; deadline: string | null }>(
        'SELECT project_id, start_date, deadline FROM tasks WHERE id = $1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!current) throw new HttpError(404, 'Task not found', 'NOT_FOUND');
    const start = 'startDate' in body ? body.startDate : current.start_date;
    const deadline = 'deadline' in body ? body.deadline : current.deadline;
    if (start && deadline && deadline < start) throw datesError();
    if ('assigneeId' in body) await assignToProject(client, current.project_id, body.assigneeId);

    const fields = Object.keys(body) as (keyof typeof body)[];
    await client.query(
      `UPDATE tasks SET ${fields.map((f, i) => `${TASK_COLUMN[f]} = $${i + 3}`).join(', ')}, updated_by = $2 WHERE id = $1`,
      [id, req.user!.id, ...fields.map(f => body[f] ?? null)],
    );
  });

  await audit(req, { action: 'task.updated', entityType: 'task', entityId: id, metadata: { fields: Object.keys(body) } });
  res.json({ task: await getTask(req, id) });
});

// ---------------------------------------------------------------------------
// DELETE /api/tasks/:id  (admin, manager). Comments go with it (ON DELETE CASCADE).
// ---------------------------------------------------------------------------
tasksRouter.delete('/:id', ['admin', 'manager'], async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = await query<{ task_code: string }>('DELETE FROM tasks WHERE id = $1 RETURNING task_code', [id]);
  if (deleted.length === 0) throw new HttpError(404, 'Task not found', 'NOT_FOUND');
  await audit(req, { action: 'task.deleted', entityType: 'task', entityId: id, metadata: { code: deleted[0].task_code } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// PATCH /api/tasks/:id/status  { status, comment? }
//   employee (own task only): todo->in_progress, in_progress->in_review|blocked, blocked->in_progress
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
    const current = (
      await client.query<{ status: TaskStatus }>(
        `SELECT t.status FROM tasks t WHERE t.id = $2 AND ${SCOPE_SQL} FOR UPDATE`,
        [assigneeScope(req), id],
      )
    ).rows[0];
    if (!current) throw new HttpError(404, 'Task not found', 'NOT_FOUND');

    if (!isManager(req) && !(EMPLOYEE_TRANSITIONS[current.status] ?? []).includes(status)) {
      throw new HttpError(
        403,
        `You can't move a task from ${current.status.replace('_', ' ')} to ${status.replace('_', ' ')}. Ask a manager.`,
        'TRANSITION_NOT_ALLOWED',
      );
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
    return current.status;
  });

  await audit(req, { action: 'task.status_changed', entityType: 'task', entityId: id, metadata: { from, to: status } });
  res.json({ task: await getTask(req, id) });
});

// ---------------------------------------------------------------------------
// Comments (staff side). Employees only on their own tasks. Staff pick the type (default internal_note):
// internal notes are never shown to clients; client_feedback is the thread shared with the client.
// ---------------------------------------------------------------------------
export const COMMENT_AUTHOR_SQL = `
  coalesce(ae.full_name, CASE WHEN au.role = 'client' THEN cc.company_name ELSE 'Hybrid Monks' END)`;

tasksRouter.get('/:id/comments', STAFF, async (req, res) => {
  const task = await getTask(req, parseId(req.params.id));
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
  const task = await getTask(req, parseId(req.params.id));
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
// DELETE /api/comments/:id  (staff: the author, or an admin)
// ---------------------------------------------------------------------------
commentsRouter.delete('/:id', STAFF, async (req, res) => {
  const id = parseId(req.params.id, 'Comment');
  const [comment] = await query<{ author_user_id: string; task_id: string; assignee: string | null }>(
    `SELECT tc.author_user_id, tc.task_id, t.assignee_employee_id AS assignee
       FROM task_comments tc JOIN tasks t ON t.id = tc.task_id WHERE tc.id = $1`,
    [id],
  );
  // Employees can't even learn that comments on other people's tasks exist.
  if (!comment || (!isManager(req) && comment.assignee !== req.user!.employeeId)) {
    throw new HttpError(404, 'Comment not found', 'NOT_FOUND');
  }
  if (comment.author_user_id !== req.user!.id && req.user!.role !== 'admin') {
    throw new HttpError(403, 'Only the author or an admin can delete this comment', 'FORBIDDEN');
  }
  await query('DELETE FROM task_comments WHERE id = $1', [id]);
  await audit(req, { action: 'comment.deleted', entityType: 'task', entityId: comment.task_id, metadata: { commentId: id } });
  res.json({ ok: true });
});
