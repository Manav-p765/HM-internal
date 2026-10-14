import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { countWeekdays, isWeekend, istDate, now } from '../services/clock.js';
import { createRouter, STAFF } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { isoDate, likePattern, optionalText, pageQuery } from './shared.js';

// Leave requests. Any staff member with a linked employee record applies for their own leave; admins and
// managers review. Nobody reviews their own request. Only pending requests can be edited, cancelled or
// reviewed. Reasons are only ever returned to the owner and to admins/managers (no other route exposes
// leave rows). Clients are refused everywhere.
export const leavesRouter = createRouter();

const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid', 'other'] as const;
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

// ---------------------------------------------------------------------------
// Row shaping
// ---------------------------------------------------------------------------
const LEAVE_SELECT = `
  SELECT l.id, l.employee_id AS "employeeId", e.full_name AS "employeeName", e.employee_code AS "employeeCode",
         e.department, e.avatar_url AS "employeeAvatarUrl",
         l.leave_type AS "leaveType", l.start_date AS "startDate", l.end_date AS "endDate", l.day_type AS "dayType",
         l.half_day_period AS "halfDayPeriod", l.total_days::float8 AS "totalDays", l.reason, l.status,
         l.created_at AS "appliedAt", l.updated_at AS "updatedAt", l.reviewed_at AS "reviewedAt",
         CASE WHEN ru.id IS NULL THEN NULL ELSE coalesce(re.full_name, initcap(ru.role)) END AS "reviewedByName",
         l.reviewer_comment AS "reviewerComment", l.rejection_reason AS "rejectionReason"
    FROM leave_requests l
    JOIN employees e ON e.id = l.employee_id
    LEFT JOIN users ru ON ru.id = l.reviewed_by
    LEFT JOIN employees re ON re.id = ru.employee_id`;

interface LeaveRow {
  id: string;
  employeeId: string;
  status: (typeof STATUSES)[number];
  [key: string]: unknown;
}

async function getLeave(id: string, client?: PoolClient): Promise<LeaveRow | undefined> {
  const sql = `${LEAVE_SELECT} WHERE l.id = $1`;
  return (client ? (await client.query<LeaveRow>(sql, [id])).rows : await query<LeaveRow>(sql, [id]))[0];
}

const notFound = () => new HttpError(404, 'Leave request not found', 'NOT_FOUND');

function parseId(raw: unknown): string {
  const result = z.uuid().safeParse(raw);
  if (!result.success) throw notFound();
  return result.data;
}

function ownEmployeeId(req: Request): string {
  const id = req.user!.employeeId;
  if (!id) throw new HttpError(404, 'Your account is not linked to an employee record', 'NOT_LINKED');
  return id;
}

// ---------------------------------------------------------------------------
// Validation and the leave rules
// ---------------------------------------------------------------------------
const MAX_SPAN_DAYS = 366;

const leaveFields = {
  leaveType: z.enum(LEAVE_TYPES, 'Choose a leave type'),
  startDate: isoDate,
  endDate: isoDate,
  dayType: z.enum(['full', 'half']).default('full'),
  halfDayPeriod: z.enum(['first', 'second']).nullish(),
  reason: z.string().trim().min(1, 'A reason is required').max(1000),
};

type LeaveInput = {
  leaveType: (typeof LEAVE_TYPES)[number];
  startDate: string;
  endDate: string;
  dayType: 'full' | 'half';
  halfDayPeriod?: 'first' | 'second' | null;
  reason: string;
};

// Cross-field rules, shared by apply and edit.
function checkDates(body: LeaveInput, ctx: z.RefinementCtx) {
  if (body.endDate < body.startDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date cannot be before the start date' });
  }
  if (body.dayType === 'half') {
    if (body.startDate !== body.endDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'A half day must start and end on the same date' });
    }
    if (!body.halfDayPeriod) {
      ctx.addIssue({ code: 'custom', path: ['halfDayPeriod'], message: 'Choose the first or second half' });
    }
  }
  const span = (Date.parse(body.endDate) - Date.parse(body.startDate)) / 86_400_000;
  if (span > MAX_SPAN_DAYS) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'A leave request cannot span more than a year' });
}

const leaveSchema = z.object(leaveFields).superRefine(checkDates);
// No default for dayType here: an omitted field keeps its current value.
const editSchema = z
  .object({ ...leaveFields, dayType: z.enum(['full', 'half']) })
  .partial()
  .refine(body => Object.keys(body).length > 0, 'Nothing to update');

// Weekdays only; a half day is 0.5. Zero (only weekend days) is refused.
function totalDays(body: LeaveInput): number {
  if (body.dayType === 'half') return isWeekend(body.startDate) ? 0 : 0.5;
  return countWeekdays(body.startDate, body.endDate);
}

// Applies the rules that need the database, inside the caller's transaction (the employee row is locked so
// two overlapping requests can't be created concurrently). Returns total_days.
async function checkLeaveRules(client: PoolClient, employeeId: string, body: LeaveInput, excludeId: string | null): Promise<number> {
  const employee = (await client.query<{ status: string }>('SELECT status FROM employees WHERE id = $1 FOR UPDATE', [employeeId])).rows[0];
  if (!employee) throw new HttpError(404, 'Your account is not linked to an employee record', 'NOT_LINKED');
  if (employee.status === 'inactive') throw new HttpError(409, 'Inactive employees cannot apply for leave', 'EMPLOYEE_INACTIVE');

  const days = totalDays(body);
  if (days === 0) {
    throw new HttpError(400, 'The selected dates are all weekend days', 'VALIDATION_ERROR', [
      { path: 'startDate', message: 'The selected dates are all weekend days' },
    ]);
  }

  const overlap = await client.query(
    `SELECT 1 FROM leave_requests
      WHERE employee_id = $1 AND status IN ('pending', 'approved') AND id IS DISTINCT FROM $4::uuid
        AND start_date <= $3::date AND end_date >= $2::date
      LIMIT 1`,
    [employeeId, body.startDate, body.endDate, excludeId],
  );
  if (overlap.rowCount) {
    throw new HttpError(409, 'You already have a pending or approved leave request covering these dates', 'LEAVE_OVERLAP');
  }
  return days;
}

// ---------------------------------------------------------------------------
// GET /api/leaves/me  (staff with a linked employee): own requests + summary
// ---------------------------------------------------------------------------
leavesRouter.get('/me', STAFF, async (req, res) => {
  const employeeId = ownEmployeeId(req);
  const today = istDate(now());
  const leaves = await query<LeaveRow & { startDate: string; endDate: string; totalDays: number }>(
    `${LEAVE_SELECT} WHERE l.employee_id = $1 ORDER BY l.start_date DESC, l.created_at DESC`,
    [employeeId],
  );
  const year = today.slice(0, 4);
  const approved = leaves.filter(l => l.status === 'approved');
  res.json({
    today,
    leaves,
    summary: {
      pending: leaves.filter(l => l.status === 'pending').length,
      approvedDaysThisYear: approved.filter(l => l.startDate.startsWith(year)).reduce((sum, l) => sum + l.totalDays, 0),
      onLeaveToday: approved.some(l => l.startDate <= today && l.endDate >= today),
      upcoming: approved.filter(l => l.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/leaves  (admin, manager)  ?status=&employeeId=&leaveType=&department=&search=&from=&to=&limit=&offset=
// from/to select requests overlapping that date range.
// ---------------------------------------------------------------------------
const listQuery = pageQuery.extend({
  status: z.enum(STATUSES).optional(),
  employeeId: z.uuid().optional(),
  leaveType: z.enum(LEAVE_TYPES).optional(),
  department: z.string().trim().max(80).optional(),
  search: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

leavesRouter.get('/', ['admin', 'manager'], async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  const { status, employeeId, leaveType, department, search, from, to, limit, offset } = parsed.data;

  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };
  if (status) add(p => `l.status = ${p}`, status);
  if (employeeId) add(p => `l.employee_id = ${p}`, employeeId);
  if (leaveType) add(p => `l.leave_type = ${p}`, leaveType);
  if (department) add(p => `e.department = ${p}`, department);
  if (search) add(p => `(e.full_name ILIKE ${p} OR e.employee_code ILIKE ${p})`, likePattern(search));
  if (from) add(p => `l.end_date >= ${p}::date`, from);
  if (to) add(p => `l.start_date <= ${p}::date`, to);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const today = istDate(now());

  const [leaves, [{ total }], [summary]] = await Promise.all([
    query(
      `${LEAVE_SELECT} ${whereSql}
        ORDER BY (l.status = 'pending') DESC, l.start_date DESC, l.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    query<{ total: number }>(
      `SELECT count(*)::int AS total FROM leave_requests l JOIN employees e ON e.id = l.employee_id ${whereSql}`,
      params,
    ),
    // Headline numbers for all requests (not the filtered page).
    query(
      `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
              count(*) FILTER (WHERE status = 'approved')::int AS approved,
              count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
              count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
              count(DISTINCT employee_id) FILTER (
                WHERE status = 'approved' AND day_type = 'full' AND $1::date BETWEEN start_date AND end_date)::int AS "onLeaveToday"
         FROM leave_requests`,
      [today],
    ),
  ]);
  res.json({ today, leaves, total, limit, offset, summary });
});

// ---------------------------------------------------------------------------
// POST /api/leaves  (staff with a linked employee): apply for own leave
// ---------------------------------------------------------------------------
leavesRouter.post('/', STAFF, async (req, res) => {
  const employeeId = ownEmployeeId(req);
  const body = parseBody(leaveSchema, req.body);

  const { id, days } = await withTransaction(async client => {
    const days = await checkLeaveRules(client, employeeId, body, null);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, day_type, half_day_period, total_days, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [employeeId, body.leaveType, body.startDate, body.endDate, body.dayType, body.dayType === 'half' ? body.halfDayPeriod : null, days, body.reason],
    );
    return { id: inserted.rows[0].id, days };
  });

  // The reason is not copied into the audit log.
  await audit(req, {
    action: 'leave.requested',
    entityType: 'leave',
    entityId: id,
    metadata: { employeeId, leaveType: body.leaveType, startDate: body.startDate, endDate: body.endDate, dayType: body.dayType, totalDays: days },
  });
  res.status(201).json({ leave: await getLeave(id) });
});

// ---------------------------------------------------------------------------
// GET /api/leaves/:id  (owner, admin, manager; anyone else gets 404)
// ---------------------------------------------------------------------------
leavesRouter.get('/:id', STAFF, async (req, res) => {
  const leave = await getLeave(parseId(req.params.id));
  const user = req.user!;
  const mayRead = user.role === 'admin' || user.role === 'manager' || (leave && leave.employeeId === user.employeeId);
  if (!leave || !mayRead) throw notFound();
  res.json({ leave });
});

// Locks the caller's own request; someone else's request is a 404, a non-pending one a 409.
async function lockOwnPending(client: PoolClient, id: string, employeeId: string, verb: string) {
  const row = (
    await client.query<{ id: string; status: string } & LeaveInput>(
      `SELECT id, status, leave_type AS "leaveType", start_date AS "startDate", end_date AS "endDate", day_type AS "dayType",
              half_day_period AS "halfDayPeriod", reason
         FROM leave_requests WHERE id = $1 AND employee_id = $2 FOR UPDATE`,
      [id, employeeId],
    )
  ).rows[0];
  if (!row) throw notFound();
  if (row.status !== 'pending') throw new HttpError(409, `Only pending requests can be ${verb}`, 'NOT_PENDING');
  return row;
}

// ---------------------------------------------------------------------------
// PATCH /api/leaves/:id  (own, pending only)
// ---------------------------------------------------------------------------
leavesRouter.patch('/:id', STAFF, async (req, res) => {
  const id = parseId(req.params.id);
  const employeeId = ownEmployeeId(req);
  const changes = parseBody(editSchema, req.body);

  const fields = await withTransaction(async client => {
    const current = await lockOwnPending(client, id, employeeId, 'edited');
    const { status: _status, id: _id, ...currentFields } = current;
    // Validate the merged request with the same rules as a new one.
    const merged = parseBody(leaveSchema, { ...currentFields, ...changes });
    const days = await checkLeaveRules(client, employeeId, merged, id);
    await client.query(
      `UPDATE leave_requests SET leave_type = $2, start_date = $3, end_date = $4, day_type = $5, half_day_period = $6,
              total_days = $7, reason = $8
        WHERE id = $1`,
      [id, merged.leaveType, merged.startDate, merged.endDate, merged.dayType, merged.dayType === 'half' ? merged.halfDayPeriod : null, days, merged.reason],
    );
    return Object.keys(changes);
  });

  await audit(req, { action: 'leave.updated', entityType: 'leave', entityId: id, metadata: { employeeId, fields } });
  res.json({ leave: await getLeave(id) });
});

// ---------------------------------------------------------------------------
// POST /api/leaves/:id/cancel  (own, pending only)
// ---------------------------------------------------------------------------
leavesRouter.post('/:id/cancel', STAFF, async (req, res) => {
  const id = parseId(req.params.id);
  const employeeId = ownEmployeeId(req);
  await withTransaction(async client => {
    await lockOwnPending(client, id, employeeId, 'cancelled');
    await client.query(`UPDATE leave_requests SET status = 'cancelled' WHERE id = $1`, [id]);
  });
  await audit(req, { action: 'leave.cancelled', entityType: 'leave', entityId: id, metadata: { employeeId } });
  res.json({ leave: await getLeave(id) });
});

// ---------------------------------------------------------------------------
// POST /api/leaves/:id/approve { comment? } and /reject { reason }  (admin, manager; never your own)
// ---------------------------------------------------------------------------
const approveSchema = z.object({ comment: optionalText(500) });
const rejectSchema = z.object({ reason: z.string({ message: 'A rejection reason is required' }).trim().min(1, 'A rejection reason is required').max(500) });

async function review(req: Request, decision: 'approved' | 'rejected', text: string | null) {
  const id = parseId(req.params.id);
  const at = now();
  const employeeId = await withTransaction(async client => {
    const leave = (
      await client.query<{ employee_id: string; status: string }>('SELECT employee_id, status FROM leave_requests WHERE id = $1 FOR UPDATE', [id])
    ).rows[0];
    if (!leave) throw notFound();
    if (req.user!.employeeId && leave.employee_id === req.user!.employeeId) {
      throw new HttpError(400, 'You cannot review your own leave request', 'CANNOT_REVIEW_OWN');
    }
    if (leave.status !== 'pending') throw new HttpError(409, 'Only pending requests can be reviewed', 'NOT_PENDING');
    await client.query(
      `UPDATE leave_requests SET status = $2, reviewed_by = $3, reviewed_at = $4, reviewer_comment = $5, rejection_reason = $6
        WHERE id = $1`,
      [id, decision, req.user!.id, at, decision === 'approved' ? text : null, decision === 'rejected' ? text : null],
    );
    return leave.employee_id;
  });
  await audit(req, {
    action: decision === 'approved' ? 'leave.approved' : 'leave.rejected',
    entityType: 'leave',
    entityId: id,
    metadata: { employeeId },
  });
  return getLeave(id);
}

leavesRouter.post('/:id/approve', ['admin', 'manager'], async (req, res) => {
  const { comment } = parseBody(approveSchema, req.body);
  res.json({ leave: await review(req, 'approved', comment) });
});

leavesRouter.post('/:id/reject', ['admin', 'manager'], async (req, res) => {
  const { reason } = parseBody(rejectSchema, req.body);
  res.json({ leave: await review(req, 'rejected', reason) });
});
