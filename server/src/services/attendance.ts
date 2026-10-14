import type { Request } from 'express';
import { query } from '../db.js';
import type { SessionUser } from '../middleware/auth.js';
import { audit } from './audit.js';
import { now, istDate } from './clock.js';

// Automatic punch-in: an employee-role user with a linked, active employee record gets today's (IST)
// attendance row the first time they are seen that day: at login, and on the first /api/auth/me or
// presence heartbeat of a new IST day. Idempotent (ON CONFLICT DO NOTHING). The session remembers the
// last day it checked so the insert is attempted once per session per day, not on every request.
// Never throws: a failure is logged (no secrets) and the caller carries on.
export async function autoPunchIn(req: Request, user: SessionUser): Promise<void> {
  if (user.role !== 'employee' || !user.employeeId) return;
  const at = now();
  const today = istDate(at);
  if (req.session.punchCheckedOn === today) return;

  try {
    const inserted = await query<{ id: string }>(
      `INSERT INTO attendance_records (employee_id, work_date, punch_in, source, created_by)
       SELECT e.id, $2::date, $3, 'login', $4 FROM employees e WHERE e.id = $1 AND e.status = 'active'
       ON CONFLICT (employee_id, work_date) DO NOTHING
       RETURNING id`,
      [user.employeeId, today, at, user.id],
    );
    req.session.punchCheckedOn = today;
    if (inserted.length > 0) {
      await audit(req, {
        action: 'attendance.punched_in',
        actorUserId: user.id,
        entityType: 'attendance',
        entityId: inserted[0].id,
        metadata: { employeeId: user.employeeId, workDate: today, source: 'login' },
      });
    }
  } catch (err) {
    // Only the error code and message: no request body, no session, no credentials.
    const { code, message } = err as { code?: string; message?: string };
    console.error(`Automatic punch-in failed for user ${user.id}: ${code ?? ''} ${message ?? ''}`.trim());
  }
}
