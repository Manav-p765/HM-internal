import { query } from '../db.js';
import { istDate, now as clockNow } from './clock.js';

// Today's availability of an employee. The ONLY place these rules live; every screen that shows a
// status (staff directory, client portal team) asks this module.
export type Availability = 'on_leave' | 'online' | 'available' | 'not_in_today';

// A heartbeat is sent every 60 s while the employee's tab is visible; 5 minutes without one = not online.
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export interface AvailabilityFacts {
  onFullDayLeave: boolean; // an approved full-day leave covers today (half days do not count)
  punchedIn: boolean; // has an attendance record for today
  punchedOut: boolean; // ...and it is closed
  lastSeenAt: Date | null; // last presence heartbeat
}

// The rules, in order:
//   1. approved full-day leave covering today         -> on_leave
//   2. punched in today, not punched out, heartbeat
//      within the last 5 minutes                      -> online
//   3. punched in today (open or closed)              -> available
//   4. otherwise                                      -> not_in_today
export function deriveAvailability(facts: AvailabilityFacts, at: Date): Availability {
  if (facts.onFullDayLeave) return 'on_leave';
  if (
    facts.punchedIn &&
    !facts.punchedOut &&
    facts.lastSeenAt !== null &&
    at.getTime() - facts.lastSeenAt.getTime() <= ONLINE_WINDOW_MS
  ) {
    return 'online';
  }
  if (facts.punchedIn) return 'available';
  return 'not_in_today';
}

// Availability for each of the given employees at `at` (default: the server clock). Ids that don't exist
// are simply absent from the map. Employees whose login is an admin or manager are never auto-punched in
// (their attendance isn't tracked), so their status is null and screens show no badge for them.
export async function availabilityFor(employeeIds: string[], at: Date = clockNow()): Promise<Map<string, Availability | null>> {
  const result = new Map<string, Availability | null>();
  if (employeeIds.length === 0) return result;
  const today = istDate(at);
  const rows = await query<{
    id: string;
    untracked: boolean;
    lastSeenAt: Date | null;
    onFullDayLeave: boolean;
    punchedIn: boolean;
    punchedOut: boolean;
  }>(
    `SELECT e.id, e.last_seen_at AS "lastSeenAt",
            EXISTS (SELECT 1 FROM users u
                     WHERE u.employee_id = e.id AND u.role IN ('admin', 'manager')) AS untracked,
            EXISTS (SELECT 1 FROM leave_requests l
                     WHERE l.employee_id = e.id AND l.status = 'approved' AND l.day_type = 'full'
                       AND $2::date BETWEEN l.start_date AND l.end_date) AS "onFullDayLeave",
            (a.id IS NOT NULL) AS "punchedIn",
            (a.punch_out IS NOT NULL) AS "punchedOut"
       FROM employees e
       LEFT JOIN attendance_records a ON a.employee_id = e.id AND a.work_date = $2::date
      WHERE e.id = ANY($1::uuid[])`,
    [employeeIds, today],
  );
  for (const row of rows) result.set(row.id, row.untracked ? null : deriveAvailability(row, at));
  return result;
}
