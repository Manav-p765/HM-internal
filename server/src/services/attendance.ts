import type { Request } from 'express';
import { query } from '../db.js';
import type { SessionUser } from '../middleware/auth.js';
import { audit } from './audit.js';
import { describeError } from './errorLog.js';
import { istDate, now, WORKDAY_START_IST } from './clock.js';

// Working hours and shifts. Each employee has a shift in IST wall-clock time (employees.shift_start/end,
// e.g. 21:00 -> 06:00 overnight; most shifts are at night for overseas clients). Around it:
//   - SHIFT_EARLY_BUFFER_MINUTES: the employee's working day starts this long before the shift start, so an
//     early sign-in counts for that day's shift (21:00 shift: the working day runs 19:00 -> 18:59);
//   - SHIFT_LATE_BUFFER_MINUTES: an open record stays the current shift until this long after the shift end
//     (staying late), so a late punch-out still closes it.
// After that an open record is "incomplete" (forgot to punch out): an admin/manager corrects it and the
// next shift can start. Employees without working hours (created before they existed) use the default
// working day (06:00-05:59 IST, clock.workDate) and stay current for MAX_SHIFT_HOURS; admins are reminded
// to set their hours.
export const SHIFT_EARLY_BUFFER_MINUTES = 120;
export const SHIFT_LATE_BUFFER_MINUTES = 180;
export const MAX_SHIFT_HOURS = 16;

export interface WorkingHours {
  shiftStart: string | null; // 'HH:MM' or 'HH:MM:SS' (Postgres time), IST
  shiftEnd: string | null;
}

const minutesOf = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const MINUTE = 60_000;
const IST_OFFSET_MINUTES = 330;

// Minutes after IST midnight at which the employee's working day starts (negative: the evening before).
export function dayStartOffsetMinutes(hours: WorkingHours): number {
  return hours.shiftStart
    ? minutesOf(hours.shiftStart) - SHIFT_EARLY_BUFFER_MINUTES
    : WORKDAY_START_IST.hour * 60 + WORKDAY_START_IST.minute;
}

// 'YYYY-MM-DD' of the employee's working day the instant falls in.
export function employeeWorkDate(at: Date, hours: WorkingHours): string {
  return istDate(new Date(at.getTime() - dayStartOffsetMinutes(hours) * MINUTE));
}

// Until when a record of this working day is the current shift (exclusive), or null without working hours.
function shiftCurrentUntil(workDate: string, hours: WorkingHours): Date | null {
  if (!hours.shiftStart || !hours.shiftEnd) return null;
  const start = minutesOf(hours.shiftStart);
  const length = (minutesOf(hours.shiftEnd) - start + 1440) % 1440;
  const istMidnight = Date.parse(`${workDate}T00:00:00Z`) - IST_OFFSET_MINUTES * MINUTE;
  return new Date(istMidnight + (start + length + SHIFT_LATE_BUFFER_MINUTES) * MINUTE);
}

// The record is still the employee's current (open) shift at `at`.
export function isOpenShift(record: { workDate: string; punchIn: Date; punchOut: Date | null }, hours: WorkingHours, at: Date): boolean {
  if (record.punchOut !== null) return false;
  const until = shiftCurrentUntil(record.workDate, hours);
  return until ? at < until : at.getTime() - record.punchIn.getTime() < MAX_SHIFT_HOURS * 60 * MINUTE;
}

// SQL twins of the functions above. `a` is an attendance_records alias, `e` the employees row it belongs to,
// `at` a timestamptz parameter.
export const openShiftSql = (a: string, e: string, at: string) => `
  (${a}.punch_out IS NULL AND CASE
     WHEN ${e}.shift_start IS NULL THEN ${a}.punch_in > ${at}::timestamptz - interval '${MAX_SHIFT_HOURS} hours'
     ELSE ${at}::timestamptz < ((${a}.work_date + ${e}.shift_start
            + CASE WHEN ${e}.shift_end > ${e}.shift_start THEN ${e}.shift_end - ${e}.shift_start
                   ELSE ${e}.shift_end - ${e}.shift_start + interval '24 hours' END) AT TIME ZONE 'Asia/Kolkata')
          + interval '${SHIFT_LATE_BUFFER_MINUTES} minutes'
   END)`;

// The employee's working day at `at` in SQL (same rule as employeeWorkDate).
export const employeeWorkDateSql = (e: string, at: string) => `
  ((${at}::timestamptz AT TIME ZONE 'Asia/Kolkata') - make_interval(mins => CASE
     WHEN ${e}.shift_start IS NULL THEN ${WORKDAY_START_IST.hour * 60 + WORKDAY_START_IST.minute}
     ELSE (extract(epoch FROM ${e}.shift_start) / 60)::int - ${SHIFT_EARLY_BUFFER_MINUTES} END))::date`;

// Automatic punch-in: an employee-role user with a linked, active employee record gets a record for their
// current working day on a successful login or a presence heartbeat (POST). Never from a GET. Nothing is
// created while the employee still has an open shift (a night shift running past midnight stays one
// record), nor when the working day already has a record (closed or open), so a tab left open after
// punching out never starts a second shift. Idempotent (ON CONFLICT DO NOTHING); punch_in is the actual
// creation time. The session remembers the working day it checked so the insert runs once per session per
// working day. Never throws: a failure is logged (no secrets) and the caller carries on.
export async function autoPunchIn(req: Request, user: SessionUser): Promise<void> {
  if (user.role !== 'employee' || !user.employeeId) return;
  const at = now();

  try {
    const [employee] = await query<WorkingHours>(
      `SELECT shift_start::text AS "shiftStart", shift_end::text AS "shiftEnd" FROM employees WHERE id = $1`,
      [user.employeeId],
    );
    if (!employee) return;
    const day = employeeWorkDate(at, employee);
    if (req.session.punchCheckedOn === day) return;

    const inserted = await query<{ id: string }>(
      `INSERT INTO attendance_records (employee_id, work_date, punch_in, source, created_by)
       SELECT e.id, $2::date, $3, 'login', $4 FROM employees e
        WHERE e.id = $1 AND e.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM attendance_records o WHERE o.employee_id = e.id AND ${openShiftSql('o', 'e', '$3')})
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
