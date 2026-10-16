import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { istDate, now } from '../services/clock.js';
import { deleteUserSessions } from '../middleware/auth.js';
import { createRouter, STAFF } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';

// Employees are never deleted: deactivate / reactivate instead.
// Salary fields (monthlySalary, paymentMethod) are only ever sent to admins.
// Every route declares its roles; client users are refused everywhere (they never see employee records).
export const employeesRouter = createRouter();

const STATUSES = ['active', 'on_leave', 'inactive'] as const;

// ---------------------------------------------------------------------------
// SQL fragments and row shaping
// ---------------------------------------------------------------------------
const EMPLOYEE_COLUMNS = `
  e.id, e.employee_code AS code, e.full_name AS "fullName", e.work_email AS "workEmail", e.phone,
  e.department, e.designation, e.joining_date AS "joiningDate", e.status, e.notes,
  e.avatar_url AS "avatarUrl", e.created_at AS "createdAt", e.updated_at AS "updatedAt",
  e.monthly_salary AS "monthlySalary", e.payment_method AS "paymentMethod"`;

// The employee's login (if any), for the admin/manager views.
const LOGIN_JOIN = `
  LEFT JOIN users u ON u.employee_id = e.id`;
const LOGIN_COLUMNS = `
  CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object(
    'userId', u.id, 'status', u.status, 'mustChangePassword', u.must_change_password, 'lastLoginAt', u.last_login_at
  ) END AS login`;

type EmployeeRow = Record<string, unknown> & { monthlySalary?: unknown; paymentMethod?: unknown };

const SALARY_FIELDS = ['monthlySalary', 'paymentMethod'] as const;

// Removes the salary fields entirely (not just nulls them) unless the caller is an admin.
function forViewer(row: EmployeeRow, req: Request): EmployeeRow {
  if (req.user!.role === 'admin') return row;
  const copy = { ...row };
  for (const field of SALARY_FIELDS) delete copy[field];
  return copy;
}

async function getEmployee(id: string, client?: PoolClient): Promise<EmployeeRow | undefined> {
  const sql = `SELECT ${EMPLOYEE_COLUMNS}, ${LOGIN_COLUMNS} FROM employees e ${LOGIN_JOIN} WHERE e.id = $1`;
  const rows = client ? (await client.query<EmployeeRow>(sql, [id])).rows : await query<EmployeeRow>(sql, [id]);
  return rows[0];
}

function parseId(raw: unknown): string {
  const result = z.uuid().safeParse(raw);
  if (!result.success) throw new HttpError(404, 'Employee not found', 'NOT_FOUND');
  return result.data;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform(v => (v ? v : null)); // '' -> null

// Money arrives as a number or a numeric string and is stored as NUMERIC(14,2); never a float in SQL.
const money = z
  .union([z.number(), z.string().trim()])
  .transform(v => String(v))
  .refine(v => /^\d{1,12}(\.\d{1,2})?$/.test(v), 'Enter an amount with at most 2 decimal places');

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine(v => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Enter a valid date');

// An https:// URL with a host, or an app-relative path starting with a single / (e.g. /avatars/x.jpg).
// Refused: other schemes (http:, javascript:, data:...), protocol-relative //host and /\host (browsers read
// both as another host), backslashes, whitespace and control characters anywhere.
export function isSafeAvatarUrl(v: string): boolean {
  if (/[\\\s\u0000-\u001f\u007f]/.test(v)) return false;
  if (v.startsWith('/')) return !v.startsWith('//');
  if (!/^https:\/\/[^/]/i.test(v)) return false; // the URL parser would read https:///x as host "x"
  try {
    const url = new URL(v);
    return url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

const avatarUrl = z
  .string()
  .trim()
  .max(500)
  .refine(v => v === '' || isSafeAvatarUrl(v), 'Avatar must be an https:// URL or a path starting with /')
  .nullish()
  .transform(v => (v ? v : null));

const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid work email'));

const createSchema = z.object({
  fullName: trimmed(120).min(1, 'Full name is required'),
  workEmail: email,
  phone: optionalText(40),
  department: trimmed(80).min(1, 'Department is required'),
  designation: trimmed(120).min(1, 'Designation is required'),
  joiningDate: isoDate,
  status: z.enum(['active', 'on_leave']).default('active'),
  monthlySalary: money,
  paymentMethod: optionalText(40),
  notes: optionalText(2000),
  avatarUrl,
});

const updateSchema = createSchema
  .extend({ status: z.enum(['active', 'on_leave']) })
  .partial()
  .refine(body => Object.keys(body).length > 0, 'Nothing to update');

// Column for each updatable field.
const COLUMN: Record<string, string> = {
  fullName: 'full_name',
  workEmail: 'work_email',
  phone: 'phone',
  department: 'department',
  designation: 'designation',
  joiningDate: 'joining_date',
  status: 'status',
  monthlySalary: 'monthly_salary',
  paymentMethod: 'payment_method',
  notes: 'notes',
  avatarUrl: 'avatar_url',
};

// Turns a Postgres unique violation on work_email into a 409.
function rethrowEmailTaken(err: unknown): never {
  if ((err as { code?: string; constraint?: string }).code === '23505' && String((err as { constraint?: string }).constraint).includes('work_email')) {
    throw new HttpError(409, 'Another employee already uses this work email', 'EMAIL_TAKEN');
  }
  throw err;
}

// ---------------------------------------------------------------------------
// GET /api/employees  (admin, manager)  ?search=&status=&department=&limit=50&offset=0
// ---------------------------------------------------------------------------
const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(STATUSES).optional(),
  department: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

employeesRouter.get('/', ['admin', 'manager'], async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  const { search, status, department, limit, offset } = parsed.data;

  const where: string[] = [];
  const params: unknown[] = [];
  if (search) {
    params.push(`%${search.replace(/[\\%_]/g, c => `\\${c}`)}%`);
    const p = `$${params.length}`;
    where.push(`(e.full_name ILIKE ${p} OR e.work_email ILIKE ${p} OR e.designation ILIKE ${p} OR e.employee_code ILIKE ${p})`);
  }
  if (status) {
    params.push(status);
    where.push(`e.status = $${params.length}`);
  }
  if (department) {
    params.push(department);
    where.push(`e.department = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows, [{ total }], [summary]] = await Promise.all([
    query<EmployeeRow>(
      `SELECT ${EMPLOYEE_COLUMNS}, ${LOGIN_COLUMNS}
         FROM employees e ${LOGIN_JOIN}
         ${whereSql}
        ORDER BY e.full_name, e.employee_code
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM employees e ${whereSql}`, params),
    // Headline numbers for the whole roster (not the filtered page).
    // onLeaveToday: approved full-day leave covering today (IST), the same rule as attendance and availability.
    query<{ total: number; active: number; onLeave: number; onLeaveToday: number; inactive: number; monthlyPayroll: string }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'active')::int AS active,
              count(*) FILTER (WHERE status = 'on_leave')::int AS "onLeave",
              count(*) FILTER (WHERE status = 'inactive')::int AS inactive,
              count(*) FILTER (WHERE status <> 'inactive' AND EXISTS (
                SELECT 1 FROM leave_requests l
                 WHERE l.employee_id = employees.id AND l.status = 'approved' AND l.day_type = 'full'
                   AND $1::date BETWEEN l.start_date AND l.end_date))::int AS "onLeaveToday",
              coalesce(sum(monthly_salary) FILTER (WHERE status = 'active'), 0)::numeric(14,2)::text AS "monthlyPayroll"
         FROM employees`,
      [istDate(now())],
    ),
  ]);

  const visibleSummary: Record<string, unknown> = { ...summary };
  if (req.user!.role !== 'admin') delete visibleSummary.monthlyPayroll;

  res.json({ employees: rows.map(row => forViewer(row, req)), total, limit, offset, summary: visibleSummary });
});

// ---------------------------------------------------------------------------
// GET /api/employees/directory  (any signed-in staff): no phone, no salary, no inactive people
// ---------------------------------------------------------------------------
employeesRouter.get('/directory', STAFF, async (_req, res) => {
  const employees = await query(
    `SELECT e.id, e.full_name AS "fullName", e.designation, e.department, e.work_email AS "workEmail",
            e.avatar_url AS "avatarUrl", e.status
       FROM employees e
      WHERE e.status <> 'inactive'
      ORDER BY e.full_name`,
  );
  res.json({ employees });
});

// ---------------------------------------------------------------------------
// GET /api/employees/me and PATCH /api/employees/me  (the signed-in user's own record)
// ---------------------------------------------------------------------------
const ME_COLUMNS = `
  e.id, e.employee_code AS code, e.full_name AS "fullName", e.work_email AS "workEmail", e.phone,
  e.department, e.designation, e.joining_date AS "joiningDate", e.status, e.avatar_url AS "avatarUrl"`;

function ownEmployeeId(req: Request): string {
  const id = req.user!.employeeId;
  if (!id) throw new HttpError(404, 'Your account is not linked to an employee record', 'NOT_LINKED');
  return id;
}

employeesRouter.get('/me', STAFF, async (req, res) => {
  const [employee] = await query(`SELECT ${ME_COLUMNS} FROM employees e WHERE e.id = $1`, [ownEmployeeId(req)]);
  if (!employee) throw new HttpError(404, 'Your account is not linked to an employee record', 'NOT_LINKED');
  res.json({ employee });
});

// Staff can change only their own phone and avatar; anything else is rejected, not ignored.
const updateMeSchema = z
  .object({ phone: optionalText(40), avatarUrl })
  .strict()
  .refine(body => Object.keys(body).length > 0, 'Nothing to update');

employeesRouter.patch('/me', STAFF, async (req, res) => {
  const id = ownEmployeeId(req);
  const body = parseBody(updateMeSchema, req.body);
  const fields = Object.keys(body) as (keyof typeof body)[];

  const sets = fields.map((field, i) => `${COLUMN[field]} = $${i + 2}`);
  const updated = await query(`UPDATE employees SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, [
    id,
    ...fields.map(field => body[field]),
  ]);
  if (updated.length === 0) throw new HttpError(404, 'Your account is not linked to an employee record', 'NOT_LINKED');

  await audit(req, { action: 'employee.updated', entityType: 'employee', entityId: id, metadata: { fields, self: true } });
  const [employee] = await query(`SELECT ${ME_COLUMNS} FROM employees e WHERE e.id = $1`, [id]);
  res.json({ employee });
});

// ---------------------------------------------------------------------------
// GET /api/employees/:id  (admin, manager)
// ---------------------------------------------------------------------------
employeesRouter.get('/:id', ['admin', 'manager'], async (req, res) => {
  const employee = await getEmployee(parseId(req.params.id));
  if (!employee) throw new HttpError(404, 'Employee not found', 'NOT_FOUND');
  res.json({ employee: forViewer(employee, req) });
});

// ---------------------------------------------------------------------------
// POST /api/employees  (admin)  — employee_code is assigned here, never by the client
// ---------------------------------------------------------------------------
employeesRouter.post('/', ['admin'], async (req, res) => {
  const body = parseBody(createSchema, req.body);

  const id = await withTransaction(async client => {
    // Serialise code allocation: EMP-001, EMP-002, ... (max + 1 under a transaction-scoped lock).
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('employees.employee_code'))`);
    const next = await client.query<{ code: string }>(
      `SELECT 'EMP-' || lpad((coalesce(max(substring(employee_code FROM 5)::int), 0) + 1)::text, 3, '0') AS code
         FROM employees WHERE employee_code ~ '^EMP-[0-9]+$'`,
    );
    const inserted = await client
      .query<{ id: string }>(
        `INSERT INTO employees (employee_code, full_name, work_email, phone, department, designation, joining_date,
                                status, monthly_salary, payment_method, notes, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [
          next.rows[0].code,
          body.fullName,
          body.workEmail,
          body.phone,
          body.department,
          body.designation,
          body.joiningDate,
          body.status,
          body.monthlySalary,
          body.paymentMethod,
          body.notes,
          body.avatarUrl,
        ],
      )
      .catch(rethrowEmailTaken);
    return inserted.rows[0].id;
  });

  const employee = (await getEmployee(id))!;
  await audit(req, {
    action: 'employee.created',
    entityType: 'employee',
    entityId: id,
    metadata: { code: employee.code, fields: Object.keys(body) },
  });
  res.status(201).json({ employee: forViewer(employee, req) });
});

// ---------------------------------------------------------------------------
// PATCH /api/employees/:id  (admin)
// ---------------------------------------------------------------------------
employeesRouter.patch('/:id', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(updateSchema, req.body);

  const changed = await withTransaction(async client => {
    const current = (await client.query<{ status: string }>('SELECT status FROM employees WHERE id = $1 FOR UPDATE', [id]))
      .rows[0];
    if (!current) throw new HttpError(404, 'Employee not found', 'NOT_FOUND');
    if (current.status === 'inactive' && body.status) {
      throw new HttpError(400, 'Reactivate this employee to change their status', 'EMPLOYEE_INACTIVE');
    }

    const fields = Object.keys(body) as (keyof typeof body)[];
    const sets = fields.map((field, i) => `${COLUMN[field]} = $${i + 2}`);
    await client
      .query(`UPDATE employees SET ${sets.join(', ')} WHERE id = $1`, [id, ...fields.map(field => body[field])])
      .catch(rethrowEmailTaken);
    return fields;
  });

  // Field names only: salary values never go into the audit log.
  await audit(req, { action: 'employee.updated', entityType: 'employee', entityId: id, metadata: { fields: changed } });
  res.json({ employee: forViewer((await getEmployee(id))!, req) });
});

// ---------------------------------------------------------------------------
// POST /api/employees/:id/deactivate  (admin): also disables the linked login and ends its sessions
// ---------------------------------------------------------------------------
employeesRouter.post('/:id/deactivate', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);

  const linkedUserId = await withTransaction(async client => {
    // Same lock order as PATCH /api/users/:id, so the last-admin check can't race.
    const admins = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id FOR UPDATE`,
    );
    const employee = (await client.query<{ status: string }>('SELECT status FROM employees WHERE id = $1 FOR UPDATE', [id]))
      .rows[0];
    if (!employee) throw new HttpError(404, 'Employee not found', 'NOT_FOUND');
    if (employee.status === 'inactive') throw new HttpError(409, 'This employee is already inactive', 'ALREADY_INACTIVE');

    const user = (
      await client.query<{ id: string; role: string; status: string }>(
        'SELECT id, role, status FROM users WHERE employee_id = $1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (user && user.role === 'admin' && user.status === 'active') {
      // Same order as PATCH /api/users/:id: last-admin first, then self.
      if (admins.rows.every(a => a.id === user.id)) {
        throw new HttpError(409, "This would disable the last active admin's login", 'LAST_ADMIN');
      }
      if (user.id === req.user!.id) {
        throw new HttpError(400, 'You cannot deactivate your own employee record', 'CANNOT_MODIFY_SELF');
      }
    }

    await client.query(`UPDATE employees SET status = 'inactive' WHERE id = $1`, [id]);
    if (user) await client.query(`UPDATE users SET status = 'disabled' WHERE id = $1`, [user.id]);
    return user?.id ?? null;
  });

  if (linkedUserId) await deleteUserSessions(linkedUserId);
  await audit(req, {
    action: 'employee.deactivated',
    entityType: 'employee',
    entityId: id,
    metadata: { loginDisabled: Boolean(linkedUserId), userId: linkedUserId },
  });
  res.json({ employee: forViewer((await getEmployee(id))!, req) });
});

// ---------------------------------------------------------------------------
// POST /api/employees/:id/reactivate  (admin)  { restoreLogin?: boolean }
// ---------------------------------------------------------------------------
const reactivateSchema = z.object({ restoreLogin: z.boolean().default(false) });

employeesRouter.post('/:id/reactivate', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const { restoreLogin } = parseBody(reactivateSchema, req.body);

  const loginRestored = await withTransaction(async client => {
    const employee = (await client.query<{ status: string }>('SELECT status FROM employees WHERE id = $1 FOR UPDATE', [id]))
      .rows[0];
    if (!employee) throw new HttpError(404, 'Employee not found', 'NOT_FOUND');
    if (employee.status !== 'inactive') throw new HttpError(409, 'This employee is already active', 'ALREADY_ACTIVE');

    await client.query(`UPDATE employees SET status = 'active' WHERE id = $1`, [id]);
    if (!restoreLogin) return false;
    const restored = await client.query(
      `UPDATE users SET status = 'active' WHERE employee_id = $1 AND status = 'disabled' RETURNING id`,
      [id],
    );
    return (restored.rowCount ?? 0) > 0;
  });

  await audit(req, {
    action: 'employee.reactivated',
    entityType: 'employee',
    entityId: id,
    metadata: { restoreLogin, loginRestored },
  });
  res.json({ employee: forViewer((await getEmployee(id))!, req) });
});
