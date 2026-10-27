import type { Request } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { isWeekend, now, workDate } from '../services/clock.js';
import { createRouter, STAFF } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { isoDate } from './shared.js';
import { dayStatus } from '../services/availability.js';
import {
  employeeWorkDate,
  inPunchInWindow,
  isOpenShift,
  openShiftSql,
  punchFlags,
  type WorkingHours,
  workDayStart,
} from '../services/attendance.js';

// Attendance: one row per employee per working day. The working day follows the employee's working hours
// (services/attendance.ts: it starts 2 h before their shift; without hours, 06:00-05:59 IST), so a night
// shift is one record. Rows are created by the employee's own Punch In (any time: a punch outside the shift
// window is allowed and flagged) or by an admin/manager correction; the employee punches out themselves.
// Late / outside-hours flags are derived from the working hours (punchFlags), never stored.
// "Today" and every timestamp come from the server clock (services/clock.ts), never from the browser.
// Clients are refused everywhere.
export const attendanceRouter = createRouter();

// ---------------------------------------------------------------------------
// Row shaping
// ---------------------------------------------------------------------------
// Records are read with their employee's working hours (needed for the shift rules, never returned).
const RECORD_FROM = `attendance_records a JOIN employees e ON e.id = a.employee_id`;
const RECORD_COLUMNS = `
  a.id, a.employee_id AS "employeeId", a.work_date AS "workDate", a.punch_in AS "punchIn", a.punch_out AS "punchOut",
  a.source, a.note, (a.updated_by IS NOT NULL) AS corrected,
  e.shift_start::text AS "shiftStart", e.shift_end::text AS "shiftEnd"`;

interface RecordRow extends WorkingHours {
  id: string;
  employeeId: string;
  workDate: string;
  punchIn: Date;
  punchOut: Date | null;
  source: 'login' | 'manual' | 'punch';
  note: string | null;
  corrected: boolean;
}

// Minutes worked: closed records from punch in to out; the current (open) shift up to now; a record left
// open past its shift and the late buffer (forgot to punch out) is incomplete (null).
function workedMinutes(record: RecordRow, at: Date): number | null {
  if (record.punchOut) return Math.floor((record.punchOut.getTime() - record.punchIn.getTime()) / 60000);
  if (isOpenShift(record, record, at)) return Math.max(0, Math.floor((at.getTime() - record.punchIn.getTime()) / 60000));
  return null;
}

// The employee's current shift ($1 employee, $2 their working day, $3 now): the open shift if there is one
// (it may have started on the previous working day: a night shift running late), otherwise this working
// day's record, open or closed.
const CURRENT_SHIFT_SQL = `
  WHERE a.employee_id = $1 AND (a.work_date = $2 OR ${openShiftSql('a', 'e', '$3')})
  ORDER BY ${openShiftSql('a', 'e', '$3')} DESC, a.punch_in DESC LIMIT 1`;

function shape(record: RecordRow, at: Date) {
  const { shiftStart: _start, shiftEnd: _end, ...rest } = record;
  return { ...rest, workedMinutes: workedMinutes(record, at), ...punchFlags(record, record) };
}

// 'HH:MM' -> 'HH:MM' (Postgres time text is 'HH:MM:SS').
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

async function workingHoursOf(employeeId: string): Promise<WorkingHours | undefined> {
  const [row] = await query<WorkingHours>(
    `SELECT shift_start::text AS "shiftStart", shift_end::text AS "shiftEnd" FROM employees WHERE id = $1`,
    [employeeId],
  );
  return row;
}

function ownEmployeeId(req: Request): string {
  const id = req.user!.employeeId;
  if (!id) throw new HttpError(404, 'Your account is not linked to an employee record', 'NOT_LINKED');
  return id;
}

const notFound = () => new HttpError(404, 'Attendance record not found', 'NOT_FOUND');

// ---------------------------------------------------------------------------
// GET /api/attendance/me/today  (employee): the current shift's record, the employee's working hours
// (`shift`, null when not set yet), the shift just closed (`lastShift`, see todayFor), any approved leave
// covering their current working day (`date`) and the reminder `punchInDue`
// ---------------------------------------------------------------------------
attendanceRouter.get('/me/today', ['employee'], async (req, res) => {
  const today = await todayFor(ownEmployeeId(req), now());
  if (!today) throw new HttpError(404, 'Your account is not linked to an employee record', 'NOT_LINKED');
  res.json(today);
});

// The employee's current shift and what to remind them of (also used by the bell, routes/notifications.ts).
export async function todayFor(employeeId: string, at: Date) {
  const hours = await workingHoursOf(employeeId);
  if (!hours) return null;
  const today = employeeWorkDate(at, hours);
  const [[record], [leave]] = await Promise.all([
    query<RecordRow>(`SELECT ${RECORD_COLUMNS} FROM ${RECORD_FROM} ${CURRENT_SHIFT_SQL}`, [employeeId, today, at]),
    query(
      `SELECT l.id, l.leave_type AS "leaveType", l.day_type AS "dayType", l.half_day_period AS "halfDayPeriod"
         FROM leave_requests l
        WHERE l.employee_id = $1 AND l.status = 'approved' AND $2::date BETWEEN l.start_date AND l.end_date
        ORDER BY (l.day_type = 'full') DESC LIMIT 1`,
      [employeeId, today],
    ),
  ]);
  // A shift of an earlier working day that was punched out during this one (a night shift closed after the
  // working day rolled over): shown as "last shift" so the punch-out is visibly recorded, while `record` stays
  // null and the employee can still punch in for this working day.
  const [lastShift] = record
    ? []
    : await query<RecordRow>(
        `SELECT ${RECORD_COLUMNS} FROM ${RECORD_FROM}
          WHERE a.employee_id = $1 AND a.work_date < $2 AND a.punch_out >= $3
          ORDER BY a.punch_out DESC LIMIT 1`,
        [employeeId, today, workDayStart(today, hours)],
      );
  const shift = hours.shiftStart ? { start: hhmm(hours.shiftStart), end: hhmm(hours.shiftEnd) } : null;
  return {
    date: today,
    serverTime: at.toISOString(),
    shift,
    record: record ? shape(record, at) : null,
    lastShift: lastShift ? shape(lastShift, at) : null,
    leave: leave ?? null,
    ...punchPrompts(record, leave, today, hours, at),
  };
}

// What to remind the employee of (the top bar and the bell): punch in while their shift window is open and
// nothing is recorded yet (not on a full-day leave). There is no punch-out reminder: punching out is the
// employee's own decision, whenever they stop working.
function punchPrompts(
  record: RecordRow | undefined,
  leave: { dayType?: string } | undefined,
  today: string,
  hours: WorkingHours,
  at: Date,
): { punchInDue: boolean } {
  return { punchInDue: !record && leave?.dayType !== 'full' && inPunchInWindow(at, today, hours) };
}

// ---------------------------------------------------------------------------
// POST /api/attendance/me/punch-in  (employee): starts the shift of their current working day. Allowed at
// any time (a punch outside the shift window is flagged, not refused), once per working day, and never while
// a shift is still open (a night shift running past midnight).
// ---------------------------------------------------------------------------
attendanceRouter.post('/me/punch-in', ['employee'], async (req, res) => {
  const employeeId = ownEmployeeId(req);
  const at = now();
  const hours = await workingHoursOf(employeeId);
  if (!hours) throw new HttpError(404, 'Your account is not linked to an employee record', 'NOT_LINKED');
  const day = employeeWorkDate(at, hours);

  const record = await withTransaction(async client => {
    // Serialises two clicks (or two tabs) on the same employee.
    const employee = (await client.query<{ status: string }>('SELECT status FROM employees WHERE id = $1 FOR UPDATE', [employeeId])).rows[0];
    if (!employee || employee.status === 'inactive') throw new HttpError(409, 'Your employee record is not active', 'EMPLOYEE_INACTIVE');
    const current = (await client.query<RecordRow>(`SELECT ${RECORD_COLUMNS} FROM ${RECORD_FROM} ${CURRENT_SHIFT_SQL}`, [employeeId, day, at])).rows[0];
    if (current && !current.punchOut && isOpenShift(current, hours, at)) {
      throw new HttpError(409, 'You are already punched in', 'ALREADY_PUNCHED_IN');
    }
    if (current && current.workDate === day) {
      throw new HttpError(409, 'This shift is already recorded. Ask a manager if it needs changing.', 'ALREADY_RECORDED');
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO attendance_records (employee_id, work_date, punch_in, source, created_by)
       VALUES ($1, $2, $3, 'punch', $4) RETURNING id`,
      [employeeId, day, at, req.user!.id],
    );
    return (await client.query<RecordRow>(`SELECT ${RECORD_COLUMNS} FROM ${RECORD_FROM} WHERE a.id = $1`, [inserted.rows[0].id])).rows[0];
  });

  const flags = punchFlags(record, hours);
  await audit(req, {
    action: 'attendance.punched_in',
    entityType: 'attendance',
    entityId: record.id,
    metadata: { employeeId, workDate: day, source: 'punch', late: flags.lateMinutes !== null, outsideHours: flags.outsideHours },
  });
  res.status(201).json({ record: shape(record, at) });
});

// ---------------------------------------------------------------------------
// GET /api/attendance/me?month=YYYY-MM  (employee): own records for one month (default: this IST month)
// ---------------------------------------------------------------------------
const monthQuery = z.object({
  month: z
    .string()
    .regex(/^(19|2\d)\d{2}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM')
    .optional(),
});

attendanceRouter.get('/me', ['employee'], async (req, res) => {
  const employeeId = ownEmployeeId(req);
  const parsed = monthQuery.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  const at = now();
  const hours = await workingHoursOf(employeeId);
  const today = hours ? employeeWorkDate(at, hours) : workDate(at);
  const month = parsed.data.month ?? today.slice(0, 7);

  const rows = await query<RecordRow>(
    `SELECT ${RECORD_COLUMNS} FROM ${RECORD_FROM}
      WHERE a.employee_id = $1 AND a.work_date >= ($2 || '-01')::date AND a.work_date < ($2 || '-01')::date + interval '1 month'
      ORDER BY a.work_date DESC`,
    [employeeId, month],
  );
  const records = rows.map(r => shape(r, at));
  res.json({
    month,
    today,
    records,
    summary: {
      daysPresent: records.length,
      totalMinutes: records.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0),
      incomplete: records.filter(r => r.workedMinutes === null).length,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/attendance/me/punch-out  (employee): closes the current shift (CURRENT_SHIFT_SQL: a night shift
// is closed after midnight too, up to the late buffer after its end). Only this explicit call (and an admin/manager correction)
// ever sets punch_out: sign-out, heartbeats, closing the tab or a session ending never do.
// ---------------------------------------------------------------------------
attendanceRouter.post('/me/punch-out', ['employee'], async (req, res) => {
  const employeeId = ownEmployeeId(req);
  const at = now();

  const hours = await workingHoursOf(employeeId);
  if (!hours) throw new HttpError(404, 'Your account is not linked to an employee record', 'NOT_LINKED');

  const record = await withTransaction(async client => {
    const current = (
      await client.query<RecordRow>(`SELECT ${RECORD_COLUMNS} FROM ${RECORD_FROM} ${CURRENT_SHIFT_SQL} FOR UPDATE OF a`, [
        employeeId,
        employeeWorkDate(at, hours),
        at,
      ])
    ).rows[0];
    if (!current) throw new HttpError(409, 'You have not punched in today', 'NOT_PUNCHED_IN');
    if (current.punchOut) throw new HttpError(409, 'You have already punched out today', 'ALREADY_PUNCHED_OUT');
    if (at.getTime() <= current.punchIn.getTime()) {
      throw new HttpError(409, 'Punch out must be after your punch in', 'INVALID_PUNCH_OUT');
    }
    // updated_by stays NULL: it marks admin/manager corrections only.
    await client.query('UPDATE attendance_records SET punch_out = $2 WHERE id = $1', [current.id, at]);
    return { ...current, punchOut: at };
  });

  await audit(req, {
    action: 'attendance.punched_out',
    entityType: 'attendance',
    entityId: record.id,
    metadata: { employeeId, workDate: record.workDate },
  });
  res.json({ record: shape(record, at) });
});

// ---------------------------------------------------------------------------
// GET /api/attendance?date=YYYY-MM-DD  (admin, manager): the whole roster for one date (default today)
// status: present (has a record) | on_leave (approved full-day leave, no record) | absent
// ---------------------------------------------------------------------------
const rosterQuery = z.object({ date: isoDate.optional() });

interface RosterRow extends WorkingHours {
  employeeId: string;
  code: string;
  fullName: string;
  department: string;
  designation: string;
  avatarUrl: string | null;
  record: (Omit<RecordRow, 'punchIn' | 'punchOut'> & { punchIn: string; punchOut: string | null }) | null;
  leave: { leaveType: string; dayType: 'full' | 'half'; halfDayPeriod: string | null } | null;
}

attendanceRouter.get('/', ['admin', 'manager'], async (req, res) => {
  const parsed = rosterQuery.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  const at = now();
  const today = workDate(at);
  const date = parsed.data.date ?? today;

  // Active employees, plus anyone (even inactive now) who has a record on that date. Employees whose
  // login is an admin or manager are left out: they have no automatic punch-in, so they would always
  // count as absent. Employees without a login are included.
  const rows = await query<RosterRow>(
    `SELECT e.id AS "employeeId", e.employee_code AS code, e.full_name AS "fullName", e.department, e.designation,
            e.avatar_url AS "avatarUrl", e.shift_start::text AS "shiftStart", e.shift_end::text AS "shiftEnd",
            CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object(
              'id', a.id, 'employeeId', a.employee_id, 'workDate', a.work_date, 'punchIn', a.punch_in, 'punchOut', a.punch_out,
              'source', a.source, 'note', a.note, 'corrected', a.updated_by IS NOT NULL) END AS record,
            CASE WHEN l.id IS NULL THEN NULL ELSE json_build_object(
              'leaveType', l.leave_type, 'dayType', l.day_type, 'halfDayPeriod', l.half_day_period) END AS leave
       FROM employees e
       LEFT JOIN attendance_records a ON a.employee_id = e.id AND a.work_date = $1::date
       LEFT JOIN LATERAL (
         SELECT l.id, l.leave_type, l.day_type, l.half_day_period FROM leave_requests l
          WHERE l.employee_id = e.id AND l.status = 'approved' AND $1::date BETWEEN l.start_date AND l.end_date
          ORDER BY (l.day_type = 'full') DESC LIMIT 1
       ) l ON true
      WHERE (e.status <> 'inactive' OR a.id IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id AND u.role IN ('admin', 'manager'))
      ORDER BY e.full_name, e.employee_code`,
    [date],
  );

  const employees = rows.map(({ shiftStart, shiftEnd, ...row }) => {
    const record = row.record
      ? shape(
          {
            ...row.record,
            punchIn: new Date(row.record.punchIn),
            punchOut: row.record.punchOut ? new Date(row.record.punchOut) : null,
            shiftStart,
            shiftEnd,
          },
          at,
        )
      : null;
    // One shared rule with availability: approved full-day leave wins over a punch (times still returned).
    const status = dayStatus({ onFullDayLeave: row.leave?.dayType === 'full', punchedIn: record !== null });
    // Working hours (null: not set yet, the default working day applies).
    const shift = shiftStart ? { start: hhmm(shiftStart), end: hhmm(shiftEnd) } : null;
    return { ...row, shift, record, status };
  });

  res.json({
    date,
    today,
    isWeekend: isWeekend(date),
    employees,
    summary: {
      total: employees.length,
      present: employees.filter(e => e.status === 'present').length,
      absent: employees.filter(e => e.status === 'absent').length,
      // Approved full-day leave: not counted as absent.
      onApprovedLeave: employees.filter(e => e.status === 'on_leave').length,
      halfDayLeave: employees.filter(e => e.leave?.dayType === 'half').length,
      // Open shifts recorded on that working day (a night shift still running after 06:00 counts on its own day).
      currentlyWorking: employees.filter(e => e.record && !e.record.punchOut && e.record.workedMinutes !== null).length,
      incomplete: employees.filter(e => e.record && e.record.workedMinutes === null).length,
      late: employees.filter(e => e.record?.lateMinutes != null).length,
      outsideHours: employees.filter(e => e.record?.outsideHours).length,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/attendance/review?days=1..92  (admin, manager): records of the last `days` working days (default
// 30) that need a look: incomplete (forgot to punch out), punched in outside the shift window, or late.
// Records already corrected by an admin/manager are left out. Newest first.
// ---------------------------------------------------------------------------
const reviewQuery = z.object({ days: z.coerce.number().int().min(1).max(92).default(30) });

export async function attendanceNeedingReview(days: number, at: Date) {
  const rows = await query<RecordRow & { fullName: string; code: string }>(
    `SELECT ${RECORD_COLUMNS}, e.full_name AS "fullName", e.employee_code AS code
       FROM ${RECORD_FROM}
      WHERE a.updated_by IS NULL AND a.work_date >= ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date - $2::int
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id AND u.role IN ('admin', 'manager'))
      ORDER BY a.work_date DESC, e.full_name`,
    [at, days],
  );
  return rows
    .map(({ fullName, code, ...r }) => ({ ...shape(r, at), fullName, code }))
    .filter(r => r.workedMinutes === null || r.outsideHours || r.lateMinutes !== null)
    .map(r => ({ ...r, reasons: [...(r.workedMinutes === null ? ['incomplete'] : []), ...(r.outsideHours ? ['outside_hours'] : []), ...(r.lateMinutes !== null ? ['late'] : [])] }));
}

attendanceRouter.get('/review', ['admin', 'manager'], async (req, res) => {
  const parsed = reviewQuery.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  const records = await attendanceNeedingReview(parsed.data.days, now());
  res.json({ days: parsed.data.days, records });
});

// ---------------------------------------------------------------------------
// /api/attendance/:employeeId/:date  (admin, manager)
// ---------------------------------------------------------------------------
function parseTarget(req: Request): { employeeId: string; date: string } {
  const employeeId = z.uuid().safeParse(req.params.employeeId);
  const date = isoDate.safeParse(req.params.date);
  if (!employeeId.success || !date.success) throw notFound();
  return { employeeId: employeeId.data, date: date.data };
}

async function correctionHistory(recordId: string) {
  return query(
    `SELECT al.id, al.created_at AS "createdAt", al.metadata->'before' AS before, al.metadata->'after' AS after,
            coalesce(ae.full_name, initcap(au.role)) AS "actorName", au.role AS "actorRole"
       FROM audit_logs al
       LEFT JOIN users au ON au.id = al.actor_user_id
       LEFT JOIN employees ae ON ae.id = au.employee_id
      WHERE al.entity_type = 'attendance' AND al.entity_id = $1 AND al.action = 'attendance.corrected'
      ORDER BY al.created_at DESC, al.id`,
    [recordId],
  );
}

// GET: one record (or null) with its correction history from the audit log. Admins and managers can read
// anyone's; an employee only their own (anyone else's is a 404, identical to a missing employee).
attendanceRouter.get('/:employeeId/:date', STAFF, async (req, res) => {
  const { employeeId, date } = parseTarget(req);
  if (req.user!.role === 'employee' && req.user!.employeeId !== employeeId) throw notFound();
  const [employee] = await query(`SELECT e.id, e.full_name AS "fullName", e.employee_code AS code FROM employees e WHERE e.id = $1`, [
    employeeId,
  ]);
  if (!employee) throw notFound();
  const [record] = await query<RecordRow>(
    `SELECT ${RECORD_COLUMNS} FROM ${RECORD_FROM} WHERE a.employee_id = $1 AND a.work_date = $2`,
    [employeeId, date],
  );
  const at = now();
  res.json({ employee, date, record: record ? shape(record, at) : null, history: record ? await correctionHistory(record.id) : [] });
});

// PUT: manual correction (creates the record if there is none, e.g. someone who forgot to sign in).
// Times are full ISO timestamps with an offset; the UI sends IST (+05:30).
const timestamp = z.iso.datetime({ offset: true, message: 'Enter a valid date and time' }).transform(v => new Date(v));
const correctionSchema = z.object({
  punchIn: timestamp,
  punchOut: timestamp.nullish().transform(v => v ?? null),
  note: z.string().trim().min(1, 'A reason for the correction is required').max(500),
});

attendanceRouter.put('/:employeeId/:date', ['admin', 'manager'], async (req, res) => {
  const { employeeId, date } = parseTarget(req);
  const body = parseBody(correctionSchema, req.body);
  const at = now();

  const invalid = (path: string, message: string) => new HttpError(400, message, 'VALIDATION_ERROR', [{ path, message }]);
  const hours = await workingHoursOf(employeeId);
  if (!hours) throw notFound();
  if (date > employeeWorkDate(at, hours)) throw invalid('punchIn', 'You cannot record attendance for a future date');
  // The working day follows the employee's hours (from 2 h before the shift start; without hours 06:00-05:59
  // IST): a 01:30 punch-in of a 21:00 shift belongs to the day before.
  if (employeeWorkDate(body.punchIn, hours) !== date) {
    throw invalid(
      'punchIn',
      hours.shiftStart
        ? `Punch in must fall in this employee's working day (from 2 hours before their ${hhmm(hours.shiftStart)} shift)`
        : 'Punch in must fall in the selected working day (06:00 to 05:59 IST)',
    );
  }
  if (body.punchIn > at) throw invalid('punchIn', 'Punch in cannot be in the future');
  if (body.punchOut) {
    if (body.punchOut <= body.punchIn) throw invalid('punchOut', 'Punch out must be after punch in');
    if (body.punchOut > at) throw invalid('punchOut', 'Punch out cannot be in the future');
    if (body.punchOut.getTime() - body.punchIn.getTime() > 24 * 60 * 60 * 1000) {
      throw invalid('punchOut', 'A shift cannot be longer than 24 hours');
    }
  }

  // Nobody corrects their own attendance (managers and admins linked to an employee record included).
  if (req.user!.employeeId === employeeId) {
    throw new HttpError(400, 'You cannot correct your own attendance', 'CANNOT_CORRECT_OWN');
  }

  const { record, before } = await withTransaction(async client => {
    const employee = (await client.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employeeId])).rows[0];
    if (!employee) throw notFound();
    const current = (
      await client.query<RecordRow>(
        `SELECT ${RECORD_COLUMNS} FROM ${RECORD_FROM} WHERE a.employee_id = $1 AND a.work_date = $2 FOR UPDATE OF a`,
        [employeeId, date],
      )
    ).rows[0];

    let id: string;
    if (current) {
      await client.query(
        'UPDATE attendance_records SET punch_in = $2, punch_out = $3, note = $4, updated_by = $5 WHERE id = $1',
        [current.id, body.punchIn, body.punchOut, body.note, req.user!.id],
      );
      id = current.id;
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO attendance_records (employee_id, work_date, punch_in, punch_out, source, note, created_by, updated_by)
         VALUES ($1, $2, $3, $4, 'manual', $5, $6, $6) RETURNING id`,
        [employeeId, date, body.punchIn, body.punchOut, body.note, req.user!.id],
      );
      id = inserted.rows[0].id;
    }
    const after = (await client.query<RecordRow>(`SELECT ${RECORD_COLUMNS} FROM ${RECORD_FROM} WHERE a.id = $1`, [id])).rows[0];
    return { record: after, before: current ?? null };
  });

  const snapshot = (r: RecordRow | null) =>
    r && { punchIn: r.punchIn.toISOString(), punchOut: r.punchOut ? r.punchOut.toISOString() : null, note: r.note };
  await audit(req, {
    action: 'attendance.corrected',
    entityType: 'attendance',
    entityId: record.id,
    metadata: { employeeId, workDate: date, created: before === null, before: snapshot(before), after: snapshot(record) },
  });
  res.json({ record: shape(record, at), history: await correctionHistory(record.id) });
});
