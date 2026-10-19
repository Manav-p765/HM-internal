// Reports (/api/reports): P&L, trend, invoices, salary, CSVs. All dates IST; the clock is injected.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { resetClock, setClock } from '../src/services/clock.js';
import { company, employee, ledgerRow, resetAll, resetCategories, signIn, user } from './fixtures.js';

// Wednesday 2026-10-14, 09:30 IST.
const TODAY = '2026-10-14';
const T0 = new Date('2026-10-14T04:00:00Z');
const MONEY = /^-?\d+\.\d{2}$/;

type Role = 'admin' | 'manager' | 'employee' | 'client' | 'anonymous';
let agents: Record<Role, request.Agent>;
let ids: { admin: string; acme: string; globex: string; erin: string; eli: string };

async function signInAll() {
  agents = {
    admin: await signIn('admin@example.test'),
    manager: await signIn('manager@example.test'),
    employee: await signIn('erin@example.test'),
    client: await signIn('client@acme.example.test'),
    anonymous: request.agent(app),
  };
}

let invoiceCounter = 0;
// An invoice written directly; `paid` adds a linked Invoice Payment row.
async function invoiceRow(opts: {
  total: string;
  due: string;
  invoiceDate?: string;
  status?: 'draft' | 'sent' | 'paid' | 'cancelled';
  clientId?: string;
  paid?: string;
  paidOn?: string;
}) {
  invoiceCounter++;
  const status = opts.status ?? 'sent';
  const invoiceDate = opts.invoiceDate ?? (opts.due < '2026-10-01' ? opts.due : '2026-10-01');
  const [row] = await query<{ id: string }>(
    `INSERT INTO invoices (invoice_number, client_id, client_name, invoice_date, due_date, subtotal, tax_rate, tax_amount, total_amount,
                           status, sent_at, cancelled_at, cancel_reason, created_by)
     VALUES ($1, $2, (SELECT company_name FROM clients WHERE id = $2), $3, $4, $5, 0, 0, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      status === 'draft' ? null : `HM-${String(invoiceCounter).padStart(4, '0')}`,
      opts.clientId ?? ids.acme,
      invoiceDate,
      opts.due,
      opts.total,
      status,
      status === 'draft' ? null : T0,
      status === 'cancelled' ? T0 : null,
      status === 'cancelled' ? 'Fake' : null,
      ids.admin,
    ],
  );
  if (opts.paid) {
    await ledgerRow(ids.admin, { invoiceId: row.id, type: 'income', category: 'Invoice Payment', amount: opts.paid, date: opts.paidOn ?? invoiceDate });
  }
  return row.id;
}

async function salaryRow(employeeId: string, month: string, base: string, paidOn: string | null) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO salaries (employee_id, salary_month, base_salary, status, paid_on, payment_method)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [employeeId, `${month}-01`, base, paidOn ? 'paid' : 'pending', paidOn, paidOn ? 'Bank Transfer' : null],
  );
  if (paidOn) await ledgerRow(ids.admin, { salaryId: row.id, type: 'expense', category: 'Salary', amount: base, date: paidOn });
  return row.id;
}

const get = (path: string, agent: request.Agent = agents.admin) => agent.get(`/api/reports${path}`);

beforeEach(async () => {
  setClock(T0);
  invoiceCounter = 0;
  await resetAll();
  await resetCategories();
  await query('UPDATE company_settings SET financial_year_start_month = 4');
  const admin = await user('admin@example.test', 'admin');
  await user('manager@example.test', 'manager', { employeeId: await employee('Morgan Manager') });
  const erin = await employee('Erin Employee');
  await user('erin@example.test', 'employee', { employeeId: erin });
  const eli = await employee('Eli Employee');
  await query(`UPDATE employees SET department = 'Design' WHERE id = $1`, [eli]);
  const acme = await company('Acme (Fake)');
  const globex = await company('Globex (Fake)');
  await user('client@acme.example.test', 'client', { clientId: acme });
  ids = { admin, acme, globex, erin, eli };
  await signInAll();
});

afterEach(() => resetClock());

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Role matrix
// ---------------------------------------------------------------------------
describe('role matrix', () => {
  const routes: { path: string; allowed: Role[] }[] = [
    { path: '/profit-loss', allowed: ['admin'] },
    { path: '/profit-loss.csv', allowed: ['admin'] },
    { path: '/trend', allowed: ['admin'] },
    { path: '/salary', allowed: ['admin'] },
    { path: '/salary.csv', allowed: ['admin'] },
    { path: '/invoices', allowed: ['admin'] },
    { path: '/invoices.csv', allowed: ['admin'] },
  ];
  for (const route of routes) {
    it(`GET /reports${route.path}`, async () => {
      for (const role of ['admin', 'manager', 'employee', 'client', 'anonymous'] as Role[]) {
        const res = await get(route.path, agents[role]);
        const label = `${route.path} as ${role} -> ${res.status}`;
        if (route.allowed.includes(role)) expect(res.status, label).toBe(200);
        else expect(res.status, label).toBe(role === 'anonymous' ? 401 : 403);
      }
    });
  }

  it('the invoice report has no ledger or payment-method data', async () => {
    await invoiceRow({ total: '1000.00', due: '2026-10-20', paid: '400.00' });
    const res = await get('/invoices', agents.admin).expect(200);
    const text = res.text;
    for (const leak of ['paymentMethod', 'payment_method', 'category', 'transaction', 'Invoice Payment', 'createdBy', 'reference']) {
      expect(text).not.toContain(leak);
    }
    expect(Object.keys(res.body).sort()).toEqual(['aging', 'byStatus', 'openInvoices', 'openInvoicesTruncated', 'period', 'summary', 'today', 'topClients']);
  });
});

// ---------------------------------------------------------------------------
// Profit & loss
// ---------------------------------------------------------------------------
describe('profit & loss (cash basis)', () => {
  it('sums by category in SQL; voided and reversed rows and rows outside the period are excluded', async () => {
    // October 2026
    await invoiceRow({ total: '1180.00', due: '2026-10-31', paid: '1180.00', paidOn: '2026-10-05' });
    await ledgerRow(ids.admin, { type: 'income', category: 'Other Income', amount: '250.50', date: '2026-10-01' });
    await ledgerRow(ids.admin, { type: 'income', category: 'Other Income', amount: '0.25', date: '2026-10-31' });
    await ledgerRow(ids.admin, { category: 'Rent', amount: '300.10', date: '2026-10-02' });
    await ledgerRow(ids.admin, { category: 'Rent', amount: '0.20', date: '2026-10-03' });
    await salaryRow(ids.erin, '2026-09', '400.25', '2026-10-01');
    // Excluded: voided manual, reversed invoice payment, reversed (un-paid) salary payment, outside the month
    await ledgerRow(ids.admin, { category: 'Travel', amount: '999.00', date: '2026-10-04', voidedBy: ids.admin });
    const bounced = await invoiceRow({ total: '500.00', due: '2026-10-31', paid: '500.00', paidOn: '2026-10-06' });
    await query(`UPDATE transactions SET reversed_at = $2, reversed_by = $3, reverse_reason = 'Bounced' WHERE invoice_id = $1`, [bounced, T0, ids.admin]);
    const unpaid = await salaryRow(ids.eli, '2026-09', '7777.00', '2026-10-07');
    await query(`UPDATE transactions SET reversed_at = $2, reversed_by = $3, reverse_reason = 'Unpaid' WHERE salary_id = $1`, [unpaid, T0, ids.admin]);
    await ledgerRow(ids.admin, { category: 'Rent', amount: '5000.00', date: '2026-09-30' });
    await ledgerRow(ids.admin, { type: 'income', category: 'Other Income', amount: '5000.00', date: '2026-11-01' });

    const res = await get('/profit-loss?preset=this_month').expect(200);
    expect(res.body).toEqual({
      basis: 'cash',
      period: { from: '2026-10-01', to: '2026-10-31', preset: 'this_month' },
      income: [
        { category: 'Invoice Payment', total: '1180.00', count: 1 },
        { category: 'Other Income', total: '250.75', count: 2 },
      ],
      expense: [
        { category: 'Salary', total: '400.25', count: 1 },
        { category: 'Rent', total: '300.30', count: 2 },
      ],
      totals: { income: '1430.75', expense: '700.55', net: '730.20' },
    });
    // The same numbers as the ledger for the same period.
    const ledger = (await agents.admin.get('/api/transactions?from=2026-10-01&to=2026-10-31').expect(200)).body.totals;
    expect(ledger).toMatchObject(res.body.totals);
    // A custom range and an empty one.
    expect((await get('/profit-loss?from=2026-09-30&to=2026-09-30').expect(200)).body.totals).toEqual({ income: '0.00', expense: '5000.00', net: '-5000.00' });
    expect((await get('/profit-loss?from=2020-01-01&to=2020-01-31').expect(200)).body).toMatchObject({ income: [], expense: [], totals: { income: '0.00', expense: '0.00', net: '0.00' } });
  });

  it('defaults to this financial year; presets follow company_settings.financial_year_start_month', async () => {
    expect((await get('/profit-loss').expect(200)).body.period).toEqual({ from: '2026-04-01', to: '2027-03-31', preset: 'this_fy' });
    expect((await get('/profit-loss?preset=last_fy')).body.period).toMatchObject({ from: '2025-04-01', to: '2026-03-31' });
    expect((await get('/profit-loss?preset=last_month')).body.period).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    // Clock in March vs April (IST).
    setClock(new Date('2026-03-31T18:29:00Z')); // 23:59 IST, 31 March 2026
    await signInAll();
    expect((await get('/profit-loss?preset=this_fy')).body.period).toMatchObject({ from: '2025-04-01', to: '2026-03-31' });
    setClock(new Date('2026-03-31T18:30:00Z')); // 00:00 IST, 1 April 2026
    expect((await get('/profit-loss?preset=this_fy')).body.period).toMatchObject({ from: '2026-04-01', to: '2027-03-31' });
    // A calendar-year company.
    await query('UPDATE company_settings SET financial_year_start_month = 1');
    expect((await get('/profit-loss?preset=this_fy')).body.period).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('invalid, reversed, mixed and too-long ranges are 400 with the field', async () => {
    const bad = async (q: string, path: string) => {
      const res = await get(`/profit-loss${q}`).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details[0].path).toBe(path);
    };
    await bad('?from=2026-10-10&to=2026-10-01', 'to');
    await bad('?from=2026-10-10', 'to');
    await bad('?preset=this_month&from=2026-10-01&to=2026-10-02', 'preset');
    await bad('?from=2020-01-01&to=2025-01-01', 'to');
    await bad('?preset=yesterday', 'preset');
    await bad('?from=2026-02-30&to=2026-03-01', 'from');
    await get('/invoices?from=2026-10-10&to=2026-10-01').expect(400);
    await get('/salary?from=2026-10-10&to=2026-10-01').expect(400);
  });
});

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------
describe('trend', () => {
  it('one row per month ending this month, zeros for empty months, reversed rows excluded', async () => {
    await ledgerRow(ids.admin, { type: 'income', category: 'Other Income', amount: '100.00', date: '2026-08-15' });
    await ledgerRow(ids.admin, { category: 'Rent', amount: '40.00', date: '2026-08-31' });
    await ledgerRow(ids.admin, { category: 'Rent', amount: '60.00', date: '2026-10-01' });
    await ledgerRow(ids.admin, { category: 'Rent', amount: '1000.00', date: '2026-10-02', voidedBy: ids.admin });
    const res = await get('/trend?months=3').expect(200);
    expect(res.body).toEqual({
      today: TODAY,
      months: [
        { month: '2026-08', income: '100.00', expense: '40.00', net: '60.00' },
        { month: '2026-09', income: '0.00', expense: '0.00', net: '0.00' },
        { month: '2026-10', income: '0.00', expense: '60.00', net: '-60.00' },
      ],
    });
    expect((await get('/trend').expect(200)).body.months).toHaveLength(12);
    expect((await get('/trend?months=24').expect(200)).body.months[0].month).toBe('2024-11');
    for (const q of ['?months=0', '?months=25', '?months=abc', '?months=1.5']) await get(`/trend${q}`).expect(400);
  });

  it('IST month boundary: 23:59 IST on the last day is still that month; 00:00 is the next', async () => {
    await ledgerRow(ids.admin, { category: 'Rent', amount: '31.00', date: '2026-10-31' });
    await ledgerRow(ids.admin, { category: 'Rent', amount: '1.00', date: '2026-11-01' });
    setClock(new Date('2026-10-31T18:29:00Z')); // 23:59 IST, 31 Oct
    await signInAll();
    let months = (await get('/trend?months=2').expect(200)).body.months;
    expect(months.map((m: { month: string }) => m.month)).toEqual(['2026-09', '2026-10']);
    expect(months[1].expense).toBe('31.00');
    expect((await get('/profit-loss?preset=this_month')).body.totals.expense).toBe('31.00');
    setClock(new Date('2026-10-31T18:30:00Z')); // 00:00 IST, 1 Nov
    months = (await get('/trend?months=2').expect(200)).body.months;
    expect(months).toEqual([
      { month: '2026-10', income: '0.00', expense: '31.00', net: '-31.00' },
      { month: '2026-11', income: '0.00', expense: '1.00', net: '-1.00' },
    ]);
    expect((await get('/profit-loss?preset=this_month')).body).toMatchObject({ period: { from: '2026-11-01', to: '2026-11-30' }, totals: { expense: '1.00' } });
  });
});

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
describe('invoice report', () => {
  it('aging buckets by days overdue at the exact boundaries (as of today, IST)', async () => {
    const daysAgo = (n: number) => {
      const d = new Date(`${TODAY}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().slice(0, 10);
    };
    const make = (days: number, total: string, paid?: string) => invoiceRow({ total, due: daysAgo(days), invoiceDate: daysAgo(Math.max(days, 0) + 1), paid });
    await make(-5, '1.00'); // due in 5 days: not yet due
    await make(0, '2.00'); // due today: not yet due
    await make(1, '4.00'); // 0_30
    await make(30, '8.00'); // 0_30
    await make(31, '16.00'); // 31_60
    await make(60, '32.00', '2.00'); // 31_60, partly paid: balance 30.00
    await make(61, '64.00'); // 61_90
    await make(90, '128.00'); // 61_90
    await make(91, '256.00'); // 90_plus
    await invoiceRow({ total: '999.00', due: daysAgo(100), invoiceDate: daysAgo(101), paid: '999.00', status: 'paid' }); // not open
    await invoiceRow({ total: '999.00', due: daysAgo(100), invoiceDate: daysAgo(101), status: 'cancelled' }); // not open
    await invoiceRow({ total: '999.00', due: daysAgo(100), invoiceDate: daysAgo(101), status: 'draft' }); // not open
    // A reversed payment leaves the balance open again.
    const reversed = await make(45, '512.00', '512.00');
    await query(`UPDATE transactions SET reversed_at = $2, reversed_by = $3, reverse_reason = 'Bounced' WHERE invoice_id = $1`, [reversed, T0, ids.admin]);

    const res = await get('/invoices').expect(200);
    expect(res.body.aging).toEqual([
      { bucket: 'not_due', count: 2, balance: '3.00' },
      { bucket: '0_30', count: 2, balance: '12.00' },
      { bucket: '31_60', count: 3, balance: '558.00' },
      { bucket: '61_90', count: 2, balance: '192.00' },
      { bucket: '90_plus', count: 1, balance: '256.00' },
    ]);
    expect(res.body.openInvoices).toHaveLength(10);
    const byDays = Object.fromEntries(res.body.openInvoices.map((i: { daysOverdue: number; bucket: string }) => [i.daysOverdue, i.bucket]));
    expect(byDays).toMatchObject({ 0: 'not_due', 1: '0_30', 30: '0_30', 31: '31_60', 60: '31_60', 61: '61_90', 90: '61_90', 91: '90_plus' });
    for (const i of res.body.openInvoices) expect(i.balance).toMatch(MONEY);
  });

  it('status summary for invoices dated in the period; top clients by invoiced and outstanding', async () => {
    await invoiceRow({ total: '100.00', due: '2026-10-30', invoiceDate: '2026-10-01', status: 'draft' });
    await invoiceRow({ total: '200.00', due: '2026-10-30', invoiceDate: '2026-10-02' }); // sent
    await invoiceRow({ total: '300.00', due: '2026-10-30', invoiceDate: '2026-10-03', paid: '100.00' }); // partially paid
    await invoiceRow({ total: '400.00', due: '2026-10-10', invoiceDate: '2026-10-04', clientId: ids.globex }); // overdue
    await invoiceRow({ total: '500.00', due: '2026-10-30', invoiceDate: '2026-10-05', paid: '500.00', status: 'paid', clientId: ids.globex });
    await invoiceRow({ total: '600.00', due: '2026-10-30', invoiceDate: '2026-10-06', status: 'cancelled' });
    await invoiceRow({ total: '700.00', due: '2026-09-30', invoiceDate: '2026-09-01' }); // before the period, still open
    const res = await get('/invoices?preset=this_month').expect(200);
    expect(res.body.byStatus).toEqual([
      { status: 'draft', count: 1, total: '100.00', outstanding: '0.00' }, // a draft is not owed yet
      { status: 'sent', count: 1, total: '200.00', outstanding: '200.00' },
      { status: 'partially_paid', count: 1, total: '300.00', outstanding: '200.00' },
      { status: 'overdue', count: 1, total: '400.00', outstanding: '400.00' },
      { status: 'paid', count: 1, total: '500.00', outstanding: '0.00' },
      { status: 'cancelled', count: 1, total: '600.00', outstanding: '0.00' },
    ]);
    expect(res.body.summary).toEqual({ invoiced: '1400.00', collected: '600.00', outstanding: '800.00', count: 6 });
    expect(res.body.topClients.byInvoiced).toEqual([
      { clientName: 'Globex (Fake)', count: 2, amount: '900.00' },
      { clientName: 'Acme (Fake)', count: 2, amount: '500.00' },
    ]);
    expect(res.body.topClients.byOutstanding).toEqual([
      { clientName: 'Acme (Fake)', count: 3, amount: '1100.00' }, // includes the September invoice
      { clientName: 'Globex (Fake)', count: 1, amount: '400.00' },
    ]);
  });

  it('invoices.csv: BOM, header, drafts labelled, no ledger columns', async () => {
    await invoiceRow({ total: '100.00', due: '2026-10-30', invoiceDate: '2026-10-01', status: 'draft' });
    await invoiceRow({ total: '200.00', due: '2026-10-10', invoiceDate: '2026-10-02', paid: '50.00' });
    const res = await get('/invoices.csv?preset=this_month', agents.admin).buffer(true).parse((r, cb) => {
      let t = '';
      r.setEncoding('utf8');
      r.on('data', (c: string) => (t += c));
      r.on('end', () => cb(null, t));
    });
    expect(res.status).toBe(200);
    const text: string = res.body;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Invoice,Client,Invoice date,Due date,Status,Total (INR),Paid (INR),Balance (INR),Days overdue');
    expect(lines[1]).toBe('Draft,Acme (Fake),2026-10-01,2026-10-30,draft,100.00,0.00,100.00,');
    expect(lines[2]).toBe('HM-0002,Acme (Fake),2026-10-02,2026-10-10,overdue,200.00,50.00,150.00,4');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="invoices-${TODAY}.csv"`);
    const [audited] = await query<{ metadata: Record<string, unknown> }>(`SELECT metadata FROM audit_logs WHERE action = 'export.downloaded'`);
    expect(audited.metadata).toEqual({ export: 'invoices', filters: { from: '2026-10-01', to: '2026-10-31', preset: 'this_month' }, rows: 2, capped: false });
  });
});

// ---------------------------------------------------------------------------
// Salary
// ---------------------------------------------------------------------------
describe('salary report', () => {
  it('paid salaries by month and department (paid_on in the period); pending; un-paid rows excluded', async () => {
    await salaryRow(ids.erin, '2026-08', '50000.50', '2026-09-01');
    await salaryRow(ids.eli, '2026-08', '40000.00', '2026-08-31'); // paid before the period
    await salaryRow(ids.erin, '2026-09', '50000.50', '2026-10-01');
    await salaryRow(ids.eli, '2026-09', '40000.25', '2026-10-01');
    await salaryRow(ids.erin, '2026-10', '50000.50', null); // pending
    await salaryRow(ids.eli, '2026-10', '41000.00', null); // pending
    await salaryRow(ids.eli, '2026-12', '1.00', null); // pending, outside
    const res = await get('/salary?from=2026-09-01&to=2026-10-31').expect(200);
    expect(res.body).toEqual({
      period: { from: '2026-09-01', to: '2026-10-31', preset: null },
      byMonth: [
        { month: '2026-08', count: 1, total: '50000.50' },
        { month: '2026-09', count: 2, total: '90000.75' },
      ],
      byDepartment: [
        { department: 'Engineering', count: 2, headcount: 1, total: '100001.00' },
        { department: 'Design', count: 1, headcount: 1, total: '40000.25' },
      ],
      totals: { paid: '140001.25', count: 3, headcount: 2 },
      pending: { total: '91000.50', count: 2 },
    });
  });

  it('salary.csv and profit-loss.csv are BOM CSVs with fixed filenames', async () => {
    await salaryRow(ids.erin, '2026-09', '50000.50', '2026-10-01');
    await ledgerRow(ids.admin, { category: 'Rent', amount: '10.00', date: '2026-10-02' });
    const csv = async (path: string) =>
      (
        await get(path).buffer(true).parse((r, cb) => {
          let t = '';
          r.setEncoding('utf8');
          r.on('data', (c: string) => (t += c));
          r.on('end', () => cb(null, t));
        })
      ).body as string;
    const salary = await csv('/salary.csv?preset=this_month');
    expect(salary.startsWith('﻿Month,Employee code,Employee,Department,Net paid (INR),Paid on,Payment method\r\n')).toBe(true);
    expect(salary).toMatch(/2026-09,EMP-\d+,Erin Employee,Engineering,50000\.50,2026-10-01,Bank Transfer/);
    const pl = await csv('/profit-loss.csv?preset=this_month');
    expect(pl.charCodeAt(0)).toBe(0xfeff);
    expect(pl).toContain('Expense,Salary,50000.50,1');
    expect(pl).toContain('Total,Net,');
    expect(pl).toContain('Total,Net,-50010.50,'); // numeric columns are never prefixed, negatives included
    expect(pl).not.toContain("'-50010.50");
  });
});
