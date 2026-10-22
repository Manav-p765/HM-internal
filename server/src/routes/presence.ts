import { query } from '../db.js';
import { now } from '../services/clock.js';
import { availabilityFor } from '../services/availability.js';
import { createRouter, STAFF } from '../middleware/access.js';
import { HttpError } from '../middleware/errors.js';
import { heartbeatLimiter } from '../middleware/security.js';

// ---------------------------------------------------------------------------
// /api/presence: the employee's browser says "still here" every 60 s while the tab is visible.
// ---------------------------------------------------------------------------
export const presenceRouter = createRouter();

// Writes last_seen_at at most once per 30 s per employee (older values are overwritten, newer ones kept).
// Not audited: it is presence, not a business change, and would flood the audit log.
presenceRouter.post('/heartbeat', ['employee'], heartbeatLimiter, async (req, res) => {
  const employeeId = req.user!.employeeId;
  if (!employeeId) throw new HttpError(404, 'Your account is not linked to an employee record', 'NOT_LINKED');
  const at = now();
  await query(
    `UPDATE employees SET last_seen_at = $2
      WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at <= $2::timestamptz - interval '30 seconds' OR last_seen_at > $2::timestamptz)`,
    [employeeId, at],
  );
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// /api/team/availability  (any staff): today's status for everyone in the directory. Status only:
// no punch times, no leave details. null for admin/manager-linked employees (attendance not tracked).
// ---------------------------------------------------------------------------
export const teamRouter = createRouter();

teamRouter.get('/availability', STAFF, async (_req, res) => {
  const rows = await query<{ id: string }>(`SELECT id FROM employees WHERE status <> 'inactive' ORDER BY full_name`);
  const statuses = await availabilityFor(rows.map(r => r.id));
  res.json({ availability: rows.map(r => ({ employeeId: r.id, status: statuses.has(r.id) ? statuses.get(r.id)! : 'not_in_today' })) });
});
