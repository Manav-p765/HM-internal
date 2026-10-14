import type { Request } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { createRouter, STAFF } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { isoDate, likePattern, optionalText, pageQuery } from './shared.js';

// Projects. Admin and manager manage them; an employee sees only projects they are a member of.
// Never deleted: archive/unarchive. Archived projects are hidden from the list unless asked for
// (?status=archived or ?includeArchived=true); archiving blocks nothing else (tasks stay editable).
export const projectsRouter = createRouter();

const isManager = (req: Request) => req.user!.role === 'admin' || req.user!.role === 'manager';

// For employees: only projects they belong to. $1 is always the employee id (or null for staff).
const MEMBER_SCOPE = `EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.employee_id = $1)`;

const PROJECT_COLUMNS = `
  p.id, p.name, p.description, p.client_id AS "clientId", c.company_name AS "clientName",
  p.start_date AS "startDate", p.deadline, p.status, p.created_at AS "createdAt", p.updated_at AS "updatedAt",
  (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id) AS "taskCount",
  (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'completed') AS "completedTaskCount",
  (SELECT count(*)::int FROM project_members pm WHERE pm.project_id = p.id) AS "memberCount"`;

const MEMBERS_JSON = `
  coalesce((SELECT json_agg(json_build_object('id', e.id, 'code', e.employee_code, 'fullName', e.full_name,
                                              'designation', e.designation, 'status', e.status) ORDER BY e.full_name)
              FROM project_members pm JOIN employees e ON e.id = pm.employee_id
             WHERE pm.project_id = p.id), '[]'::json) AS members`;

type ProjectRow = { taskCount: number; completedTaskCount: number } & Record<string, unknown>;

// progress = completed / total, as a fraction 0..1 (null when there are no tasks).
const withProgress = (row: ProjectRow) => ({
  ...row,
  progress: row.taskCount > 0 ? Math.round((row.completedTaskCount / row.taskCount) * 1000) / 1000 : null,
});

async function getProject(req: Request, id: string) {
  const [row] = await query<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS}, ${MEMBERS_JSON}
       FROM projects p LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.id = $2 AND ($1::uuid IS NULL OR ${MEMBER_SCOPE})`,
    [isManager(req) ? null : employeeScope(req), id],
  );
  // Same 404 whether the project doesn't exist or the employee isn't on it.
  if (!row) throw new HttpError(404, 'Project not found', 'NOT_FOUND');
  return withProgress(row);
}

// Employees are always scoped to their own employee record; an unlinked employee sees nothing.
function employeeScope(req: Request): string {
  return req.user!.employeeId ?? '00000000-0000-0000-0000-000000000000';
}

function parseId(raw: unknown): string {
  const result = z.uuid().safeParse(raw);
  if (!result.success) throw new HttpError(404, 'Project not found', 'NOT_FOUND');
  return result.data;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const EDITABLE_STATUSES = ['not_started', 'active', 'on_hold', 'completed'] as const; // 'archived' via /archive

const baseSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(200),
  description: optionalText(5000),
  clientId: z.uuid().nullish(),
  startDate: isoDate.nullish(),
  deadline: isoDate.nullish(),
  status: z.enum(EDITABLE_STATUSES).default('not_started'),
});

const datesInOrder = (b: { startDate?: string | null; deadline?: string | null }) =>
  !b.startDate || !b.deadline || b.deadline >= b.startDate;

const createSchema = baseSchema.refine(datesInOrder, { message: 'Deadline cannot be before the start date', path: ['deadline'] });
const updateSchema = baseSchema
  .extend({ status: z.enum(EDITABLE_STATUSES) })
  .partial()
  .refine(body => Object.keys(body).length > 0, 'Nothing to update');

const COLUMN: Record<string, string> = {
  name: 'name',
  description: 'description',
  clientId: 'client_id',
  startDate: 'start_date',
  deadline: 'deadline',
  status: 'status',
};

async function assertClientExists(clientId: string | null | undefined) {
  if (!clientId) return;
  const [client] = await query('SELECT 1 FROM clients WHERE id = $1', [clientId]);
  if (!client) {
    throw new HttpError(400, 'Client company not found', 'VALIDATION_ERROR', [{ path: 'clientId', message: 'Client company not found' }]);
  }
}

// ---------------------------------------------------------------------------
// GET /api/projects  (admin, manager: all; employee: member projects)
//   ?status=&clientId=&search=&includeArchived=&limit=&offset=
// ---------------------------------------------------------------------------
const listQuerySchema = pageQuery.extend({
  status: z.enum([...EDITABLE_STATUSES, 'archived']).optional(),
  clientId: z.union([z.uuid(), z.literal('internal')]).optional(),
  search: z.string().trim().max(100).optional(),
  includeArchived: z.enum(['true', 'false']).optional(),
});

projectsRouter.get('/', STAFF, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  const { status, clientId, search, includeArchived, limit, offset } = parsed.data;

  const params: unknown[] = [isManager(req) ? null : employeeScope(req)];
  const where = [`($1::uuid IS NULL OR ${MEMBER_SCOPE})`];
  if (status) {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  } else if (includeArchived !== 'true') {
    where.push(`p.status <> 'archived'`);
  }
  if (clientId === 'internal') where.push('p.client_id IS NULL');
  else if (clientId) {
    params.push(clientId);
    where.push(`p.client_id = $${params.length}`);
  }
  if (search) {
    params.push(likePattern(search));
    where.push(`(p.name ILIKE $${params.length} OR c.company_name ILIKE $${params.length})`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [rows, [{ total }]] = await Promise.all([
    query<ProjectRow>(
      `SELECT ${PROJECT_COLUMNS}
         FROM projects p LEFT JOIN clients c ON c.id = p.client_id
         ${whereSql}
        ORDER BY (p.status = 'archived'), p.deadline NULLS LAST, p.name
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    query<{ total: number }>(
      `SELECT count(*)::int AS total FROM projects p LEFT JOIN clients c ON c.id = p.client_id ${whereSql}`,
      params,
    ),
  ]);
  res.json({ projects: rows.map(withProgress), total, limit, offset });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:id  (same scoping as the list)
// ---------------------------------------------------------------------------
projectsRouter.get('/:id', STAFF, async (req, res) => {
  res.json({ project: await getProject(req, parseId(req.params.id)) });
});

// ---------------------------------------------------------------------------
// POST /api/projects and PATCH /api/projects/:id  (admin, manager)
// ---------------------------------------------------------------------------
projectsRouter.post('/', ['admin', 'manager'], async (req, res) => {
  const body = parseBody(createSchema, req.body);
  await assertClientExists(body.clientId);
  const [{ id }] = await query<{ id: string }>(
    `INSERT INTO projects (name, description, client_id, start_date, deadline, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [body.name, body.description, body.clientId ?? null, body.startDate ?? null, body.deadline ?? null, body.status, req.user!.id],
  );
  await audit(req, { action: 'project.created', entityType: 'project', entityId: id, metadata: { fields: Object.keys(body) } });
  res.status(201).json({ project: await getProject(req, id) });
});

projectsRouter.patch('/:id', ['admin', 'manager'], async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(updateSchema, req.body);
  if ('clientId' in body) await assertClientExists(body.clientId);

  await withTransaction(async client => {
    const current = (
      await client.query<{ start_date: string | null; deadline: string | null; status: string }>(
        'SELECT start_date, deadline, status FROM projects WHERE id = $1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!current) throw new HttpError(404, 'Project not found', 'NOT_FOUND');
    if (current.status === 'archived' && body.status) {
      throw new HttpError(400, 'Unarchive this project to change its status', 'PROJECT_ARCHIVED');
    }
    const start = 'startDate' in body ? body.startDate : current.start_date;
    const deadline = 'deadline' in body ? body.deadline : current.deadline;
    if (start && deadline && deadline < start) {
      throw new HttpError(400, 'Deadline cannot be before the start date', 'VALIDATION_ERROR', [
        { path: 'deadline', message: 'Deadline cannot be before the start date' },
      ]);
    }
    const fields = Object.keys(body) as (keyof typeof body)[];
    await client.query(
      `UPDATE projects SET ${fields.map((f, i) => `${COLUMN[f]} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [id, ...fields.map(f => body[f] ?? null)],
    );
  });

  await audit(req, { action: 'project.updated', entityType: 'project', entityId: id, metadata: { fields: Object.keys(body) } });
  res.json({ project: await getProject(req, id) });
});

// ---------------------------------------------------------------------------
// PUT /api/projects/:id/members  (admin, manager)  { employeeIds: uuid[] }  replaces the team
// Only active employees; someone still assigned to a task in the project can't be removed.
// ---------------------------------------------------------------------------
const membersSchema = z.object({ employeeIds: z.array(z.uuid()).max(200) });

projectsRouter.put('/:id/members', ['admin', 'manager'], async (req, res) => {
  const id = parseId(req.params.id);
  const employeeIds = [...new Set(parseBody(membersSchema, req.body).employeeIds)];

  const change = await withTransaction(async client => {
    const project = (await client.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!project) throw new HttpError(404, 'Project not found', 'NOT_FOUND');

    const active = await client.query<{ id: string }>(
      `SELECT id FROM employees WHERE id = ANY($1::uuid[]) AND status <> 'inactive'`,
      [employeeIds],
    );
    if (active.rows.length !== employeeIds.length) {
      throw new HttpError(400, 'Every member must be an active employee', 'VALIDATION_ERROR', [
        { path: 'employeeIds', message: 'Every member must be an active employee' },
      ]);
    }

    const stillAssigned = await client.query<{ full_name: string }>(
      `SELECT DISTINCT e.full_name FROM tasks t JOIN employees e ON e.id = t.assignee_employee_id
        WHERE t.project_id = $1 AND NOT (t.assignee_employee_id = ANY($2::uuid[]))`,
      [id, employeeIds],
    );
    if (stillAssigned.rows.length > 0) {
      throw new HttpError(
        409,
        `Reassign their tasks first: ${stillAssigned.rows.map(r => r.full_name).join(', ')}`,
        'MEMBER_HAS_TASKS',
      );
    }

    const before = await client.query<{ employee_id: string }>('SELECT employee_id FROM project_members WHERE project_id = $1', [id]);
    await client.query('DELETE FROM project_members WHERE project_id = $1 AND NOT (employee_id = ANY($2::uuid[]))', [id, employeeIds]);
    await client.query(
      `INSERT INTO project_members (project_id, employee_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
      [id, employeeIds],
    );
    const beforeIds = new Set(before.rows.map(r => r.employee_id));
    return {
      added: employeeIds.filter(e => !beforeIds.has(e)),
      removed: [...beforeIds].filter(e => !employeeIds.includes(e)),
    };
  });

  await audit(req, { action: 'project.members_updated', entityType: 'project', entityId: id, metadata: change });
  res.json({ project: await getProject(req, id) });
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/archive and /unarchive  (admin, manager). Unarchive returns it to 'active'.
// ---------------------------------------------------------------------------
for (const [path, from, to, action] of [
  ['/:id/archive', 'not_archived', 'archived', 'project.archived'],
  ['/:id/unarchive', 'archived', 'active', 'project.unarchived'],
] as const) {
  projectsRouter.post(path, ['admin', 'manager'], async (req, res) => {
    const id = parseId(req.params.id);
    const updated = await query<{ id: string }>(
      `UPDATE projects SET status = $2 WHERE id = $1 AND ${from === 'archived' ? "status = 'archived'" : "status <> 'archived'"} RETURNING id`,
      [id, to],
    );
    if (updated.length === 0) {
      const [exists] = await query('SELECT 1 FROM projects WHERE id = $1', [id]);
      if (!exists) throw new HttpError(404, 'Project not found', 'NOT_FOUND');
      throw new HttpError(409, to === 'archived' ? 'Already archived' : 'Not archived', to === 'archived' ? 'ALREADY_ARCHIVED' : 'NOT_ARCHIVED');
    }
    await audit(req, { action, entityType: 'project', entityId: id });
    res.json({ project: await getProject(req, id) });
  });
}
