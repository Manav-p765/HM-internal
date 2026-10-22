import type { Request } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { createRouter, STAFF } from '../middleware/access.js';
import { HttpError } from '../middleware/errors.js';
import { displayNameSql, OVERDUE_SQL } from './tasks.js';
import { TODAY_SQL } from './shared.js';

// The staff bell. Two parts:
//   - stored: "a task was assigned to you" (migration 015, services/notifications.ts), read / unread;
//   - derived each time, never stored: reminders for the caller's own open tasks due today, tomorrow or overdue,
//     and overdue tasks of others they are responsible for (admin/manager: everyone's; an employee: the tasks
//     they assigned to colleagues).
// Only tasks the caller may open anyway (see routes/tasks.ts) are listed; there are no money fields here.
export const notificationsRouter = createRouter();

const isManager = (req: Request) => req.user!.role === 'admin' || req.user!.role === 'manager';
const LIST_LIMIT = 20;
const REMINDER_LIMIT = 10;

const REMINDER_COLUMNS = `
  t.id, t.task_code AS code, t.title, t.deadline, t.priority, t.status, p.name AS "projectName",
  e.full_name AS "assigneeName", ${OVERDUE_SQL} AS overdue, (t.deadline = ${TODAY_SQL}) AS "dueToday"`;
const REMINDER_FROM = `
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  LEFT JOIN employees e ON e.id = t.assignee_employee_id`;

// ---------------------------------------------------------------------------
// GET /api/notifications  (STAFF)
// ---------------------------------------------------------------------------
notificationsRouter.get('/', STAFF, async (req, res) => {
  const userId = req.user!.id;
  const employeeId = req.user!.employeeId ?? null;

  // My open tasks due by tomorrow (overdue ones included), most urgent first.
  const dueSoonWhere = `WHERE t.assignee_employee_id = $1 AND t.status <> 'completed' AND t.deadline <= ${TODAY_SQL} + 1`;
  // Overdue tasks of others: all of them for admin/manager, the ones I assigned for an employee.
  const teamWhere = `WHERE ${OVERDUE_SQL} AND t.assignee_employee_id IS DISTINCT FROM $1::uuid
                       AND ($2::boolean OR t.created_by = $3)`;
  const teamParams = [employeeId, isManager(req), userId];

  const [assigned, [{ unread }], dueSoon, [{ total: dueSoonTotal }], overdueTeam, [{ total: overdueTeamTotal }]] = await Promise.all([
    query(
      `SELECT n.id, n.kind, n.read_at AS "readAt", n.created_at AS "createdAt",
              json_build_object('id', t.id, 'code', t.task_code, 'title', t.title, 'deadline', t.deadline,
                                'priority', t.priority, 'status', t.status, 'projectName', p.name,
                                'overdue', ${OVERDUE_SQL}) AS task,
              CASE WHEN au.id IS NULL THEN NULL ELSE ${displayNameSql('au', 'ae', 'ac')} END AS "assignedBy"
         FROM notifications n
         JOIN tasks t ON t.id = n.task_id
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN users au ON au.id = n.actor_user_id
         LEFT JOIN employees ae ON ae.id = au.employee_id
         LEFT JOIN clients ac ON ac.id = au.client_id
        WHERE n.user_id = $1
        ORDER BY n.created_at DESC, n.id
        LIMIT ${LIST_LIMIT}`,
      [userId],
    ),
    query<{ unread: number }>('SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]),
    employeeId
      ? query(`SELECT ${REMINDER_COLUMNS} ${REMINDER_FROM} ${dueSoonWhere} ORDER BY t.deadline, t.task_code LIMIT ${REMINDER_LIMIT}`, [employeeId])
      : Promise.resolve([]),
    employeeId
      ? query<{ total: number }>(`SELECT count(*)::int AS total FROM tasks t ${dueSoonWhere}`, [employeeId])
      : Promise.resolve([{ total: 0 }]),
    query(`SELECT ${REMINDER_COLUMNS} ${REMINDER_FROM} ${teamWhere} ORDER BY t.deadline, t.task_code LIMIT ${REMINDER_LIMIT}`, teamParams),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM tasks t ${teamWhere}`, teamParams),
  ]);

  res.json({
    unread,
    assigned,
    dueSoon: { total: dueSoonTotal, tasks: dueSoon },
    overdueTeam: { total: overdueTeamTotal, tasks: overdueTeam },
  });
});

// ---------------------------------------------------------------------------
// POST /api/notifications/read-all and POST /api/notifications/:id/read  (STAFF; own notifications only)
// ---------------------------------------------------------------------------
notificationsRouter.post('/read-all', STAFF, async (req, res) => {
  await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user!.id]);
  res.json({ ok: true });
});

notificationsRouter.post('/:id/read', STAFF, async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  // Someone else's notification is the same 404 as a missing one.
  const updated = id.success
    ? await query(
        'UPDATE notifications SET read_at = coalesce(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING id',
        [id.data, req.user!.id],
      )
    : [];
  if (updated.length === 0) throw new HttpError(404, 'Notification not found', 'NOT_FOUND');
  res.json({ ok: true });
});
