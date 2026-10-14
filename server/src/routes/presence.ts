import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { query } from '../db.js';
import { autoPunchIn } from '../services/attendance.js';
import { now } from '../services/clock.js';
import { availabilityFor } from '../services/availability.js';
import { createRouter, STAFF } from '../middleware/access.js';
import { HttpError } from '../middleware/errors.js';

// ---------------------------------------------------------------------------
// /api/presence: the employee's browser says "still here" every 60 s while the tab is visible.
// ---------------------------------------------------------------------------
export const presenceRouter = createRouter();

// The client sends one per minute; this only stops a runaway tab.
const heartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: req => req.user?.id ?? 'anonymous',
  skip: () => config.isTest,
  handler: (_req, _res, next) => next(new HttpError(429, 'Too many heartbeats', 'RATE_LIMITED')),
});

// Writes last_seen_at at most once per 30 s per employee (older values are overwritten, newer ones kept).
// Not audited: it is presence, not a business change, and would flood the audit log.
presenceRouter.post('/heartbeat', ['employee'], heartbeatLimiter, async (req, res) => {
  const employeeId = req.user!.employeeId;
  if (!employeeId) throw new HttpError(404, 'Your account is not linked to an employee record', 'NOT_LINKED');
  await autoPunchIn(req, req.user!); // the first heartbeat of a new IST day punches the employee in
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
// no punch times, no leave details.
// ---------------------------------------------------------------------------
export const teamRouter = createRouter();

teamRouter.get('/availability', STAFF, async (_req, res) => {
  const rows = await query<{ id: string }>(`SELECT id FROM employees WHERE status <> 'inactive' ORDER BY full_name`);
  const statuses = await availabilityFor(rows.map(r => r.id));
  res.json({ availability: rows.map(r => ({ employeeId: r.id, status: statuses.get(r.id) ?? 'not_in_today' })) });
});
