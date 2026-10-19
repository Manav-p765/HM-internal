import type { Request } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { isWeekend, now, workDate } from '../services/clock.js';
import { createRouter, STAFF } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { isoDate } from './shared.js';
import { dayStatus } from '../services/availability.js';
import { isOpenShift, openShiftSql } from '../services/attendance.js';

// Attendance: one row per employee per working day (06:00-05:59 IST, clock.workDate: shifts are mostly at
// night). Rows are created by the automatic punch-in at login (services/attendance.ts) or by an
// admin/manager correction; employees can only punch out.
// "Today" and every timestamp come from the server clock (services/clock.ts), never from the browser.
// Clients are refused everywhere.
export const attendanceRouter = createRouter();

// ---------------------------------------------------------------------------
// Row shaping
// ---------------------------------------------------------------------------
const RECORD_COLUMNS = `
  a.id, a.employee_id AS "employeeId", a.work_date AS "workDate", a.punch_in AS "punchIn", a.punch_out AS "punchOut",
  a.source, a.note, (a.updated_by IS NOT NULL) AS corrected`;

interface RecordRow {
  id: string;
  employeeId: string;
  workDate: string;
  punchIn: Date;
  punchOut: Date | null;
  source: 'login' | 'manual';
  note: string | null;
  corrected: boolean;
}

// Minutes worked: closed records from punch in to out; an open shift up to now; a record left open longer
// than a shift can last (MAX_SHIFT_HOURS: forgot to punch out) is incomplete (null).
function workedMinutes(record: Pick<RecordRow, 'punchIn' | 'punchOut'>, at: Date): number | null {
  if (record.punchOut) return Math.floor((record.punchOut.getTime() - record.punchIn.getTime()) / 60000);
  if (isOpenShift(record, at)) return Math.max(0, Math.floor((at.getTime() - record.punchIn.getTime()) / 60000));
  return null;
}

// The employee's current shift ($1 employee, $2 working day, $3 now): the open shift if there is one (it may
// have started on the previous working day, e.g. a night shift still running after 06:00), otherwise this
// working day's record, open or closed.
const CURRENT_SHIFT_SQL = `
  WHERE a.employee_id = $1 AND (a.work_date = $2 OR ${openShiftSql('a', '$3')})
  ORDER BY ${openShiftSql('a', '$3')} DESC, a.punch_in DESC LIMIT 1`;

function shape(record: RecordRow, at: Date) {
  return { ...record, workedMinutes: workedMinutes(record, at) };
}

function ownEmployeeId(req: Request): string {
  const id = req.user!.employeeId;
  if (!id) throw new HttpError(404, 'Your account is not linked to an employee record', 'NOT_LINKED');
  return id;
}

const notFound = () => new HttpError(404, 'Attendance record not found', 'NOT_FOUND');

// ---------------------------------------------------------------------------
// GET /api/attendance/me/today  (employee): the current shift's record, and any approved leave covering
// the current working day (`date`)
// ---------------------------------------------------------------------------
attendanceRouter.get('/me/today', ['employee'], async (req, res) => {
  const employeeId = ownEmployeeId(req);
  const at = now();
  const today = workDate(at);
  const [[record], [leave]] = await Promise.all([
    query<RecordRow>(`SELECT ${RECORD_COLUMNS} FROM attendance_records a ${CURRENT_SHIFT_SQL}`, [employeeId, today, at]),
    query(
      `SELECT l.id, l.leave_type AS "leaveType", l.day_type AS "dayType", l.half_day_period AS "halfDayPeriod"
         FROM leave_requests l
        WHERE l.employee_id = $1 AND l.status = 'approved' AND $2::date BETWEEN l.start_date AND l.end_date
        ORDER BY (l.day_type = 'full') DESC LIMIT 1`,
      [employeeId, today],
    ),
  ]);
  res.json({ date: today, serverTime: at.toISOString(), record: record ? shape(record, at) : null, leave: leave ?? null });
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
  const month = parsed.data.month ?? workDate(at).slice(0, 7);

  const rows = await query<RecordRow>(
    `SELECT ${RECORD_COLUMNS} FROM attendance_records a
      WHERE a.employee_id = $1 AND a.work_date >= ($2 || '-01')::date AND a.work_date < ($2 || '-01')::date + interval '1 month'
      ORDER BY a.work_date DESC`,
    [employeeId, month],
  );
  const records = rows.map(r => shape(r, at));
  res.json({
    month,
    today: workDate(at),
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
// is closed after midnight or after 06:00 too). Only this explicit call (and an admin/manager correction)
// ever sets punch_out: sign-out, heartbeats, closing the tab or a session ending never do.
// ---------------------------------------------------------------------------
attendanceRouter.post('/me/punch-out', ['employee'], async (req, res) => {
  const employeeId = ownEmployeeId(req);
  const at = now();

  const record = await withTransaction(async client => {
    const current = (
      await client.query<RecordRow>(`SELECT ${RECORD_COLUMNS} FROM attendance_records a ${CURRENT_SHIFT_SQL} FOR UPDATE`, [
        employeeId,
        workDate(at),
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

interface RosterRow {
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
            e.avatar_url AS "avatarUrl",
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

  const employees = rows.map(row => {
    const record = row.record
      ? shape({ ...row.record, punchIn: new Date(row.record.punchIn), punchOut: row.record.punchOut ? new Date(row.record.punchOut) : null }, at)
      : null;
    // One shared rule with availability: approved full-day leave wins over a punch (times still returned).
    const status = dayStatus({ onFullDayLeave: row.leave?.dayType === 'full', punchedIn: record !== null });
    return { ...row, record, status };
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
    },
  });
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
    `SELECT ${RECORD_COLUMNS} FROM attendance_records a WHERE a.employee_id = $1 AND a.work_date = $2`,
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
  if (date > workDate(at)) throw invalid('punchIn', 'You cannot record attendance for a future date');
  // Working days run 06:00-05:59 IST: a 01:30 punch-in on the 15th belongs to the 14th.
  if (workDate(body.punchIn) !== date) {
    throw invalid('punchIn', 'Punch in must fall in the selected working day (06:00 to 05:59 IST)');
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
        `SELECT ${RECORD_COLUMNS} FROM attendance_records a WHERE a.employee_id = $1 AND a.work_date = $2 FOR UPDATE`,
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
    const after = (await client.query<RecordRow>(`SELECT ${RECORD_COLUMNS} FROM attendance_records a WHERE a.id = $1`, [id])).rows[0];
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
