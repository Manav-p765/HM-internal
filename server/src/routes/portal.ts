import { z } from 'zod';
import { query } from '../db.js';
import { audit } from '../services/audit.js';
import { availabilityFor } from '../services/availability.js';
import { clientScope, createRouter } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { portalFeedbackLimiter } from '../middleware/security.js';
import { OVERDUE_SQL, COMMENT_AUTHOR_SQL } from './tasks.js';

// The client portal API. Every route is ['client'] only and scoped to clientScope(req) (= req.user.clientId).
// Clients see only their company's non-archived projects and only tasks marked client_visible, with no
// internal fields. Anything outside that scope is a 404, identical to a missing id.
export const portalRouter = createRouter();

const notFound = (what: string) => new HttpError(404, `${what} not found`, 'NOT_FOUND');

function parseId(raw: unknown, what: string): string {
  const result = z.uuid().safeParse(raw);
  if (!result.success) throw notFound(what);
  return result.data;
}

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
    `SELECT t.id, t.task_code AS code, t.title, t.description, t.status, t.priority,
            t.start_date AS "startDate", t.deadline, t.completed_at AS "completedAt", ${OVERDUE_SQL} AS overdue,
            CASE WHEN e.id IS NULL THEN NULL ELSE json_build_object('fullName', e.full_name, 'designation', e.designation) END AS assignee,
            (SELECT count(*)::int FROM task_comments tc WHERE tc.task_id = t.id AND tc.comment_type = 'client_feedback') AS "feedbackCount"
       FROM tasks t LEFT JOIN employees e ON e.id = t.assignee_employee_id
      WHERE t.project_id = $1 AND t.client_visible
      ORDER BY (t.status = 'completed'), t.deadline NULLS LAST, t.task_code`,
    [projectId],
  );
  res.json({ project, tasks });
});

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
