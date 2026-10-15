import type { Request } from 'express';
import { query } from '../db.js';
import type { SessionUser } from '../middleware/auth.js';
import { audit } from './audit.js';
import { now, istDate, istMinutesOfDay } from './clock.js';

// No automatic punch-in before this time of day (Asia/Kolkata), so a tab left open overnight or a
// scripted request just after midnight can't start the working day early.
export const AUTO_PUNCH_IN_EARLIEST_IST = { hour: 6, minute: 0 };

// Automatic punch-in: an employee-role user with a linked, active employee record gets today's (IST)
// attendance row on a successful login or a presence heartbeat (POST), at or after the earliest time
// above. Never from a GET. Idempotent (ON CONFLICT DO NOTHING); punch_in is the actual creation time.
// The session remembers the day it succeeded so the insert runs once per session per day; before the
// cutoff nothing is remembered, so the first login/heartbeat after it creates the record.
// Never throws: a failure is logged (no secrets) and the caller carries on.
export async function autoPunchIn(req: Request, user: SessionUser): Promise<void> {
  if (user.role !== 'employee' || !user.employeeId) return;
  const at = now();
  const today = istDate(at);
  if (req.session.punchCheckedOn === today) return;
  const { hour, minute } = AUTO_PUNCH_IN_EARLIEST_IST;
  if (istMinutesOfDay(at) < hour * 60 + minute) return;

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
