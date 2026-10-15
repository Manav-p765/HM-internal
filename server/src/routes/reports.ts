import type { Request } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { audit } from '../services/audit.js';
import { todayIst } from '../services/clock.js';
import { CSV_ROW_CAP, sendCsv, toCsv } from '../services/csv.js';
import { lastMonths, PeriodError, PRESETS, resolvePeriod, type Period } from '../services/period.js';
import { createRouter } from '../middleware/access.js';
import { HttpError } from '../middleware/errors.js';
import { isoDate } from './shared.js';
import { BALANCE_SQL, derivedStatusSql, PAID_JOIN } from './invoices.js';

// Reports (/api/reports): read-only. Admin only, except the invoice report (and its CSV), which managers
// may read too; it contains no ledger or payment-method data. Every sum is done in SQL on NUMERIC and sent
// as a 2-decimal string; voided/reversed transactions are always excluded. Dates are IST: periods come from
// services/period.ts (presets this_month, last_month, this_fy, last_fy, or from/to), "today" from the clock.
export const reportsRouter = createRouter();

const DEFAULT_PRESET = 'this_fy' as const;
const LIVE = 't.reversed_at IS NULL';

const periodQuery = z.object({
  preset: z.enum(PRESETS).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

function validation(path: string, message: string): never {
  throw new HttpError(400, message, 'VALIDATION_ERROR', [{ path, message }]);
}

async function periodFor(req: Request): Promise<Period> {
  const parsed = periodQuery.safeParse(req.query);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    validation(issue.path.join('.'), issue.message);
  }
  const [settings] = await query<{ fy: number }>('SELECT financial_year_start_month AS fy FROM company_settings');
  try {
    return resolvePeriod(parsed.data, todayIst(), settings?.fy ?? 4, DEFAULT_PRESET);
  } catch (err) {
    if (err instanceof PeriodError) validation(err.path, err.message);
    throw err;
  }
}

const periodJson = (p: Period) => ({ from: p.from, to: p.to, preset: p.preset });

async function auditExport(req: Request, name: string, period: Period, rows: number, capped: boolean) {
  await audit(req, { action: 'export.downloaded', entityType: 'export', metadata: { export: name, filters: periodJson(period), rows, capped } });
}

// ---------------------------------------------------------------------------
// Profit & loss (cash basis: by txn_date)
// ---------------------------------------------------------------------------
async function profitLoss(period: Period) {
  const params = [period.from, period.to];
  const [lines, [totals]] = await Promise.all([
    query<{ type: 'income' | 'expense'; category: string; total: string; count: number }>(
      `SELECT t.type, t.category, sum(t.amount)::numeric(14,2)::text AS total, count(*)::int AS count
         FROM transactions t
        WHERE ${LIVE} AND t.txn_date BETWEEN $1::date AND $2::date
        GROUP BY t.type, t.category
        ORDER BY t.type, sum(t.amount) DESC, t.category`,
      params,
    ),
    query<{ income: string; expense: string; net: string }>(
      `SELECT coalesce(sum(t.amount) FILTER (WHERE t.type = 'income'), 0)::numeric(14,2)::text AS income,
              coalesce(sum(t.amount) FILTER (WHERE t.type = 'expense'), 0)::numeric(14,2)::text AS expense,
              (coalesce(sum(t.amount) FILTER (WHERE t.type = 'income'), 0)
                 - coalesce(sum(t.amount) FILTER (WHERE t.type = 'expense'), 0))::numeric(14,2)::text AS net
         FROM transactions t
        WHERE ${LIVE} AND t.txn_date BETWEEN $1::date AND $2::date`,
      params,
    ),
  ]);
  const pick = (type: 'income' | 'expense') => lines.filter(l => l.type === type).map(({ category, total, count }) => ({ category, total, count }));
  return { basis: 'cash' as const, period: periodJson(period), income: pick('income'), expense: pick('expense'), totals };
}

reportsRouter.get('/profit-loss', ['admin'], async (req, res) => {
  res.json(await profitLoss(await periodFor(req)));
});

reportsRouter.get('/profit-loss.csv', ['admin'], async (req, res) => {
  const period = await periodFor(req);
  const pl = await profitLoss(period);
  const rows = [
    ...pl.income.map(l => ['Income', l.category, l.total, l.count]),
    ...pl.expense.map(l => ['Expense', l.category, l.total, l.count]),
    ['Total', 'Income', pl.totals.income, ''],
    ['Total', 'Expense', pl.totals.expense, ''],
    ['Total', 'Net', pl.totals.net, ''],
  ];
  const csv = toCsv([`Profit & loss (cash basis) ${period.from} to ${period.to}`, 'Category', 'Amount (INR)', 'Transactions'], rows);
  await auditExport(req, 'profit-loss', period, rows.length, false);
  sendCsv(res, 'profit-loss', csv);
});

// ---------------------------------------------------------------------------
// Trend: the last N calendar months (IST), oldest first; empty months are zeros.
// ---------------------------------------------------------------------------
const trendQuery = z.object({ months: z.coerce.number().int('Months must be a whole number').min(1).max(24, 'At most 24 months').default(12) });

reportsRouter.get('/trend', ['admin'], async (req, res) => {
  const parsed = trendQuery.safeParse(req.query);
  if (!parsed.success) validation('months', parsed.error.issues[0].message);
  const today = todayIst();
  const months = lastMonths(today, parsed.data.months);
  const rows = await query(
    `WITH m AS (SELECT generate_series($1::date, $2::date, interval '1 month')::date AS month_start)
     SELECT to_char(m.month_start, 'YYYY-MM') AS month,
            coalesce(sum(t.amount) FILTER (WHERE t.type = 'income'), 0)::numeric(14,2)::text AS income,
            coalesce(sum(t.amount) FILTER (WHERE t.type = 'expense'), 0)::numeric(14,2)::text AS expense,
            (coalesce(sum(t.amount) FILTER (WHERE t.type = 'income'), 0)
               - coalesce(sum(t.amount) FILTER (WHERE t.type = 'expense'), 0))::numeric(14,2)::text AS net
       FROM m
       LEFT JOIN transactions t
              ON ${LIVE} AND t.txn_date >= m.month_start AND t.txn_date < (m.month_start + interval '1 month')::date
      GROUP BY m.month_start
      ORDER BY m.month_start`,
    [`${months[0]}-01`, `${months[months.length - 1]}-01`],
  );
  res.json({ today, months: rows });
});

// ---------------------------------------------------------------------------
// Invoices (admin, manager): status summary for invoices dated in the period; aging and top outstanding as of
// today over every open invoice. No ledger or payment-method fields.
// ---------------------------------------------------------------------------
const INVOICE_STATUSES = ['draft', 'sent', 'partially_paid', 'overdue', 'paid', 'cancelled'] as const;
const AGING_BUCKETS = ['not_due', '0_30', '31_60', '61_90', '90_plus'] as const;
// Days overdue = today - due date. Due today or later: not yet due; 1-30: 0_30; 31-60; 61-90; 91+.
const BUCKET_SQL = (today: string) => `
  CASE WHEN i.due_date >= ${today}::date THEN 'not_due'
       WHEN ${today}::date - i.due_date <= 30 THEN '0_30'
       WHEN ${today}::date - i.due_date <= 60 THEN '31_60'
       WHEN ${today}::date - i.due_date <= 90 THEN '61_90'
       ELSE '90_plus' END`;
// An open invoice: sent with a balance (paid and cancelled ones have none).
const OPEN_SQL = `i.status = 'sent' AND i.total_amount > p.paid`;
const CLIENT_KEY = `coalesce(i.client_id::text, 'name:' || lower(i.client_name))`;
const CLIENT_NAME = `coalesce(max(c.company_name), max(i.client_name))`;

async function invoiceReport(period: Period) {
  const today = todayIst();
  const [byStatusRows, [summary], agingRows, open, topInvoiced, topOutstanding] = await Promise.all([
    query<{ status: string; count: number; total: string; outstanding: string }>(
      `SELECT x.status, count(*)::int AS count, sum(x.total_amount)::numeric(14,2)::text AS total,
              sum(x.balance)::numeric(14,2)::text AS outstanding
         FROM (SELECT ${derivedStatusSql('$3')} AS status, i.total_amount, ${BALANCE_SQL} AS balance
                 FROM invoices i ${PAID_JOIN}
                WHERE i.invoice_date BETWEEN $1::date AND $2::date) x
        GROUP BY x.status`,
      [period.from, period.to, today],
    ),
    query<{ invoiced: string; collected: string; outstanding: string; count: number }>(
      `SELECT coalesce(sum(i.total_amount) FILTER (WHERE i.status IN ('sent', 'paid')), 0)::numeric(14,2)::text AS invoiced,
              coalesce(sum(p.paid) FILTER (WHERE i.status IN ('sent', 'paid')), 0)::numeric(14,2)::text AS collected,
              coalesce(sum(${BALANCE_SQL}) FILTER (WHERE i.status = 'sent'), 0)::numeric(14,2)::text AS outstanding,
              count(*)::int AS count
         FROM invoices i ${PAID_JOIN}
        WHERE i.invoice_date BETWEEN $1::date AND $2::date`,
      [period.from, period.to],
    ),
    query<{ bucket: string; count: number; balance: string }>(
      `SELECT ${BUCKET_SQL('$1')} AS bucket, count(*)::int AS count, sum(${BALANCE_SQL})::numeric(14,2)::text AS balance
         FROM invoices i ${PAID_JOIN} WHERE ${OPEN_SQL} GROUP BY 1`,
      [today],
    ),
    query(
      `SELECT i.id, i.invoice_number AS "invoiceNumber", i.client_name AS "clientName", i.due_date AS "dueDate",
              greatest($1::date - i.due_date, 0) AS "daysOverdue", ${BUCKET_SQL('$1')} AS bucket,
              i.total_amount::text AS total, ${BALANCE_SQL}::text AS balance
         FROM invoices i ${PAID_JOIN} WHERE ${OPEN_SQL}
        ORDER BY i.due_date, i.invoice_number
        LIMIT 200`,
      [today],
    ),
    query(
      `SELECT ${CLIENT_NAME} AS "clientName", count(*)::int AS count, sum(i.total_amount)::numeric(14,2)::text AS amount
         FROM invoices i LEFT JOIN clients c ON c.id = i.client_id
        WHERE i.status IN ('sent', 'paid') AND i.invoice_date BETWEEN $1::date AND $2::date
        GROUP BY ${CLIENT_KEY}
        ORDER BY sum(i.total_amount) DESC, 1
        LIMIT 5`,
      [period.from, period.to],
    ),
    query(
      `SELECT ${CLIENT_NAME} AS "clientName", count(*)::int AS count, sum(${BALANCE_SQL})::numeric(14,2)::text AS amount
         FROM invoices i ${PAID_JOIN} LEFT JOIN clients c ON c.id = i.client_id
        WHERE ${OPEN_SQL}
        GROUP BY ${CLIENT_KEY}
        ORDER BY sum(${BALANCE_SQL}) DESC, 1
        LIMIT 5`,
      [],
    ),
  ]);
  const zero = { count: 0, total: '0.00', outstanding: '0.00' };
  const byStatus = INVOICE_STATUSES.map(status => {
    const row = byStatusRows.find(r => r.status === status);
    return { status, ...(row ? { count: row.count, total: row.total, outstanding: row.outstanding } : zero) };
  });
  const aging = AGING_BUCKETS.map(bucket => {
    const row = agingRows.find(r => r.bucket === bucket);
    return { bucket, count: row?.count ?? 0, balance: row?.balance ?? '0.00' };
  });
  return { today, period: periodJson(period), summary, byStatus, aging, openInvoices: open, topClients: { byInvoiced: topInvoiced, byOutstanding: topOutstanding } };
}

reportsRouter.get('/invoices', ['admin', 'manager'], async (req, res) => {
  res.json(await invoiceReport(await periodFor(req)));
});

reportsRouter.get('/invoices.csv', ['admin', 'manager'], async (req, res) => {
  const period = await periodFor(req);
  const today = todayIst();
  const rows = await query<Record<string, string | number | null>>(
    `SELECT i.invoice_number AS "invoiceNumber", i.client_name AS "clientName", i.invoice_date AS "invoiceDate", i.due_date AS "dueDate",
            ${derivedStatusSql('$3')} AS status, i.total_amount::text AS total, p.paid::text AS paid, ${BALANCE_SQL}::text AS balance,
            CASE WHEN ${OPEN_SQL} THEN greatest($3::date - i.due_date, 0) END AS "daysOverdue"
       FROM invoices i ${PAID_JOIN}
      WHERE i.invoice_date BETWEEN $1::date AND $2::date
      ORDER BY i.invoice_date, i.invoice_number NULLS LAST
      LIMIT $4`,
    [period.from, period.to, today, CSV_ROW_CAP + 1],
  );
  const capped = rows.length > CSV_ROW_CAP;
  const data = rows.slice(0, CSV_ROW_CAP).map(r => [
    r.invoiceNumber ?? 'Draft',
    r.clientName,
    r.invoiceDate,
    r.dueDate,
    r.status,
    r.total,
    r.paid,
    r.balance,
    r.daysOverdue,
  ]);
  const csv = toCsv(['Invoice', 'Client', 'Invoice date', 'Due date', 'Status', 'Total (INR)', 'Paid (INR)', 'Balance (INR)', 'Days overdue'], data);
  await auditExport(req, 'invoices', period, data.length, capped);
  sendCsv(res, 'invoices', csv, capped);
});

// ---------------------------------------------------------------------------
// Salary (admin): paid salaries with paid_on in the period, by month and department; pending salaries of the
// months in the period; headcount = employees paid in the period.
// ---------------------------------------------------------------------------
async function salaryReport(period: Period) {
  const params = [period.from, period.to];
  const [byMonth, byDepartment, [totals], [pending]] = await Promise.all([
    query(
      `SELECT to_char(s.salary_month, 'YYYY-MM') AS month, count(*)::int AS count, sum(s.net_payable)::numeric(14,2)::text AS total
         FROM salaries s WHERE s.status = 'paid' AND s.paid_on BETWEEN $1::date AND $2::date
        GROUP BY s.salary_month ORDER BY s.salary_month`,
      params,
    ),
    query(
      `SELECT e.department, count(*)::int AS count, count(DISTINCT s.employee_id)::int AS headcount,
              sum(s.net_payable)::numeric(14,2)::text AS total
         FROM salaries s JOIN employees e ON e.id = s.employee_id
        WHERE s.status = 'paid' AND s.paid_on BETWEEN $1::date AND $2::date
        GROUP BY e.department ORDER BY sum(s.net_payable) DESC, e.department`,
      params,
    ),
    query<{ paid: string; count: number; headcount: number }>(
      `SELECT coalesce(sum(s.net_payable), 0)::numeric(14,2)::text AS paid, count(*)::int AS count,
              count(DISTINCT s.employee_id)::int AS headcount
         FROM salaries s WHERE s.status = 'paid' AND s.paid_on BETWEEN $1::date AND $2::date`,
      params,
    ),
    query<{ total: string; count: number }>(
      `SELECT coalesce(sum(s.net_payable), 0)::numeric(14,2)::text AS total, count(*)::int AS count
         FROM salaries s
        WHERE s.status = 'pending' AND s.salary_month BETWEEN date_trunc('month', $1::date)::date AND $2::date`,
      params,
    ),
  ]);
  return { period: periodJson(period), byMonth, byDepartment, totals, pending };
}

reportsRouter.get('/salary', ['admin'], async (req, res) => {
  res.json(await salaryReport(await periodFor(req)));
});

reportsRouter.get('/salary.csv', ['admin'], async (req, res) => {
  const period = await periodFor(req);
  const rows = await query<Record<string, string>>(
    `SELECT to_char(s.salary_month, 'YYYY-MM') AS month, e.employee_code AS code, e.full_name AS name, e.department,
            s.net_payable::text AS net, s.paid_on AS "paidOn", s.payment_method AS method
       FROM salaries s JOIN employees e ON e.id = s.employee_id
      WHERE s.status = 'paid' AND s.paid_on BETWEEN $1::date AND $2::date
      ORDER BY s.salary_month, e.employee_code
      LIMIT $3`,
    [period.from, period.to, CSV_ROW_CAP + 1],
  );
  const capped = rows.length > CSV_ROW_CAP;
  const data = rows.slice(0, CSV_ROW_CAP).map(r => [r.month, r.code, r.name, r.department, r.net, r.paidOn, r.method]);
  const csv = toCsv(['Month', 'Employee code', 'Employee', 'Department', 'Net paid (INR)', 'Paid on', 'Payment method'], data);
  await auditExport(req, 'salary', period, data.length, capped);
  sendCsv(res, 'salary', csv, capped);
});
