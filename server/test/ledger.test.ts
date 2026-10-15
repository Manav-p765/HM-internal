// The ledger (/api/transactions) and transaction categories. The clock is injected (services/clock.ts).
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { resetClock, setClock } from '../src/services/clock.js';
import { CSV_ROW_CAP } from '../src/services/csv.js';
import { company, employee, ledgerRow, resetAll, resetCategories, signIn, user } from './fixtures.js';

// Wednesday 2026-10-14, 09:30 IST.
const TODAY = '2026-10-14';
const T0 = new Date('2026-10-14T04:00:00Z');
const MONEY = /^-?\d+\.\d{2}$/;

type Role = 'admin' | 'manager' | 'employee' | 'client' | 'anonymous';
let agents: Record<Role, request.Agent>;
let ids: { admin: string; acme: string; erin: string };

const manual = (overrides: Record<string, unknown> = {}) => ({
  txnDate: TODAY,
  type: 'expense',
  category: 'Rent',
  description: 'Office rent October (fake)',
  amount: '45000.00',
  paymentMethod: 'Bank Transfer',
  referenceNumber: 'NEFT-FAKE-1',
  ...overrides,
});
const create = (body: Record<string, unknown> = {}) => agents.admin.post('/api/transactions').send(manual(body));

// A sent invoice with one payment (the linked income row), written directly.
async function invoicePayment(amount = '1180.00') {
  const [inv] = await query<{ id: string }>(
    `INSERT INTO invoices (invoice_number, client_id, client_name, invoice_date, due_date, subtotal, tax_rate, tax_amount, total_amount,
                           status, sent_at, created_by)
     VALUES ('HM-0042', $1, 'Acme (Fake)', '2026-10-01', '2026-10-31', 1000, 18, 180, 1180, 'sent', $2, $3) RETURNING id`,
    [ids.acme, T0, ids.admin],
  );
  const txn = await ledgerRow(ids.admin, { invoiceId: inv.id, type: 'income', category: 'Invoice Payment', amount, date: '2026-10-05' });
  return { invoiceId: inv.id, txn };
}

// A paid salary with its linked expense row, written directly.
async function salaryPayment() {
  const [sal] = await query<{ id: string }>(
    `INSERT INTO salaries (employee_id, salary_month, base_salary, status, paid_on, payment_method)
     VALUES ($1, '2026-09-01', 50000, 'paid', '2026-09-30', 'Bank Transfer') RETURNING id`,
    [ids.erin],
  );
  const txn = await ledgerRow(ids.admin, { salaryId: sal.id, type: 'expense', category: 'Salary', amount: '50000.00', date: '2026-09-30' });
  return { salaryId: sal.id, txn };
}

async function auditRows(action: string) {
  return query<{ entity_id: string | null; metadata: Record<string, unknown> }>(
    'SELECT entity_id, metadata FROM audit_logs WHERE action = $1 ORDER BY created_at',
    [action],
  );
}

beforeEach(async () => {
  setClock(T0);
  await resetAll();
  await resetCategories();
  const admin = await user('admin@example.test', 'admin');
  await user('manager@example.test', 'manager', { employeeId: await employee('Morgan Manager') });
  const erin = await employee('Erin Employee');
  await user('erin@example.test', 'employee', { employeeId: erin });
  const acme = await company('Acme (Fake)');
  await user('client@acme.example.test', 'client', { clientId: acme });
  ids = { admin, acme, erin };
  agents = {
    admin: await signIn('admin@example.test'),
    manager: await signIn('manager@example.test'),
    employee: await signIn('erin@example.test'),
    client: await signIn('client@acme.example.test'),
    anonymous: request.agent(app),
  };
});

afterEach(() => resetClock());

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Role matrix: admin only, everywhere under /api/transactions.
// ---------------------------------------------------------------------------
describe('role matrix', () => {
  interface Fresh {
    manual: string;
    category: string;
  }
  async function fresh(): Promise<Fresh> {
    const manualId = await ledgerRow(ids.admin, { category: 'Rent' });
    const [cat] = await query<{ id: string }>(`INSERT INTO transaction_categories (name, type) VALUES ($1, 'expense') RETURNING id`, [
      `Matrix ${Math.random().toString(36).slice(2, 8)}`,
    ]);
    return { manual: manualId, category: cat.id };
  }
  const routes: { name: string; method: 'get' | 'post' | 'patch'; path: (f: Fresh) => string; body?: () => object }[] = [
    { name: 'GET /transactions', method: 'get', path: () => '/api/transactions' },
    { name: 'GET /transactions/export.csv', method: 'get', path: () => '/api/transactions/export.csv' },
    { name: 'POST /transactions', method: 'post', path: () => '/api/transactions', body: () => manual() },
    { name: 'PATCH /transactions/:id', method: 'patch', path: f => `/api/transactions/${f.manual}`, body: () => ({ description: 'Edited (fake)' }) },
    { name: 'POST /transactions/:id/void', method: 'post', path: f => `/api/transactions/${f.manual}/void`, body: () => ({ reason: 'Duplicate (fake)' }) },
    { name: 'GET /transactions/categories', method: 'get', path: () => '/api/transactions/categories' },
    {
      name: 'POST /transactions/categories',
      method: 'post',
      path: () => '/api/transactions/categories',
      body: () => ({ name: `New ${Math.random().toString(36).slice(2, 8)}`, type: 'expense' }),
    },
    { name: 'PATCH /transactions/categories/:id', method: 'patch', path: f => `/api/transactions/categories/${f.category}`, body: () => ({ active: false }) },
  ];
  const roles: Role[] = ['admin', 'manager', 'employee', 'client', 'anonymous'];

  for (const route of routes) {
    it(route.name, async () => {
      for (const role of roles) {
        const f = await fresh();
        const res = await agents[role][route.method](route.path(f)).send(route.body?.() ?? {});
        const label = `${route.name} as ${role} -> ${res.status} ${res.text.slice(0, 200)}`;
        if (role === 'admin') {
          expect(res.status, label).toBeGreaterThanOrEqual(200);
          expect(res.status, label).toBeLessThan(300);
        } else {
          expect(res.status, label).toBe(role === 'anonymous' ? 401 : 403);
        }
      }
    });
  }

  it('there is no DELETE route (404 for every role, the row is untouched)', async () => {
    const id = await ledgerRow(ids.admin);
    for (const role of ['admin', 'manager'] as const) {
      const res = await agents[role].delete(`/api/transactions/${id}`);
      expect(res.status).toBe(404);
    }
    expect((await query('SELECT 1 FROM transactions WHERE id = $1', [id])).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Manual rows
// ---------------------------------------------------------------------------
describe('manual transactions', () => {
  it('creates income and expense rows with strings for amounts; audited without the amount', async () => {
    const expense = await create().expect(201);
    expect(expense.body.transaction).toMatchObject({
      txnDate: TODAY,
      type: 'expense',
      category: 'Rent',
      amount: '45000.00',
      source: 'manual',
      invoiceId: null,
      salaryId: null,
      voidedAt: null,
      createdByName: 'admin@example.test',
    });
    const income = await create({ type: 'income', category: 'other income', amount: 2500.5, description: 'Workshop fee (fake)' }).expect(201);
    expect(income.body.transaction).toMatchObject({ type: 'income', category: 'Other Income', amount: '2500.50' }); // canonical name
    const [row] = await auditRows('transaction.created');
    expect(row.metadata).toEqual({ type: 'expense', category: 'Rent', txnDate: TODAY });
    expect(JSON.stringify(await auditRows('transaction.created'))).not.toContain('45000');
  });

  it('validation: category rules, amount bounds, dates, linked ids refused', async () => {
    const bad = async (body: Record<string, unknown>, path: string) => {
      const res = await create(body).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details.map((d: { path: string }) => d.path), JSON.stringify(res.body)).toContain(path);
    };
    await bad({ category: 'Other Income' }, 'category'); // income category on an expense
    await bad({ type: 'income', category: 'Rent' }, 'category');
    await bad({ category: 'Salary' }, 'category'); // system
    await bad({ type: 'income', category: 'Invoice Payment' }, 'category'); // system
    await bad({ category: 'Nope (fake)' }, 'category');
    await query(`UPDATE transaction_categories SET active = false WHERE name = 'Travel'`);
    await bad({ category: 'Travel' }, 'category'); // inactive
    await bad({ amount: 0 }, 'amount');
    await bad({ amount: '-1' }, 'amount');
    await bad({ amount: '1.005' }, 'amount');
    await bad({ amount: '100000000000.00' }, 'amount'); // just over 99,999,999,999.99
    await create({ amount: '99999999999.99' }).expect(201);
    await create({ amount: '0.01' }).expect(201);
    await create({ txnDate: '2026-10-15' }).expect(201); // tomorrow (IST) is allowed
    await bad({ txnDate: '2026-10-16' }, 'txnDate');
    await bad({ txnDate: '2026-02-30' }, 'txnDate');
    await bad({ paymentMethod: 'Bitcoin' }, 'paymentMethod');
    await bad({ description: '  ' }, 'description');
    await bad({ type: 'transfer' }, 'type');
    const { invoiceId } = await invoicePayment();
    for (const extra of [{ invoiceId }, { salaryId: invoiceId }, { source: 'invoice' }]) {
      const res = await create(extra).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('edits a manual row (type and category re-checked); an inactive category may be kept but not newly chosen', async () => {
    const id = (await create()).body.transaction.id;
    const res = await agents.admin.patch(`/api/transactions/${id}`).send({ amount: '47000', description: 'Rent incl. maintenance (fake)' }).expect(200);
    expect(res.body.transaction).toMatchObject({ amount: '47000.00', description: 'Rent incl. maintenance (fake)', category: 'Rent' });
    // Type change needs a matching category.
    expect((await agents.admin.patch(`/api/transactions/${id}`).send({ type: 'income' }).expect(400)).body.details[0].path).toBe('category');
    await agents.admin.patch(`/api/transactions/${id}`).send({ type: 'income', category: 'Other Income' }).expect(200);
    await agents.admin.patch(`/api/transactions/${id}`).send({ type: 'expense', category: 'Utilities' }).expect(200);
    await query(`UPDATE transaction_categories SET active = false WHERE name = 'Utilities'`);
    await agents.admin.patch(`/api/transactions/${id}`).send({ notes: 'Still Utilities' }).expect(200);
    await agents.admin.patch(`/api/transactions/${id}`).send({ category: 'Utilities', amount: 10 }).expect(200); // keeps its own
    expect((await agents.admin.patch(`/api/transactions/${id}`).send({ category: 'Salary' }).expect(400)).body.details[0].path).toBe('category');
    await agents.admin.patch(`/api/transactions/${id}`).send({ invoiceId: id }).expect(400);
    await agents.admin.patch(`/api/transactions/${id}`).send({}).expect(400);
    expect(((await auditRows('transaction.updated'))[0].metadata.fields as string[]).sort()).toEqual(['amount', 'description']);
  });

  it('void: reason required, row kept and flagged, excluded from totals, shown with includeVoided; no second void or edit', async () => {
    const keep = (await create({ amount: '100.00' })).body.transaction.id;
    const gone = (await create({ amount: '900.00', description: 'Duplicate entry (fake)' })).body.transaction.id;
    expect((await agents.admin.post(`/api/transactions/${gone}/void`).send({ reason: ' ' }).expect(400)).body.details[0].path).toBe('reason');
    const res = await agents.admin.post(`/api/transactions/${gone}/void`).send({ reason: 'Entered twice (fake)' }).expect(200);
    expect(res.body.transaction).toMatchObject({ voidedAt: T0.toISOString(), voidReason: 'Entered twice (fake)', voidedByName: 'admin@example.test' });

    const list = (await agents.admin.get('/api/transactions').expect(200)).body;
    expect(list.transactions.map((t: { id: string }) => t.id)).toEqual([keep]);
    expect(list.totals).toEqual({ income: '0.00', expense: '100.00', net: '-100.00', count: 1 });
    const withVoided = (await agents.admin.get('/api/transactions?includeVoided=true').expect(200)).body;
    expect(withVoided.transactions.map((t: { id: string }) => t.id).sort()).toEqual([keep, gone].sort());
    expect(withVoided.totals.expense).toBe('100.00'); // voided rows never count
    expect(withVoided.total).toBe(2);

    expect((await agents.admin.post(`/api/transactions/${gone}/void`).send({ reason: 'again' }).expect(409)).body.code).toBe('VOIDED');
    expect((await agents.admin.patch(`/api/transactions/${gone}`).send({ notes: 'x' }).expect(409)).body.code).toBe('VOIDED');
    expect((await query('SELECT reverse_reason FROM transactions WHERE id = $1', [gone]))[0].reverse_reason).toBe('Entered twice (fake)');
    // The audit row names what was voided, not the free-text reason.
    expect((await auditRows('transaction.voided'))[0].metadata).toEqual({ type: 'expense', category: 'Rent', txnDate: TODAY });
  });

  it('invoice- and salary-linked rows cannot be edited or voided: 409 LINKED_TRANSACTION naming the owner', async () => {
    const inv = await invoicePayment();
    const sal = await salaryPayment();
    const patchInv = await agents.admin.patch(`/api/transactions/${inv.txn}`).send({ description: 'x' }).expect(409);
    expect(patchInv.body).toMatchObject({ code: 'LINKED_TRANSACTION', details: [{ type: 'invoice', invoiceId: inv.invoiceId, invoiceNumber: 'HM-0042' }] });
    const voidInv = await agents.admin.post(`/api/transactions/${inv.txn}/void`).send({ reason: 'x' }).expect(409);
    expect(voidInv.body.details[0]).toMatchObject({ type: 'invoice', invoiceId: inv.invoiceId });
    const patchSal = await agents.admin.patch(`/api/transactions/${sal.txn}`).send({ amount: '1' }).expect(409);
    expect(patchSal.body).toMatchObject({ code: 'LINKED_TRANSACTION', details: [{ type: 'salary', salaryId: sal.salaryId, salaryMonth: '2026-09' }] });
    await agents.admin.post(`/api/transactions/${sal.txn}/void`).send({ reason: 'x' }).expect(409);
    const rows = await query<{ description: string; amount: string; reversed_at: Date | null }>(
      'SELECT description, amount::text AS amount, reversed_at FROM transactions WHERE id = ANY($1) ORDER BY txn_date',
      [[inv.txn, sal.txn]],
    );
    expect(rows.every(r => r.reversed_at === null && r.description === 'Fake ledger row')).toBe(true);
  });

  it('invalid and unknown ids are 404', async () => {
    await agents.admin.patch('/api/transactions/not-a-uuid').send({ notes: 'x' }).expect(404);
    await agents.admin.patch('/api/transactions/00000000-0000-4000-a000-00000000dead').send({ notes: 'x' }).expect(404);
    await agents.admin.post('/api/transactions/00000000-0000-4000-a000-00000000dead/void').send({ reason: 'x' }).expect(404);
    await agents.admin.patch('/api/transactions/categories/nope').send({ active: false }).expect(404);
  });
});

// ---------------------------------------------------------------------------
// List and filters
// ---------------------------------------------------------------------------
describe('list', () => {
  it('filters by type, category, dates, method, source and search; totals cover the filtered set in SQL', async () => {
    const inv = await invoicePayment('1180.00');
    const sal = await salaryPayment();
    await ledgerRow(ids.admin, { type: 'income', category: 'Other Income', amount: '250.50', date: '2026-10-02', description: 'Workshop fee (fake)', paymentMethod: 'UPI' });
    await ledgerRow(ids.admin, { category: 'Rent', amount: '300.00', date: '2026-10-03', referenceNumber: 'RENT-OCT' });
    await ledgerRow(ids.admin, { category: 'Travel', amount: '75.25', date: '2026-08-20', description: 'Taxi to client (fake)' });
    await ledgerRow(ids.admin, { category: 'Rent', amount: '999.00', date: '2026-10-04', voidedBy: ids.admin });

    const list = async (q = '') => (await agents.admin.get(`/api/transactions${q}`).expect(200)).body;
    const all = await list();
    expect(all.total).toBe(5);
    expect(all.totals).toEqual({ income: '1430.50', expense: '50375.25', net: '-48944.75', count: 5 });
    for (const t of all.transactions) expect(t.amount).toMatch(MONEY);
    const invRow = all.transactions.find((t: { id: string }) => t.id === inv.txn);
    expect(invRow).toMatchObject({ source: 'invoice', invoiceNumber: 'HM-0042', invoiceId: inv.invoiceId, salaryId: null });
    const salRow = all.transactions.find((t: { id: string }) => t.id === sal.txn);
    expect(salRow).toMatchObject({ source: 'salary', salaryId: sal.salaryId, salaryMonth: '2026-09', salaryEmployeeName: 'Erin Employee' });

    expect((await list('?type=income')).totals).toMatchObject({ income: '1430.50', expense: '0.00', count: 2 });
    expect((await list('?category=rent')).totals).toMatchObject({ expense: '300.00', count: 1 }); // case-insensitive, voided excluded
    expect((await list('?from=2026-10-01&to=2026-10-31')).totals).toMatchObject({ income: '1430.50', expense: '300.00', net: '1130.50' });
    expect((await list('?paymentMethod=UPI')).total).toBe(1);
    expect((await list('?source=manual')).total).toBe(3);
    expect((await list('?source=invoice')).transactions[0].id).toBe(inv.txn);
    expect((await list('?source=salary')).transactions[0].id).toBe(sal.txn);
    expect((await list('?search=taxi')).total).toBe(1);
    expect((await list('?search=RENT-OCT')).total).toBe(1); // reference number
    expect((await list('?search=%25')).total).toBe(0);
    const page = await list('?limit=2&offset=1');
    expect(page).toMatchObject({ total: 5, limit: 2, offset: 1 });
    expect(page.totals.count).toBe(5); // totals ignore pagination
    // A reversed invoice payment is excluded like a voided manual row.
    await query('UPDATE transactions SET reversed_at = $2, reversed_by = $3, reverse_reason = $4 WHERE id = $1', [inv.txn, T0, ids.admin, 'Bounced (fake)']);
    expect((await list()).totals.income).toBe('250.50');

    for (const q of ['?type=transfer', '?source=other', '?from=2026-13-01', '?limit=0', '?from=2026-10-10&to=2026-10-01', '?includeVoided=maybe']) {
      await agents.admin.get(`/api/transactions${q}`).expect(400);
    }
  });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
describe('categories', () => {
  it('lists with usage, creates (case-insensitive unique), renames (rows follow) and deactivates', async () => {
    await ledgerRow(ids.admin, { category: 'Software & Subscriptions' });
    await ledgerRow(ids.admin, { category: 'Software & Subscriptions' });
    const list = (await agents.admin.get('/api/transactions/categories').expect(200)).body.categories;
    expect(list.find((c: { name: string }) => c.name === 'Software & Subscriptions')).toMatchObject({ type: 'expense', isSystem: false, active: true, usageCount: 2 });
    expect(list.filter((c: { isSystem: boolean }) => c.isSystem).map((c: { name: string }) => c.name).sort()).toEqual(['Invoice Payment', 'Salary']);

    const created = await agents.admin.post('/api/transactions/categories').send({ name: 'Training', type: 'expense' }).expect(201);
    expect(created.body.category).toMatchObject({ name: 'Training', type: 'expense', isSystem: false, active: true, usageCount: 0 });
    expect((await agents.admin.post('/api/transactions/categories').send({ name: 'training', type: 'expense' }).expect(409)).body.code).toBe('DUPLICATE_CATEGORY');
    expect((await agents.admin.post('/api/transactions/categories').send({ name: 'X' }).expect(400)).body.details[0].path).toBe('type');
    await agents.admin.post('/api/transactions/categories').send({ name: '', type: 'expense' }).expect(400);
    await agents.admin.post('/api/transactions/categories').send({ name: 'Y', type: 'expense', isSystem: true }).expect(400);

    const softwareId = list.find((c: { name: string }) => c.name === 'Software & Subscriptions').id;
    const renamed = await agents.admin.patch(`/api/transactions/categories/${softwareId}`).send({ name: 'SaaS Tools' }).expect(200);
    expect(renamed.body.category).toMatchObject({ name: 'SaaS Tools', usageCount: 2 });
    expect((await query(`SELECT count(*)::int AS n FROM transactions WHERE category = 'SaaS Tools'`))[0].n).toBe(2);
    expect((await query(`SELECT count(*)::int AS n FROM transactions WHERE category = 'Software & Subscriptions'`))[0].n).toBe(0);
    expect((await agents.admin.patch(`/api/transactions/categories/${softwareId}`).send({ name: 'Rent' }).expect(409)).body.code).toBe('DUPLICATE_CATEGORY');
    const [audited] = await auditRows('category.updated');
    expect(audited.metadata).toMatchObject({ fields: ['name'], renamedFrom: 'Software & Subscriptions', renamedTo: 'SaaS Tools', transactionsRenamed: 2 });

    // Deactivating a category in use is allowed; new rows can't use it.
    await agents.admin.patch(`/api/transactions/categories/${softwareId}`).send({ active: false }).expect(200);
    expect((await create({ category: 'SaaS Tools' }).expect(400)).body.details[0].path).toBe('category');
    await agents.admin.patch(`/api/transactions/categories/${softwareId}`).send({ active: true }).expect(200);
    await create({ category: 'SaaS Tools' }).expect(201);
  });

  it('a category used by invoice or salary rows (a legacy name) cannot be renamed; linked rows are never rewritten', async () => {
    await query(`INSERT INTO transaction_categories (name, type, active) VALUES ('Client Payments', 'income', false)`);
    const inv = await invoicePayment();
    await query(`UPDATE transactions SET category = 'Client Payments' WHERE id = $1`, [inv.txn]);
    const id = (await query<{ id: string }>(`SELECT id FROM transaction_categories WHERE name = 'Client Payments'`))[0].id;
    expect((await agents.admin.patch(`/api/transactions/categories/${id}`).send({ name: 'Renamed' }).expect(409)).body.code).toBe('CATEGORY_LINKED');
    expect((await query<{ category: string }>('SELECT category FROM transactions WHERE id = $1', [inv.txn]))[0].category).toBe('Client Payments');
    await agents.admin.patch(`/api/transactions/categories/${id}`).send({ active: true }).expect(200); // other changes are fine
  });

  it('system categories cannot be renamed or deactivated', async () => {
    const list = (await agents.admin.get('/api/transactions/categories')).body.categories;
    for (const name of ['Invoice Payment', 'Salary']) {
      const id = list.find((c: { name: string }) => c.name === name).id;
      expect((await agents.admin.patch(`/api/transactions/categories/${id}`).send({ name: `${name} 2` }).expect(409)).body.code).toBe('SYSTEM_CATEGORY');
      expect((await agents.admin.patch(`/api/transactions/categories/${id}`).send({ active: false }).expect(409)).body.code).toBe('SYSTEM_CATEGORY');
      await agents.admin.patch(`/api/transactions/categories/${id}`).send({ name }).expect(200); // no change is fine
    }
  });
});

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
describe('export.csv', () => {
  const getCsv = (q = '') =>
    agents.admin
      .get(`/api/transactions/export.csv${q}`)
      .buffer(true)
      .parse((res, cb) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (text += c));
        res.on('end', () => cb(null, text));
      });

  it('BOM, header, RFC 4180 escaping, formula cells prefixed, same filters, a fixed filename; audited', async () => {
    await ledgerRow(ids.admin, { description: '=HYPERLINK("http://evil.example","click")', amount: '10.00', date: '2026-10-01' });
    await ledgerRow(ids.admin, { description: 'Chairs, desks and "stuff"\nsecond line', amount: '20.00', date: '2026-10-02' });
    await ledgerRow(ids.admin, { description: '@SUM(1)', amount: '30.00', date: '2026-10-03', referenceNumber: '+91 refs' });
    await ledgerRow(ids.admin, { description: 'Old (fake)', amount: '40.00', date: '2026-01-01' });
    const res = await getCsv('?from=2026-10-01');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="transactions-${TODAY}.csv"`);
    const text: string = res.body;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).split('\r\n');
    expect(lines[0]).toBe('Date,Type,Category,Description,Amount (INR),Payment method,Reference,Source,Voided,Void reason');
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(text).toContain('"Chairs, desks and ""stuff""\nsecond line"');
    expect(text).toContain("'@SUM(1)");
    expect(text).toContain("'+91 refs");
    expect(text).not.toContain('Old (fake)');
    expect(text).toContain(',10.00,');
    const [audited] = await auditRows('export.downloaded');
    expect(audited.metadata).toMatchObject({ export: 'transactions', filters: { from: '2026-10-01', search: false }, rows: 3, capped: false });
    expect(JSON.stringify(audited.metadata)).not.toContain('HYPERLINK');
    // A search is recorded as used, never the typed text.
    await getCsv('?search=secret%20vendor');
    const searched = (await auditRows('export.downloaded'))[1];
    expect(searched.metadata.filters).toMatchObject({ search: true });
    expect(JSON.stringify(searched.metadata)).not.toContain('secret');
  });

  it(`stops at ${CSV_ROW_CAP} rows and says so in a header`, async () => {
    await query(
      `INSERT INTO transactions (txn_date, type, category, description, amount, payment_method, created_by)
       SELECT '2026-10-01', 'expense', 'Rent', 'Bulk ' || g, 1, 'Cash', $1 FROM generate_series(1, $2) g`,
      [ids.admin, CSV_ROW_CAP + 1],
    );
    const res = await getCsv();
    expect(res.headers['x-row-cap-reached']).toBe('true');
    const lines = (res.body as string).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(CSV_ROW_CAP + 1); // header + cap
  }, 60_000);
});
