import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { now, todayIst } from '../services/clock.js';
import { moneyAmount } from '../services/money.js';
import { isPayable, NegativeNetError, recalculate, SalaryRangeError, type AdjustmentLine } from '../services/salary.js';
import { createRouter } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { isoDate, optionalText } from './shared.js';
import { PAYMENT_METHODS } from './invoices.js';

// Salaries and payslips. Everything is admin-only except an employee's own published slips.
//
// One salaries row per employee per month (salary_month = first of the month). A run is generated for a
// month from the employees' current monthly_salary (snapshotted; later employee edits never change it).
// While pending, admins add/remove itemised adjustment lines (earnings and deductions) and may override the
// base with a reason; salaries.adjustments is the stored sum, kept by services/salary.ts, and the net may
// never go below zero. Paying creates exactly one expense transaction (category "Salary", salary_id set) in
// the same DB transaction; un-paying marks that transaction reversed (it stays in the ledger) and returns
// the row to pending. A slip can only be published while paid; un-paying unpublishes it.
//
// Employee slips (/slips/me...) are selected by req.user.employeeId only, never an id from the request; an
// unpublished slip or anyone else's is a 404 identical to a missing id. Clients are refused everywhere.
// Audit metadata holds ids, months and status changes, never amounts.
export const salaryRouter = createRouter();

export const SALARY_CATEGORY = 'Salary';
const MAX_LINES = 50;

const notFound = () => new HttpError(404, 'Salary not found', 'NOT_FOUND');
const locked = () => new HttpError(409, 'A paid salary cannot be changed. Un-pay it first.', 'SALARY_LOCKED');

function parseId(raw: unknown, onError = notFound): string {
  const result = z.uuid().safeParse(raw);
  if (!result.success) throw onError();
  return result.data;
}

// 'YYYY-MM'
const monthValue = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM');
const monthStart = (month: string) => `${month}-01`;
const monthOf = (date: string) => date.slice(0, 7);

function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function moneyError(err: unknown, path: string): never {
  if (err instanceof NegativeNetError) throw new HttpError(409, 'This would make the net payable negative', 'NEGATIVE_NET');
  if (err instanceof SalaryRangeError) throw new HttpError(400, err.message, 'VALIDATION_ERROR', [{ path, message: err.message }]);
  throw err;
}

// ---------------------------------------------------------------------------
// SQL fragments
// ---------------------------------------------------------------------------
// Approved unpaid leave in the month, in weekdays (a half day counts 0.5). Informational only: nothing is
// deducted automatically. $M1/$M2 are the first and last day of the month.
const unpaidLeaveSql = (m1: string, m2: string) => `
  (SELECT coalesce(sum(CASE WHEN l.day_type = 'half' THEN 0.5 ELSE 1 END), 0)
     FROM leave_requests l
     CROSS JOIN LATERAL generate_series(greatest(l.start_date, ${m1}::date), least(l.end_date, ${m2}::date), interval '1 day') d
    WHERE l.employee_id = s.employee_id AND l.status = 'approved' AND l.leave_type = 'unpaid'
      AND l.start_date <= ${m2}::date AND l.end_date >= ${m1}::date
      AND extract(isodow FROM d) < 6)::float8`;

const SALARY_COLUMNS = `
  s.id, s.employee_id AS "employeeId", e.full_name AS "employeeName", e.employee_code AS "employeeCode",
  e.department, to_char(s.salary_month, 'YYYY-MM') AS month,
  s.base_salary::text AS "baseSalary", s.adjustments::text AS adjustments, s.net_payable::text AS "netPayable",
  s.status, s.paid_on AS "paidOn", s.payment_method AS "paymentMethod",
  s.slip_published_at AS "slipPublishedAt", (s.slip_published_at IS NOT NULL) AS "slipPublished",
  s.notes, s.created_at AS "createdAt", s.updated_at AS "updatedAt"`;

interface LockedSalary {
  id: string;
  employeeId: string;
  employeeCode: string;
  month: string;
  baseSalary: string;
  netPayable: string;
  status: 'pending' | 'paid';
}

// Locks the salary row for the rest of the transaction; missing -> 404.
async function lockSalary(db: PoolClient, id: string): Promise<LockedSalary> {
  const { rows } = await db.query<LockedSalary>(
    `SELECT s.id, s.employee_id AS "employeeId", e.employee_code AS "employeeCode", to_char(s.salary_month, 'YYYY-MM') AS month,
            s.base_salary::text AS "baseSalary", s.net_payable::text AS "netPayable", s.status
       FROM salaries s JOIN employees e ON e.id = s.employee_id
      WHERE s.id = $1 FOR UPDATE OF s`,
    [id],
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}

async function linesOf(db: PoolClient, salaryId: string): Promise<AdjustmentLine[]> {
  const { rows } = await db.query<AdjustmentLine>(
    `SELECT kind, amount::text AS amount FROM salary_adjustment_lines WHERE salary_id = $1`,
    [salaryId],
  );
  return rows;
}

async function loadSalary(id: string) {
  const [salary] = await query<{ month: string } & Record<string, unknown>>(
    `SELECT ${SALARY_COLUMNS}, ${unpaidLeaveSql('s.salary_month', "(s.salary_month + interval '1 month - 1 day')")} AS "unpaidLeaveDays",
            t.id AS "transactionId", t.reference_number AS "referenceNumber"
       FROM salaries s
       JOIN employees e ON e.id = s.employee_id
       LEFT JOIN transactions t ON t.salary_id = s.id AND t.reversed_at IS NULL
      WHERE s.id = $1`,
    [id],
  );
  if (!salary) throw notFound();
  const lines = await query(
    `SELECT l.id, l.label, l.kind, l.amount::text AS amount, l.created_at AS "createdAt",
            CASE WHEN l.created_by IS NULL THEN NULL ELSE coalesce(ce.full_name, cu.email::text) END AS "createdByName"
       FROM salary_adjustment_lines l
       LEFT JOIN users cu ON cu.id = l.created_by
       LEFT JOIN employees ce ON ce.id = cu.employee_id
      WHERE l.salary_id = $1
      ORDER BY l.created_at, l.id`,
    [id],
  );
  return { ...salary, lines };
}

// ---------------------------------------------------------------------------
// Employee-facing: own PUBLISHED slips. Access: employees, and managers/admins whose login is linked to an
// employee record (the ownership check is in SQL: s.employee_id = req.user.employeeId).
// Declared before /:id so "slips" is never parsed as an id.
// ---------------------------------------------------------------------------
function ownEmployeeId(req: Request): string {
  const employeeId = req.user!.employeeId;
  if (!employeeId) throw new HttpError(403, 'Your account is not linked to an employee record', 'NOT_LINKED');
  return employeeId;
}

// GET /api/salary/slips/me
salaryRouter.get('/slips/me', ['employee', 'manager', 'admin'], async (req, res) => {
  const employeeId = ownEmployeeId(req);
  const slips = await query(
    `SELECT s.id, to_char(s.salary_month, 'YYYY-MM') AS month, s.net_payable::text AS "netPayable", s.paid_on AS "paidOn"
       FROM salaries s
      WHERE s.employee_id = $1 AND s.status = 'paid' AND s.slip_published_at IS NOT NULL
      ORDER BY s.salary_month DESC`,
    [employeeId],
  );
  res.json({ slips });
});

// GET /api/salary/slips/me/:id - an explicit object built field by field: the employee's own slip, the
// company name and address, nothing about anyone else.
salaryRouter.get('/slips/me/:id', ['employee', 'manager', 'admin'], async (req, res) => {
  const employeeId = ownEmployeeId(req);
  const id = parseId(req.params.id, () => new HttpError(404, 'Payslip not found', 'NOT_FOUND'));
  const [row] = await query<{
    id: string;
    month: string;
    baseSalary: string;
    adjustments: string;
    netPayable: string;
    paidOn: string;
    paymentMethod: string;
    publishedAt: Date;
    employeeName: string;
    employeeCode: string;
    department: string;
    designation: string;
  }>(
    `SELECT s.id, to_char(s.salary_month, 'YYYY-MM') AS month, s.base_salary::text AS "baseSalary",
            s.adjustments::text AS adjustments, s.net_payable::text AS "netPayable",
            s.paid_on AS "paidOn", s.payment_method AS "paymentMethod", s.slip_published_at AS "publishedAt",
            e.full_name AS "employeeName", e.employee_code AS "employeeCode", e.department, e.designation
       FROM salaries s JOIN employees e ON e.id = s.employee_id
      WHERE s.id = $1 AND s.employee_id = $2 AND s.status = 'paid' AND s.slip_published_at IS NOT NULL`,
    [id, employeeId],
  );
  if (!row) throw new HttpError(404, 'Payslip not found', 'NOT_FOUND');
  const lines = await query<{ label: string; kind: string; amount: string }>(
    `SELECT label, kind, amount::text AS amount FROM salary_adjustment_lines WHERE salary_id = $1 ORDER BY created_at, id`,
    [id],
  );
  const [company] = await query<{ name: string; address: string | null }>(
    `SELECT company_name AS name, company_address AS address FROM company_settings`,
  );
  res.json({
    slip: {
      id: row.id,
      month: row.month,
      employee: { name: row.employeeName, code: row.employeeCode, department: row.department, designation: row.designation },
      company: { name: company.name, address: company.address },
      baseSalary: row.baseSalary,
      lines: lines.map(l => ({ label: l.label, kind: l.kind, amount: l.amount })),
      adjustments: row.adjustments,
      netPayable: row.netPayable,
      paidOn: row.paidOn,
      paymentMethod: row.paymentMethod,
      publishedAt: row.publishedAt,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/salary?month=YYYY-MM  (admin). Defaults to the current month (IST).
// ---------------------------------------------------------------------------
const listQuery = z.object({ month: monthValue.optional() });

salaryRouter.get('/', ['admin'], async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR', [{ path: 'month', message: parsed.error.issues[0].message }]);
  }
  const today = todayIst();
  const month = parsed.data.month ?? monthOf(today);
  const [m1, m2] = [monthStart(month), lastDayOf(month)];
  const [salaries, [summary]] = await Promise.all([
    query(
      `SELECT ${SALARY_COLUMNS}, ${unpaidLeaveSql('$1', '$2')} AS "unpaidLeaveDays",
              (SELECT count(*)::int FROM salary_adjustment_lines l WHERE l.salary_id = s.id) AS "lineCount"
         FROM salaries s JOIN employees e ON e.id = s.employee_id
        WHERE s.salary_month = $1::date
        ORDER BY e.employee_code`,
      [m1, m2],
    ),
    query(
      `SELECT coalesce(sum(net_payable), 0)::numeric(14,2)::text AS "totalPayable",
              coalesce(sum(net_payable) FILTER (WHERE status = 'paid'), 0)::numeric(14,2)::text AS "totalPaid",
              coalesce(sum(net_payable) FILTER (WHERE status = 'pending'), 0)::numeric(14,2)::text AS "totalPending",
              count(*)::int AS headcount,
              count(*) FILTER (WHERE status = 'paid')::int AS "paidCount"
         FROM salaries WHERE salary_month = $1::date`,
      [m1],
    ),
  ]);
  res.json({ today, month, salaries, summary, canGenerate: month <= addMonths(monthOf(today), 1) });
});

// ---------------------------------------------------------------------------
// POST /api/salary/generate { month }  (admin). Idempotent: existing rows are untouched.
// Eligible: active (or on leave) employees with monthly_salary > 0 who joined on or before the month's last
// day. base_salary is a snapshot of monthly_salary now.
// ---------------------------------------------------------------------------
const generateSchema = z.object({ month: monthValue }).strict();

salaryRouter.post('/generate', ['admin'], async (req, res) => {
  const { month } = parseBody(generateSchema, req.body);
  if (month > addMonths(monthOf(todayIst()), 1)) {
    throw new HttpError(400, 'Runs can be generated at most one month ahead', 'VALIDATION_ERROR', [
      { path: 'month', message: 'Runs can be generated at most one month ahead' },
    ]);
  }
  const { eligible, created } = await withTransaction(async db => {
    const eligibleSql = (lastDay: string) =>
      `FROM employees e WHERE e.status IN ('active', 'on_leave') AND e.monthly_salary > 0 AND e.joining_date <= ${lastDay}::date`;
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n ${eligibleSql('$1')}`, [lastDayOf(month)]);
    const inserted = await db.query(
      `INSERT INTO salaries (employee_id, salary_month, base_salary)
       SELECT e.id, $1::date, e.monthly_salary ${eligibleSql('$2')}
       ON CONFLICT (employee_id, salary_month) DO NOTHING RETURNING id`,
      [monthStart(month), lastDayOf(month)],
    );
    return { eligible: rows[0].n, created: inserted.rowCount ?? 0 };
  });
  await audit(req, { action: 'salary.generated', entityType: 'salary_run', metadata: { month, created, skipped: eligible - created } });
  res.status(created > 0 ? 201 : 200).json({ month, created, skipped: eligible - created });
});

// ---------------------------------------------------------------------------
// GET /api/salary/:id  (admin): the row with its adjustment lines.
// ---------------------------------------------------------------------------
salaryRouter.get('/:id', ['admin'], async (req, res) => {
  res.json({ salary: await loadSalary(parseId(req.params.id)) });
});

// ---------------------------------------------------------------------------
// PATCH /api/salary/:id  (admin, pending only) { notes?, baseSalary?, reason? }
// A base override needs a reason, which the audit row records (the amount is not recorded).
// ---------------------------------------------------------------------------
const patchSchema = z
  .object({
    notes: optionalText(2000),
    baseSalary: moneyAmount('Base salary'),
    reason: z.string().trim().min(1, 'A reason is required').max(500),
  })
  .partial()
  .strict()
  .refine(body => body.notes !== undefined || body.baseSalary !== undefined, 'Nothing to update')
  .refine(body => body.baseSalary === undefined || body.reason !== undefined, {
    message: 'A reason is required to change the base salary',
    path: ['reason'],
  });

salaryRouter.patch('/:id', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(patchSchema, req.body);
  const fields = (['notes', 'baseSalary'] as const).filter(f => body[f] !== undefined);
  const current = await withTransaction(async db => {
    const salary = await lockSalary(db, id);
    if (salary.status !== 'pending') throw locked();
    if (body.baseSalary !== undefined) {
      try {
        recalculate(body.baseSalary, await linesOf(db, id));
      } catch (err) {
        moneyError(err, 'baseSalary');
      }
      await db.query('UPDATE salaries SET base_salary = $2 WHERE id = $1', [id, body.baseSalary]);
    }
    if (body.notes !== undefined) await db.query('UPDATE salaries SET notes = $2 WHERE id = $1', [id, body.notes]);
    return salary;
  });
  await audit(req, {
    action: 'salary.updated',
    entityType: 'salary',
    entityId: id,
    metadata: { month: current.month, employeeId: current.employeeId, fields, ...(body.baseSalary !== undefined ? { reason: body.reason } : {}) },
  });
  res.json({ salary: await loadSalary(id) });
});

// ---------------------------------------------------------------------------
// POST /api/salary/:id/adjustments  (admin, pending only) { label, kind, amount }
// DELETE /api/salary/:id/adjustments/:lineId
// Both recalculate salaries.adjustments; a change that would make the net negative is a 409 NEGATIVE_NET.
// ---------------------------------------------------------------------------
const lineSchema = z
  .object({
    label: z.string().trim().min(1, 'A label is required').max(200),
    kind: z.enum(['earning', 'deduction'], 'Choose earning or deduction'),
    amount: moneyAmount('Amount', 'positive'),
  })
  .strict();

async function applyLines(db: PoolClient, salary: LockedSalary, lines: AdjustmentLine[], path: string) {
  let adjustments: string;
  try {
    adjustments = recalculate(salary.baseSalary, lines).adjustments;
  } catch (err) {
    moneyError(err, path);
  }
  await db.query('UPDATE salaries SET adjustments = $2 WHERE id = $1', [salary.id, adjustments]);
}

salaryRouter.post('/:id/adjustments', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(lineSchema, req.body);
  const { salary, lineId } = await withTransaction(async db => {
    const salary = await lockSalary(db, id);
    if (salary.status !== 'pending') throw locked();
    const lines = await linesOf(db, id);
    if (lines.length >= MAX_LINES) throw new HttpError(409, `A salary can have at most ${MAX_LINES} adjustment lines`, 'TOO_MANY_LINES');
    await applyLines(db, salary, [...lines, { kind: body.kind, amount: body.amount }], 'amount');
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO salary_adjustment_lines (salary_id, label, kind, amount, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [id, body.label, body.kind, body.amount, req.user!.id],
    );
    return { salary, lineId: rows[0].id };
  });
  await audit(req, {
    action: 'salary.adjustment_added',
    entityType: 'salary',
    entityId: id,
    metadata: { month: salary.month, employeeId: salary.employeeId, lineId, kind: body.kind },
  });
  res.status(201).json({ salary: await loadSalary(id) });
});

salaryRouter.delete('/:id/adjustments/:lineId', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const lineId = parseId(req.params.lineId, () => new HttpError(404, 'Adjustment not found', 'NOT_FOUND'));
  const { salary, kind } = await withTransaction(async db => {
    const salary = await lockSalary(db, id);
    const { rows } = await db.query<{ kind: string }>('SELECT kind FROM salary_adjustment_lines WHERE id = $1 AND salary_id = $2', [lineId, id]);
    if (!rows[0]) throw new HttpError(404, 'Adjustment not found', 'NOT_FOUND');
    if (salary.status !== 'pending') throw locked();
    await db.query('DELETE FROM salary_adjustment_lines WHERE id = $1', [lineId]);
    await applyLines(db, salary, await linesOf(db, id), 'lineId');
    return { salary, kind: rows[0].kind };
  });
  await audit(req, {
    action: 'salary.adjustment_removed',
    entityType: 'salary',
    entityId: id,
    metadata: { month: salary.month, employeeId: salary.employeeId, lineId, kind },
  });
  res.json({ salary: await loadSalary(id) });
});

// ---------------------------------------------------------------------------
// POST /api/salary/:id/pay  (admin, pending only) { paidOn, paymentMethod, referenceNumber? }
// One DB transaction: the expense transaction (amount = net payable) and the status change. A second pay
// (or a concurrent one, queued on the row lock) is a 409.
// ---------------------------------------------------------------------------
const paySchema = z
  .object({
    paidOn: isoDate,
    paymentMethod: z.enum(PAYMENT_METHODS, 'Choose a payment method'),
    referenceNumber: optionalText(100),
  })
  .strict();

salaryRouter.post('/:id/pay', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(paySchema, req.body);
  if (body.paidOn > todayIst()) {
    throw new HttpError(400, 'The payment date cannot be in the future', 'VALIDATION_ERROR', [
      { path: 'paidOn', message: 'The payment date cannot be in the future' },
    ]);
  }
  const { salary, transactionId } = await withTransaction(async db => {
    const salary = await lockSalary(db, id);
    if (salary.status === 'paid') throw new HttpError(409, 'This salary has already been paid', 'ALREADY_PAID');
    if (body.paidOn < monthStart(salary.month)) {
      throw new HttpError(400, 'The payment date cannot be before the salary month', 'VALIDATION_ERROR', [
        { path: 'paidOn', message: 'The payment date cannot be before the salary month' },
      ]);
    }
    if (!isPayable(salary.netPayable)) throw new HttpError(409, 'The net payable must be more than zero', 'NOTHING_TO_PAY');
    let transactionId: string;
    try {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO transactions (txn_date, type, category, description, amount, payment_method, reference_number, salary_id, created_by)
         VALUES ($1, 'expense', $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          body.paidOn,
          SALARY_CATEGORY,
          `Salary ${salary.month} - ${salary.employeeCode}`,
          salary.netPayable,
          body.paymentMethod,
          body.referenceNumber,
          id,
          req.user!.id,
        ],
      );
      transactionId = rows[0].id;
    } catch (err) {
      // transactions_salary_id_live_key: a live payment already exists.
      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'This salary has already been paid', 'ALREADY_PAID');
      throw err;
    }
    await db.query(`UPDATE salaries SET status = 'paid', paid_on = $2, payment_method = $3 WHERE id = $1`, [id, body.paidOn, body.paymentMethod]);
    return { salary, transactionId };
  });
  await audit(req, {
    action: 'salary.paid',
    entityType: 'salary',
    entityId: id,
    metadata: { month: salary.month, employeeId: salary.employeeId, transactionId, from: 'pending', to: 'paid' },
  });
  res.json({ salary: await loadSalary(id) });
});

// ---------------------------------------------------------------------------
// POST /api/salary/:id/unpay  (admin, paid only) { reason }
// The expense transaction is marked reversed (kept in the ledger, reason stored there); the row goes back
// to pending and its paid date, method and slip are cleared.
// ---------------------------------------------------------------------------
const unpaySchema = z.object({ reason: z.string().trim().min(1, 'A reason is required').max(500) }).strict();

salaryRouter.post('/:id/unpay', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const { reason } = parseBody(unpaySchema, req.body);
  const { salary, transactionId } = await withTransaction(async db => {
    const salary = await lockSalary(db, id);
    if (salary.status !== 'paid') throw new HttpError(409, 'Only a paid salary can be un-paid', 'INVALID_STATUS');
    const { rows } = await db.query<{ id: string }>(
      `UPDATE transactions SET reversed_at = $2, reversed_by = $3, reverse_reason = $4
        WHERE salary_id = $1 AND reversed_at IS NULL RETURNING id`,
      [id, now(), req.user!.id, reason],
    );
    await db.query(
      `UPDATE salaries SET status = 'pending', paid_on = NULL, payment_method = NULL, slip_published_at = NULL WHERE id = $1`,
      [id],
    );
    return { salary, transactionId: rows[0]?.id ?? null };
  });
  await audit(req, {
    action: 'salary.unpaid',
    entityType: 'salary',
    entityId: id,
    metadata: { month: salary.month, employeeId: salary.employeeId, transactionId, from: 'paid', to: 'pending' },
  });
  res.json({ salary: await loadSalary(id) });
});

// ---------------------------------------------------------------------------
// POST /api/salary/:id/publish-slip, /:id/unpublish-slip  (admin). Publishing needs a paid salary.
// ---------------------------------------------------------------------------
salaryRouter.post('/:id/publish-slip', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const salary = await withTransaction(async db => {
    const salary = await lockSalary(db, id);
    if (salary.status !== 'paid') throw new HttpError(409, 'Only a paid salary can have its slip published', 'NOT_PAID');
    await db.query('UPDATE salaries SET slip_published_at = coalesce(slip_published_at, $2) WHERE id = $1', [id, now()]);
    return salary;
  });
  await audit(req, { action: 'salary.slip_published', entityType: 'salary', entityId: id, metadata: { month: salary.month, employeeId: salary.employeeId } });
  res.json({ salary: await loadSalary(id) });
});

salaryRouter.post('/:id/unpublish-slip', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const salary = await withTransaction(async db => {
    const salary = await lockSalary(db, id);
    await db.query('UPDATE salaries SET slip_published_at = NULL WHERE id = $1', [id]);
    return salary;
  });
  await audit(req, { action: 'salary.slip_unpublished', entityType: 'salary', entityId: id, metadata: { month: salary.month, employeeId: salary.employeeId } });
  res.json({ salary: await loadSalary(id) });
});
