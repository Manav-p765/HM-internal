import type { Request } from 'express';
import { query } from '../db.js';
import type { SessionUser } from '../middleware/auth.js';
import { audit } from './audit.js';
import { describeError } from './errorLog.js';
import { now, workDate } from './clock.js';

// A shift is one attendance record, from the punch-in until an explicit punch-out, however many midnights
// (or 06:00 working-day boundaries) it crosses. A record still open this long after its punch-in is no
// longer the current shift: it is "incomplete" (forgot to punch out) and a new one can start.
export const MAX_SHIFT_HOURS = 16;

// SQL: the record is an open shift at $at (a timestamptz parameter).
export const openShiftSql = (alias: string, at: string) =>
  `(${alias}.punch_out IS NULL AND ${alias}.punch_in > ${at}::timestamptz - interval '${MAX_SHIFT_HOURS} hours')`;

export function isOpenShift(record: { punchIn: Date; punchOut: Date | null }, at: Date): boolean {
  return record.punchOut === null && at.getTime() - record.punchIn.getTime() < MAX_SHIFT_HOURS * 60 * 60 * 1000;
}

// Automatic punch-in: an employee-role user with a linked, active employee record gets a record for the
// current working day (06:00-05:59 IST, clock.workDate) on a successful login or a presence heartbeat
// (POST). Never from a GET. Nothing is created while the employee still has an open shift (a night shift
// running past midnight or past 06:00 stays one record), nor when the working day already has a record
// (closed or open), so a tab left open after punching out never starts a second shift.
// Idempotent (ON CONFLICT DO NOTHING); punch_in is the actual creation time. The session remembers the
// working day it checked so the insert runs once per session per working day.
// Never throws: a failure is logged (no secrets) and the caller carries on.
export async function autoPunchIn(req: Request, user: SessionUser): Promise<void> {
  if (user.role !== 'employee' || !user.employeeId) return;
  const at = now();
  const day = workDate(at);
  if (req.session.punchCheckedOn === day) return;

  try {
    const inserted = await query<{ id: string }>(
      `INSERT INTO attendance_records (employee_id, work_date, punch_in, source, created_by)
       SELECT e.id, $2::date, $3, 'login', $4 FROM employees e
        WHERE e.id = $1 AND e.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM attendance_records o WHERE o.employee_id = e.id AND ${openShiftSql('o', '$3')})
       ON CONFLICT (employee_id, work_date) DO NOTHING
       RETURNING id`,
      [user.employeeId, day, at, user.id],
    );
    req.session.punchCheckedOn = day;
    if (inserted.length > 0) {
      await audit(req, {
        action: 'attendance.punched_in',
        actorUserId: user.id,
        entityType: 'attendance',
        entityId: inserted[0].id,
        metadata: { employeeId: user.employeeId, workDate: day, source: 'login' },
      });
    }
  } catch (err) {
    // Only the error class and code: no message (pg messages carry values), body, session or credentials.
    console.error(`Automatic punch-in failed for user ${user.id}: ${describeError(err)}`);
  }
}
