import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { availabilityFor } from '../services/availability.js';
import { notifyTaskAssigned } from '../services/notifications.js';
import { clientScope, createRouter } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { portalFeedbackLimiter, portalTasksLimiter } from '../middleware/security.js';
import { amountInWords } from '../services/amountInWords.js';
import type { Currency } from '../services/currency.js';
import { istDate, now } from '../services/clock.js';
import { OVERDUE_SQL, COMMENT_AUTHOR_SQL, nextTaskCode, PRIORITIES } from './tasks.js';
import { isoDate, optionalText } from './shared.js';
import { BALANCE_SQL, derivedStatusSql, outstandingByCurrency, overdueSql, PAID_JOIN, splitByCurrency } from './invoices.js';
import { PRINTED_COMPANY_COLUMNS } from './settings.js';

// The client portal API. Every route is ['client'] only and scoped to clientScope(req) (= req.user.clientId).
// Clients see only their company's non-archived projects, only tasks marked client_visible, and their own
// company's issued invoices (read-only), with no internal fields. They may request tasks on their projects
// and assign them to the project team (see "Client task requests"). Anything outside that scope is a 404,
// identical to a missing id.
export const portalRouter = createRouter();

const notFound = (what: string) => new HttpError(404, `${what} not found`, 'NOT_FOUND');

function parseId(raw: unknown, what: string): string {
  const result = z.uuid().safeParse(raw);
  if (!result.success) throw notFound(what);
  return result.data;
}

// A task as the client sees it: no internal fields (no completion comment, ids of people, visibility flag).
// `requestedByClient`: the client's company asked for it; `editable`: such a request not started yet.
const PORTAL_TASK_COLUMNS = `
  t.id, t.task_code AS code, t.title, t.description, t.status, t.priority,
  t.start_date AS "startDate", t.deadline, t.completed_at AS "completedAt", ${OVERDUE_SQL} AS overdue,
  CASE WHEN e.id IS NULL THEN NULL ELSE json_build_object('fullName', e.full_name, 'designation', e.designation) END AS assignee,
  (SELECT count(*)::int FROM task_comments tc WHERE tc.task_id = t.id AND tc.comment_type = 'client_feedback') AS "feedbackCount",
  t.requested_by_client AS "requestedByClient", (t.requested_by_client AND t.status = 'todo') AS editable`;
const PORTAL_TASK_FROM = `FROM tasks t LEFT JOIN employees e ON e.id = t.assignee_employee_id`;

// Visible-task counts per project; only computed over client_visible tasks.
const VISIBLE_COUNTS = `
  count(t.id)::int AS total,
  count(t.id) FILTER (WHERE t.status = 'completed')::int AS completed,
  count(t.id) FILTER (WHERE t.status IN ('in_progress', 'in_review'))::int AS "inProgress",
  count(t.id) FILTER (WHERE ${OVERDUE_SQL})::int AS overdue`;

// ---------------------------------------------------------------------------
// GET /api/portal/projects
// ---------------------------------------------------------------------------
portalRouter.get('/projects', ['client'], async (req, res) => {
  const rows = await query<{ total: number; completed: number; inProgress: number; overdue: number } & Record<string, unknown>>(
    `SELECT p.id, p.name, p.description, p.start_date AS "startDate", p.deadline, p.status, ${VISIBLE_COUNTS}
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id AND t.client_visible
      WHERE p.client_id = $1 AND p.status <> 'archived'
      GROUP BY p.id
      ORDER BY p.deadline NULLS LAST, p.name`,
    [clientScope(req)],
  );
  const projects = rows.map(({ total, completed, inProgress, overdue, ...project }) =>
    total > 0
      ? { ...project, progress: Math.round((completed / total) * 1000) / 1000, taskCounts: { total, completed, inProgress, overdue } }
      : { ...project, progress: null },
  );
  res.json({ projects });
});

// ---------------------------------------------------------------------------
// GET /api/portal/projects/:id/tasks  (client-visible tasks only, no internal fields)
// ---------------------------------------------------------------------------
portalRouter.get('/projects/:id/tasks', ['client'], async (req, res) => {
  const projectId = parseId(req.params.id, 'Project');
  const [project] = await query(
    `SELECT p.id, p.name FROM projects p WHERE p.id = $1 AND p.client_id = $2 AND p.status <> 'archived'`,
    [projectId, clientScope(req)],
  );
  if (!project) throw notFound('Project');

  const tasks = await query(
    `SELECT ${PORTAL_TASK_COLUMNS} ${PORTAL_TASK_FROM}
      WHERE t.project_id = $1 AND t.client_visible
      ORDER BY (t.status = 'completed'), t.deadline NULLS LAST, t.task_code`,
    [projectId],
  );
  res.json({ project, tasks });
});

// ---------------------------------------------------------------------------
// Client task requests. A client user may request a task on one of their company's open projects and assign
// it to someone on that project's team; it goes straight to that employee (shared with the client, flagged
// requested_by_client; admins and managers see open requests in their bell). The client may change or
// reassign their company's own requests until work starts (status todo); after that only staff can.
// ---------------------------------------------------------------------------

// A project of this company that takes requests: not archived, not completed. Anything else is a 404.
async function requestableProject(rawId: unknown, clientId: string) {
  const id = parseId(rawId, 'Project');
  const [project] = await query<{ id: string; status: string }>(
    `SELECT p.id, p.status FROM projects p WHERE p.id = $1 AND p.client_id = $2 AND p.status <> 'archived'`,
    [id, clientId],
  );
  if (!project) throw notFound('Project');
  return project;
}

// Who a client may assign: active members of that project's team, except people whose login is an admin or
// manager. Same people as /team, so the employee id is all that is new here (and it's needed to choose).
const ASSIGNABLE_SQL = `
  FROM project_members pm
  JOIN employees e ON e.id = pm.employee_id
 WHERE pm.project_id = $1 AND e.status <> 'inactive'
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id AND u.role IN ('admin', 'manager'))`;

// GET /api/portal/projects/:id/assignees: { assignees: [{ id, name, designation }] }
portalRouter.get('/projects/:id/assignees', ['client'], async (req, res) => {
  const project = await requestableProject(req.params.id, clientScope(req));
  const assignees = await query(
    `SELECT e.id, e.full_name AS name, e.designation ${ASSIGNABLE_SQL} ORDER BY e.full_name`,
    [project.id],
  );
  res.json({ assignees });
});

const requestFields = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: optionalText(5000),
  priority: z.enum(PRIORITIES),
  deadline: isoDate.nullish(),
  assigneeId: z.uuid('Choose someone from the project team').nullish(),
};
const requestSchema = z.object({ ...requestFields, priority: requestFields.priority.default('medium') }).strict();
const requestPatchSchema = z
  .object(requestFields)
  .partial()
  .strict()
  .refine(b => Object.keys(b).length > 0, 'Nothing to update');

async function checkRequest(db: PoolClient, projectId: string, body: { deadline?: string | null; assigneeId?: string | null }) {
  if (body.deadline && body.deadline < istDate(now())) {
    throw new HttpError(400, 'The deadline cannot be in the past', 'VALIDATION_ERROR', [{ path: 'deadline', message: 'The deadline cannot be in the past' }]);
  }
  if (body.assigneeId) {
    const { rowCount } = await db.query(`SELECT 1 ${ASSIGNABLE_SQL} AND e.id = $2`, [projectId, body.assigneeId]);
    if (!rowCount) {
      throw new HttpError(400, 'Choose someone from the project team', 'VALIDATION_ERROR', [
        { path: 'assigneeId', message: 'Choose someone from the project team' },
      ]);
    }
  }
}

// POST /api/portal/projects/:id/tasks  { title, description?, priority?, deadline?, assigneeId? }
portalRouter.post('/projects/:id/tasks', ['client'], portalTasksLimiter, async (req, res) => {
  const project = await requestableProject(req.params.id, clientScope(req));
  if (project.status === 'completed') throw new HttpError(409, 'This project is completed', 'PROJECT_CLOSED');
  const body = parseBody(requestSchema, req.body);
  const id = await withTransaction(async db => {
    await db.query('SELECT 1 FROM projects WHERE id = $1 FOR SHARE', [project.id]);
    await checkRequest(db, project.id, body);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO tasks (task_code, project_id, title, description, assignee_employee_id, deadline, priority,
                          client_visible, requested_by_client, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, $8, $8) RETURNING id`,
      [await nextTaskCode(db), project.id, body.title, body.description, body.assigneeId ?? null, body.deadline ?? null, body.priority, req.user!.id],
    );
    await notifyTaskAssigned(db, rows[0].id, body.assigneeId, req.user!.id);
    return rows[0].id;
  });
  await audit(req, { action: 'task.created', entityType: 'task', entityId: id, metadata: { fields: Object.keys(body), portal: true } });
  res.status(201).json({ task: await portalTask(id) });
});

// PATCH /api/portal/tasks/:id: the company's own request, while still to do. A task the client can't see is a
// 404; one they can see but may not change (staff-created, or work has started) is a 409.
portalRouter.patch('/tasks/:id', ['client'], portalTasksLimiter, async (req, res) => {
  const id = parseId(req.params.id, 'Task');
  const body = parseBody(requestPatchSchema, req.body);
  await withTransaction(async db => {
    const { rows } = await db.query<{ projectId: string; status: string; requested: boolean; assigneeId: string | null }>(
      `SELECT t.project_id AS "projectId", t.status, t.requested_by_client AS requested, t.assignee_employee_id AS "assigneeId"
         FROM tasks t JOIN projects p ON p.id = t.project_id
        WHERE t.id = $1 AND t.client_visible AND p.client_id = $2 AND p.status <> 'archived'
        FOR UPDATE OF t`,
      [id, clientScope(req)],
    );
    const task = rows[0];
    if (!task) throw notFound('Task');
    if (!task.requested || task.status !== 'todo') {
      throw new HttpError(409, 'Only your own requests can be changed, and only until work starts', 'TASK_LOCKED');
    }
    await checkRequest(db, task.projectId, body);
    const fields = Object.keys(body) as (keyof typeof body)[];
    await db.query(
      `UPDATE tasks SET ${fields.map((f, i) => `${REQUEST_COLUMN[f]} = $${i + 3}`).join(', ')}, updated_by = $2 WHERE id = $1`,
      [id, req.user!.id, ...fields.map(f => body[f] ?? null)],
    );
    if ('assigneeId' in body && (body.assigneeId ?? null) !== task.assigneeId) {
      await notifyTaskAssigned(db, id, body.assigneeId, req.user!.id);
    }
  });
  await audit(req, { action: 'task.updated', entityType: 'task', entityId: id, metadata: { fields: Object.keys(body), portal: true } });
  res.json({ task: await portalTask(id) });
});

const REQUEST_COLUMN: Record<keyof typeof requestFields, string> = {
  title: 'title',
  description: 'description',
  priority: 'priority',
  deadline: 'deadline',
  assigneeId: 'assignee_employee_id',
};

async function portalTask(id: string) {
  const [task] = await query(`SELECT ${PORTAL_TASK_COLUMNS} ${PORTAL_TASK_FROM} WHERE t.id = $1`, [id]);
  return task;
}

// ---------------------------------------------------------------------------
// GET /api/portal/team: the people working on this company's non-archived projects, with today's status
// (null for members whose login is an admin or manager: their attendance isn't tracked).
// Exactly name, designation, avatarUrl, status and the names of this company's projects they are on:
// no ids, no emails, no punch times, no leave details.
// ---------------------------------------------------------------------------
portalRouter.get('/team', ['client'], async (req, res) => {
  const rows = await query<{ id: string; name: string; designation: string; avatarUrl: string | null; projects: string[] }>(
    `SELECT e.id, e.full_name AS name, e.designation, e.avatar_url AS "avatarUrl",
            array_agg(DISTINCT p.name ORDER BY p.name) AS projects
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
       JOIN employees e ON e.id = pm.employee_id
      WHERE p.client_id = $1 AND p.status <> 'archived' AND e.status <> 'inactive'
      GROUP BY e.id
      ORDER BY e.full_name`,
    [clientScope(req)],
  );
  const statuses = await availabilityFor(rows.map(r => r.id));
  const team = rows.map(r => ({
    name: r.name,
    designation: r.designation,
    avatarUrl: r.avatarUrl,
    status: statuses.has(r.id) ? statuses.get(r.id)! : 'not_in_today', // null: admin/manager, not tracked
    projects: r.projects,
  }));
  res.json({ team });
});

// ---------------------------------------------------------------------------
// Invoices: the company's own issued invoices (sent, paid or cancelled; never drafts), read-only.
// Explicit columns only: no cancel reason, no internal ids, no who-recorded-what, no payment notes or
// references, no reversed payments. Amounts are server strings (services/money.ts did the arithmetic);
// derived states use the same SQL as /api/invoices.
// ---------------------------------------------------------------------------
const PORTAL_INVOICE_COLUMNS = `
  i.id, i.invoice_number AS "invoiceNumber", i.invoice_date AS "invoiceDate", i.due_date AS "dueDate", i.currency,
  i.total_amount::text AS total, p.paid::text AS "amountPaid", ${BALANCE_SQL}::text AS balance,
  i.status, ${derivedStatusSql('$2')} AS "derivedStatus"`;
// $1 = clientScope(req), $2 = today (IST).
const ISSUED_TO_CLIENT = `i.client_id = $1 AND i.status <> 'draft' AND i.invoice_number IS NOT NULL`;

// GET /api/portal/invoices: newest first, with a summary of what is still due (INR in outstandingTotal/
// overdueTotal, any other currency apart in otherCurrencies; currencies are never added together).
portalRouter.get('/invoices', ['client'], async (req, res) => {
  const today = istDate(now());
  const params = [clientScope(req), today];
  const [invoices, [summary], byCurrency] = await Promise.all([
    query(
      `SELECT ${PORTAL_INVOICE_COLUMNS} FROM invoices i ${PAID_JOIN}
        WHERE ${ISSUED_TO_CLIENT} ORDER BY i.invoice_date DESC, i.invoice_number DESC`,
      params,
    ),
    query(
      `SELECT count(*)::int AS count, count(*) FILTER (WHERE ${overdueSql('$2')})::int AS "overdueCount"
         FROM invoices i ${PAID_JOIN} WHERE ${ISSUED_TO_CLIENT}`,
      params,
    ),
    outstandingByCurrency(today, 'i.client_id = $2', [clientScope(req)]),
  ]);
  res.json({ invoices, summary: { ...summary, ...splitByCurrency(byCurrency) } });
});

// GET /api/portal/invoices/:id: the invoice as printed (lines, totals, total in words, live payments) and the
// issuing company's printed details. Another company's invoice, a draft or a missing id: the same 404.
portalRouter.get('/invoices/:id', ['client'], async (req, res) => {
  const id = parseId(req.params.id, 'Invoice');
  const [invoice] = await query<{ total: string; currency: Currency } & Record<string, unknown>>(
    `SELECT ${PORTAL_INVOICE_COLUMNS},
            i.client_name AS "clientName", i.client_email AS "clientEmail", i.client_address AS "clientAddress",
            i.client_gstin AS "clientGstin", i.subtotal::text AS subtotal, i.tax_rate::text AS "taxRate",
            i.tax_amount::text AS "taxAmount", i.notes
       FROM invoices i ${PAID_JOIN}
      WHERE i.id = $3 AND ${ISSUED_TO_CLIENT}`,
    [clientScope(req), istDate(now()), id],
  );
  if (!invoice) throw notFound('Invoice');
  const [items, payments, [company]] = await Promise.all([
    query(
      `SELECT id, position, description, quantity::text AS quantity, unit_price::text AS "unitPrice", line_total::text AS "lineTotal"
         FROM invoice_items WHERE invoice_id = $1 ORDER BY position`,
      [id],
    ),
    // In the invoice's currency; the INR the company received is internal (the ledger) and never shown here.
    query(
      `SELECT t.id, t.txn_date AS "txnDate", t.invoice_amount::text AS amount, t.payment_method AS "paymentMethod"
         FROM transactions t WHERE t.invoice_id = $1 AND t.reversed_at IS NULL ORDER BY t.txn_date, t.created_at`,
      [id],
    ),
    query(`SELECT ${PRINTED_COMPANY_COLUMNS} FROM company_settings LIMIT 1`),
  ]);
  res.json({ invoice: { ...invoice, totalInWords: amountInWords(invoice.total, invoice.currency), items, payments }, company });
});

// A task the client may see: visible, in a non-archived project of their company.
async function visibleTaskId(rawId: unknown, clientId: string): Promise<string> {
  const id = parseId(rawId, 'Task');
  const [task] = await query<{ id: string }>(
    `SELECT t.id FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.id = $1 AND t.client_visible AND p.client_id = $2 AND p.status <> 'archived'`,
    [id, clientId],
  );
  if (!task) throw notFound('Task');
  return task.id;
}

// ---------------------------------------------------------------------------
// GET /api/portal/tasks/by-code/:code: where a shared task link (/task/TSK-042) opens in the portal. Only the
// company's own client-visible tasks on non-archived projects; anything else is the same 404 as a missing code.
// ---------------------------------------------------------------------------
portalRouter.get('/tasks/by-code/:code', ['client'], async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const [task] = /^TSK-\d{1,9}$/.test(code)
    ? await query<{ taskId: string; projectId: string }>(
        `SELECT t.id AS "taskId", t.project_id AS "projectId" FROM tasks t JOIN projects p ON p.id = t.project_id
          WHERE t.task_code = $1 AND t.client_visible AND p.client_id = $2 AND p.status <> 'archived'`,
        [code, clientScope(req)],
      )
    : [];
  if (!task) throw notFound('Task');
  res.json(task);
});

// ---------------------------------------------------------------------------
// GET /api/portal/tasks/:id/comments  (client_feedback only, filtered in SQL)
// ---------------------------------------------------------------------------
portalRouter.get('/tasks/:id/comments', ['client'], async (req, res) => {
  const taskId = await visibleTaskId(req.params.id, clientScope(req));
  const comments = await query(
    `SELECT tc.id, tc.body, tc.created_at AS "createdAt", ${COMMENT_AUTHOR_SQL} AS "authorName",
            (au.role = 'client') AS "fromClient"
       FROM task_comments tc
       JOIN users au ON au.id = tc.author_user_id
       LEFT JOIN employees ae ON ae.id = au.employee_id
       LEFT JOIN clients cc ON cc.id = au.client_id
      WHERE tc.task_id = $1 AND tc.comment_type = 'client_feedback'
      ORDER BY tc.created_at, tc.id`,
    [taskId],
  );
  res.json({ comments });
});

// ---------------------------------------------------------------------------
// POST /api/portal/tasks/:id/comments  { body }  (type forced to client_feedback; rate limited)
// ---------------------------------------------------------------------------

const feedbackSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment').max(2000, 'Comments are limited to 2000 characters'),
});

portalRouter.post('/tasks/:id/comments', ['client'], portalFeedbackLimiter, async (req, res) => {
  const taskId = await visibleTaskId(req.params.id, clientScope(req));
  const { body } = parseBody(feedbackSchema, req.body); // any "type" in the body is ignored
  const [comment] = await query<{ id: string }>(
    `INSERT INTO task_comments (task_id, author_user_id, comment_type, body)
     VALUES ($1, $2, 'client_feedback', $3) RETURNING id, body, created_at AS "createdAt"`,
    [taskId, req.user!.id, body],
  );
  await audit(req, { action: 'comment.created', entityType: 'task', entityId: taskId, metadata: { commentId: comment.id, type: 'client_feedback', portal: true } });
  res.status(201).json({ comment: { ...comment, authorName: req.user!.clientName, fromClient: true } });
});
