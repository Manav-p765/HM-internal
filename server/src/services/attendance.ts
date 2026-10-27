import { istDate, WORKDAY_START_IST } from './clock.js';

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

// The instant the employee's working day `workDate` starts.
export function workDayStart(workDate: string, hours: WorkingHours): Date {
  const istMidnight = Date.parse(`${workDate}T00:00:00Z`) - IST_OFFSET_MINUTES * MINUTE;
  return new Date(istMidnight + dayStartOffsetMinutes(hours) * MINUTE);
}

// Until when a record is the current shift (exclusive), or null without working hours: the late buffer after
// the later of the scheduled shift end and a full shift length from the punch-in. A late or early punch-in
// (allowed, flagged) still gets a whole shift: it used to turn "incomplete" while the employee was working,
// and one before the working day's start could no longer be punched out at all.
function shiftCurrentUntil(record: { workDate: string; punchIn: Date }, hours: WorkingHours): Date | null {
  const shift = shiftWindow(record.workDate, hours);
  if (!shift) return null;
  const length = shift.end.getTime() - shift.start.getTime();
  return new Date(Math.max(shift.end.getTime(), record.punchIn.getTime() + length) + SHIFT_LATE_BUFFER_MINUTES * MINUTE);
}

// The record is still the employee's current (open) shift at `at`.
export function isOpenShift(record: { workDate: string; punchIn: Date; punchOut: Date | null }, hours: WorkingHours, at: Date): boolean {
  if (record.punchOut !== null) return false;
  const until = shiftCurrentUntil(record, hours);
  return until ? at < until : at.getTime() - record.punchIn.getTime() < MAX_SHIFT_HOURS * 60 * MINUTE;
}

// SQL twins of the functions above. `a` is an attendance_records alias, `e` the employees row it belongs to,
// `at` a timestamptz parameter.
const shiftLengthSql = (e: string) =>
  `(CASE WHEN ${e}.shift_end >= ${e}.shift_start THEN ${e}.shift_end - ${e}.shift_start
         ELSE ${e}.shift_end - ${e}.shift_start + interval '24 hours' END)`;

export const openShiftSql = (a: string, e: string, at: string) => `
  (${a}.punch_out IS NULL AND CASE
     WHEN ${e}.shift_start IS NULL THEN ${a}.punch_in > ${at}::timestamptz - interval '${MAX_SHIFT_HOURS} hours'
     ELSE ${at}::timestamptz < GREATEST(
            (${a}.work_date + ${e}.shift_start + ${shiftLengthSql(e)}) AT TIME ZONE 'Asia/Kolkata',
            ${a}.punch_in + ${shiftLengthSql(e)})
          + interval '${SHIFT_LATE_BUFFER_MINUTES} minutes'
   END)`;

// The employee's working day at `at` in SQL (same rule as employeeWorkDate).
export const employeeWorkDateSql = (e: string, at: string) => `
  ((${at}::timestamptz AT TIME ZONE 'Asia/Kolkata') - make_interval(mins => CASE
     WHEN ${e}.shift_start IS NULL THEN ${WORKDAY_START_IST.hour * 60 + WORKDAY_START_IST.minute}
     ELSE (extract(epoch FROM ${e}.shift_start) / 60)::int - ${SHIFT_EARLY_BUFFER_MINUTES} END))::date`;

// Punching in is the employee's own action (POST /api/attendance/me/punch-in; migration 016). Nothing punches
// anyone in automatically: signing in, a heartbeat or opening a page never creates a record.

// A punch-in more than this long after the shift start is late.
export const LATE_AFTER_MINUTES = 30;

// The scheduled shift of a working day: start and end instants (null without working hours).
export function shiftWindow(workDate: string, hours: WorkingHours): { start: Date; end: Date } | null {
  if (!hours.shiftStart || !hours.shiftEnd) return null;
  const start = minutesOf(hours.shiftStart);
  const length = (minutesOf(hours.shiftEnd) - start + 1440) % 1440;
  const istMidnight = Date.parse(`${workDate}T00:00:00Z`) - IST_OFFSET_MINUTES * MINUTE;
  return { start: new Date(istMidnight + start * MINUTE), end: new Date(istMidnight + (start + length) * MINUTE) };
}

// The window in which the Punch In prompt is shown: from the early buffer before the shift start to its end.
export function inPunchInWindow(at: Date, workDate: string, hours: WorkingHours): boolean {
  const shift = shiftWindow(workDate, hours);
  if (!shift) return true; // no working hours: the whole default working day
  return at.getTime() >= shift.start.getTime() - SHIFT_EARLY_BUFFER_MINUTES * MINUTE && at <= shift.end;
}

// Derived, never stored: how late the punch-in was (minutes after the shift start, only beyond
// LATE_AFTER_MINUTES) and whether it fell outside the shift window altogether (allowed, flagged for review).
// Without working hours nothing is flagged.
export function punchFlags(
  record: { workDate: string; punchIn: Date },
  hours: WorkingHours,
): { lateMinutes: number | null; outsideHours: boolean } {
  const shift = shiftWindow(record.workDate, hours);
  if (!shift) return { lateMinutes: null, outsideHours: false };
  const t = record.punchIn.getTime();
  const outsideHours = t < shift.start.getTime() - SHIFT_EARLY_BUFFER_MINUTES * MINUTE || t > shift.end.getTime();
  const after = Math.floor((t - shift.start.getTime()) / MINUTE);
  return { lateMinutes: !outsideHours && after > LATE_AFTER_MINUTES ? after : null, outsideHours };
}
