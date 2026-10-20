// Invoices, payments (income transactions) and company settings. The clock is injected (services/clock.ts).
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { resetClock, setClock } from '../src/services/clock.js';
import { company, employee, resetAll, signIn, user } from './fixtures.js';

// Wednesday 2026-10-14, 09:30 IST.
const TODAY = '2026-10-14';
const T0 = new Date('2026-10-14T04:00:00Z');

type Role = 'admin' | 'manager' | 'employee' | 'client' | 'anonymous';
let agents: Record<Role, request.Agent>;
let ids: { acme: string; dormant: string; adminUser: string };

const item = (description = 'Design work', quantity: string | number = '2', unitPrice: string | number = '1000') => ({
  description,
  quantity,
  unitPrice,
});

async function createInvoice(overrides: Record<string, unknown> = {}, agent: request.Agent = agents.admin) {
  const res = await agent
    .post('/api/invoices')
    .send({ clientId: ids.acme, invoiceDate: TODAY, dueDate: '2026-10-29', items: [item()], ...overrides });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.invoice;
}

async function sentInvoice(overrides: Record<string, unknown> = {}) {
  const invoice = await createInvoice(overrides);
  await agents.admin.post(`/api/invoices/${invoice.id}/send`).expect(200);
  return invoice;
}

const pay = (id: string, amount: string | number, agent: request.Agent = agents.admin) =>
  agent.post(`/api/invoices/${id}/payments`).send({ amount, txnDate: TODAY, paymentMethod: 'UPI', referenceNumber: 'UTR-FAKE-1' });

async function auditRows(action: string) {
  return query<{ entity_id: string; metadata: Record<string, unknown> }>(
    'SELECT entity_id, metadata FROM audit_logs WHERE action = $1 ORDER BY created_at',
    [action],
  );
}

beforeEach(async () => {
  setClock(T0);
  await resetAll();
  await query(
    `UPDATE company_settings SET company_name = 'Example Studio (Fake)', invoice_prefix = 'HM-', invoice_next_number = 1,
            default_gst_rate = 18, bank_details = NULL, terms = NULL, logo_data_url = NULL`,
  );
  const adminUser = await user('admin@example.test', 'admin');
  await user('manager@example.test', 'manager', { employeeId: await employee('Morgan Manager') });
  await user('staff@example.test', 'employee', { employeeId: await employee('Sam Staff') });
  const acme = await company('Acme (Fake)');
  await query(`UPDATE clients SET contact_email = 'billing@acme.example.test', address = '1 Fake Road', gstin = '00AAAAA0000A0Z0' WHERE id = $1`, [acme]);
  const dormant = await company('Dormant (Fake)');
  await query(`UPDATE clients SET status = 'inactive' WHERE id = $1`, [dormant]);
  await user('client@acme.example.test', 'client', { clientId: acme });
  ids = { acme, dormant, adminUser };
  agents = {
    admin: await signIn('admin@example.test'),
    manager: await signIn('manager@example.test'),
    employee: await signIn('staff@example.test'),
    client: await signIn('client@acme.example.test'),
    anonymous: request.agent(app),
  };
});

afterEach(() => resetClock());

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Role matrix: every route, every role. Allowed roles never get 401/403; other signed-in roles get 403,
// anonymous callers 401. Each call gets fresh records so a mutation by one role can't affect the next.
// ---------------------------------------------------------------------------
describe('role matrix', () => {
  interface Fresh {
    draft: string;
    sent: string;
    paid: string;
    txn: string;
  }
  async function fresh(): Promise<Fresh> {
    const draft = (await createInvoice()).id;
    const sent = (await sentInvoice()).id;
    const paid = (await sentInvoice()).id;
    const res = await pay(paid, '100.00').expect(201);
    return { draft, sent, paid, txn: res.body.paymentId };
  }
  const routes: { name: string; method: 'get' | 'post' | 'patch' | 'delete'; path: (f: Fresh) => string; allowed: Role[]; body?: object }[] = [
    { name: 'GET /invoices', method: 'get', path: () => '/api/invoices', allowed: ['admin', 'manager'] },
    { name: 'GET /invoices/:id', method: 'get', path: f => `/api/invoices/${f.sent}`, allowed: ['admin', 'manager'] },
    { name: 'POST /invoices', method: 'post', path: () => '/api/invoices', allowed: ['admin', 'manager'], body: { clientId: '', dueDate: TODAY, items: [item()] } },
    { name: 'PATCH /invoices/:id', method: 'patch', path: f => `/api/invoices/${f.draft}`, allowed: ['admin', 'manager'], body: { notes: 'x' } },
    { name: 'POST /invoices/:id/send', method: 'post', path: f => `/api/invoices/${f.draft}/send`, allowed: ['admin', 'manager'] },
    { name: 'POST /invoices/:id/cancel', method: 'post', path: f => `/api/invoices/${f.sent}/cancel`, allowed: ['admin'], body: { reason: 'Duplicate' } },
    { name: 'POST /invoices/:id/payments', method: 'post', path: f => `/api/invoices/${f.sent}/payments`, allowed: ['admin'], body: { amount: '1.00', txnDate: TODAY, paymentMethod: 'UPI' } },
    { name: 'DELETE /invoices/:id/payments/:txnId', method: 'delete', path: f => `/api/invoices/${f.paid}/payments/${f.txn}`, allowed: ['admin'], body: { reason: 'Bounced (fake)' } },
    { name: 'DELETE /invoices/:id', method: 'delete', path: f => `/api/invoices/${f.draft}`, allowed: ['admin', 'manager'] },
    { name: 'GET /settings/company', method: 'get', path: () => '/api/settings/company', allowed: ['admin', 'manager'] },
    { name: 'PATCH /settings/company', method: 'patch', path: () => '/api/settings/company', allowed: ['admin'], body: { terms: 'Net 15 (fake)' } },
  ];
  const roles: Role[] = ['admin', 'manager', 'employee', 'client', 'anonymous'];

  for (const route of routes) {
    it(route.name, async () => {
      for (const role of roles) {
        const f = await fresh();
        const res = await agents[role][route.method](route.path(f)).send(route.body ?? {});
        const label = `${route.name} as ${role} -> ${res.status} ${JSON.stringify(res.body)}`;
        if (route.allowed.includes(role)) {
          expect([401, 403], label).not.toContain(res.status);
          expect(res.status, label).toBeLessThan(500);
        } else {
          expect(res.status, label).toBe(role === 'anonymous' ? 401 : 403);
        }
      }
    });
  }

  it('the allowed calls actually succeed (not just "not 403")', async () => {
    const f = await fresh();
    await agents.manager.get('/api/invoices').expect(200);
    await agents.manager.get(`/api/invoices/${f.sent}`).expect(200);
    await agents.manager.patch(`/api/invoices/${f.draft}`).send({ notes: 'ok' }).expect(200);
    await agents.manager.post(`/api/invoices/${f.draft}/send`).expect(200);
    await agents.admin.post(`/api/invoices/${f.sent}/cancel`).send({ reason: 'Duplicate (fake)' }).expect(200);
    await agents.admin.delete(`/api/invoices/${f.paid}/payments/${f.txn}`).send({ reason: 'Bounced (fake)' }).expect(200);
    await agents.manager.get('/api/settings/company').expect(200);
    await agents.admin.patch('/api/settings/company').send({ terms: 'Net 15' }).expect(200);
  });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
describe('company settings', () => {
  it('admin updates the invoice fields; the prefix only affects future numbers; currency is fixed', async () => {
    const first = await sentInvoice();
    expect((await agents.admin.get(`/api/invoices/${first.id}`)).body.invoice.invoiceNumber).toBe('HM-0001');
    const res = await agents.admin
      .patch('/api/settings/company')
      .send({
        companyName: 'New Name (Fake)',
        companyGstin: '11bbbbb1111b1z1',
        defaultGstRate: 12,
        invoicePrefix: 'NEW-',
        bankDetails: 'Fake Bank\nA/C 000000',
        terms: 'Payment within 15 days.',
      })
      .expect(200);
    expect(res.body.company).toMatchObject({
      companyName: 'New Name (Fake)',
      companyGstin: '11BBBBB1111B1Z1',
      defaultGstRate: '12.00',
      invoicePrefix: 'NEW-',
      currency: 'INR',
      nextInvoiceNumber: 'NEW-0002',
    });
    const second = await createInvoice();
    expect(second.taxRate).toBe('12.00');
    const sent = await agents.admin.post(`/api/invoices/${second.id}/send`).expect(200);
    expect(sent.body.invoice.invoiceNumber).toBe('NEW-0002');
    expect((await agents.admin.get(`/api/invoices/${first.id}`)).body.invoice.invoiceNumber).toBe('HM-0001');
    const [row] = await auditRows('settings.company_updated');
    expect(row.metadata.fields).toEqual(['companyName', 'companyGstin', 'defaultGstRate', 'invoicePrefix', 'bankDetails', 'terms']);
  });

  it('validates the body and rejects a currency change or unknown fields', async () => {
    const bad = async (body: object, path: string) => {
      const res = await agents.admin.patch('/api/settings/company').send(body).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      if (path) expect(res.body.details.map((d: { path: string }) => d.path)).toContain(path);
    };
    await bad({ currency: 'USD' }, '');
    await bad({ defaultGstRate: 101 }, 'defaultGstRate');
    await bad({ invoicePrefix: 'HM 2026' }, 'invoicePrefix');
    await bad({ companyGstin: 'short' }, 'companyGstin');
    await bad({ companyEmail: 'not-an-email' }, 'companyEmail');
    await bad({ companyName: '' }, 'companyName');
    await bad({}, '');
  });

  describe('logo (printed on invoices)', () => {
    // Smallest valid files of each type: the API checks the file signature, not just the declared type.
    const PNG_1PX =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const png = `data:image/png;base64,${PNG_1PX}`;
    const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]).toString('base64')}`;
    const webp = `data:image/webp;base64,${Buffer.from('RIFF\x1a\x00\x00\x00WEBPVP8 ', 'latin1').toString('base64')}`;

    it('admin sets, replaces and removes it; managers read it; the audit row names the field only', async () => {
      const set = await agents.admin.patch('/api/settings/company').send({ logoDataUrl: png }).expect(200);
      expect(set.body.company.logoDataUrl).toBe(png);
      expect((await agents.manager.get('/api/settings/company').expect(200)).body.company.logoDataUrl).toBe(png);
      await agents.admin.patch('/api/settings/company').send({ logoDataUrl: jpeg }).expect(200);
      await agents.admin.patch('/api/settings/company').send({ logoDataUrl: webp }).expect(200);
      const cleared = await agents.admin.patch('/api/settings/company').send({ logoDataUrl: null }).expect(200);
      expect(cleared.body.company.logoDataUrl).toBeNull();
      const rows = await auditRows('settings.company_updated');
      expect(rows.map(r => r.metadata)).toEqual(Array(4).fill({ fields: ['logoDataUrl'] }));
      expect(JSON.stringify(rows)).not.toContain('base64');
    });

    it('managers cannot change it', async () => {
      await agents.manager.patch('/api/settings/company').send({ logoDataUrl: png }).expect(403);
    });

    it('refuses SVG, other schemes, a type that does not match the file, bad base64 and files over 150 KB', async () => {
      const bad = async (logoDataUrl: unknown) => {
        const res = await agents.admin.patch('/api/settings/company').send({ logoDataUrl }).expect(400);
        expect(res.body.details.map((d: { path: string }) => d.path)).toContain('logoDataUrl');
      };
      await bad(`data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`);
      await bad('https://example.test/logo.png');
      await bad('javascript:alert(1)');
      await bad(`data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`); // not a PNG
      await bad(`data:image/jpeg;base64,${PNG_1PX}`); // PNG bytes declared as JPEG
      await bad(`data:image/png;base64,${PNG_1PX.slice(0, -1)}`); // truncated base64
      await bad(`${png}"><img src=x onerror=alert(1)>`);
      const big = Buffer.alloc(150 * 1024 + 1);
      Buffer.from(PNG_1PX, 'base64').copy(big);
      await bad(`data:image/png;base64,${big.toString('base64')}`);
      await bad(42);
      const [{ logo }] = await query<{ logo: string | null }>('SELECT logo_data_url AS logo FROM company_settings');
      expect(logo).toBeNull();
    });
  });
});

describe('total in words (printed on the invoice)', () => {
  it('every invoice response carries totalInWords derived from the stored total', async () => {
    const draft = await createInvoice({ items: [item('A', 3, '33.33')], taxRate: 18 });
    expect(draft.total).toBe('117.99');
    expect(draft.totalInWords).toBe('One Hundred and Seventeen Indian Rupees and Ninety Nine Paise Only');
    const big = await createInvoice({ items: [item('B', 1, '100000')], taxRate: 18 });
    const res = await agents.manager.get(`/api/invoices/${big.id}`).expect(200);
    expect(res.body.invoice).toMatchObject({ total: '118000.00', totalInWords: 'One Lakh Eighteen Thousand Indian Rupees Only' });
  });
});

// ---------------------------------------------------------------------------
// Creating, numbering, money
// ---------------------------------------------------------------------------
describe('create and numbering', () => {
  it('creates a draft with server-computed totals as 2-decimal strings and the client snapshot', async () => {
    const invoice = await createInvoice({ items: [item('A', 3, '33.33')], taxRate: 18 });
    expect(invoice).toMatchObject({
      invoiceNumber: null, // assigned at send
      status: 'draft',
      derivedStatus: 'draft',
      clientId: ids.acme,
      clientName: 'Acme (Fake)',
      clientEmail: 'billing@acme.example.test',
      clientAddress: '1 Fake Road',
      clientGstin: '00AAAAA0000A0Z0',
      subtotal: '99.99',
      taxRate: '18.00',
      taxAmount: '18.00',
      total: '117.99',
      amountPaid: '0.00',
      balance: '117.99',
      sentAt: null,
    });
    expect(invoice.items).toEqual([expect.objectContaining({ description: 'A', quantity: '3.00', unitPrice: '33.33', lineTotal: '99.99' })]);
    const [row] = await auditRows('invoice.created');
    expect(row).toMatchObject({ entity_id: invoice.id, metadata: { invoiceNumber: null } });
    const [{ next }] = await query<{ next: number }>('SELECT invoice_next_number AS next FROM company_settings');
    expect(next).toBe(1); // creating a draft consumes no number
  });

  it('defaults the invoice date to today (IST) and the tax rate to the company default; request fields override the snapshot', async () => {
    const res = await agents.manager
      .post('/api/invoices')
      .send({ clientId: ids.acme, clientName: 'Acme Billing Dept (Fake)', clientAddress: null, dueDate: '2026-11-01', items: [item()] })
      .expect(201);
    expect(res.body.invoice).toMatchObject({ invoiceDate: TODAY, taxRate: '18.00', clientName: 'Acme Billing Dept (Fake)', clientAddress: null, clientEmail: 'billing@acme.example.test' });
  });

  it('manual client entry without a client record', async () => {
    const invoice = await createInvoice({ clientId: undefined, clientName: 'Walk-in Customer (Fake)', clientEmail: 'WALKIN@example.test' });
    expect(invoice).toMatchObject({ clientId: null, clientName: 'Walk-in Customer (Fake)', clientEmail: 'walkin@example.test' });
  });

  it('numbers are assigned at send: unique and sequential with no gaps, including 10 concurrent sends', async () => {
    const first = await sentInvoice();
    const drafts = await Promise.all(Array.from({ length: 10 }, (_, i) => createInvoice({ notes: `n${i}` }, i % 2 ? agents.admin : agents.manager)));
    expect(drafts.every(d => d.invoiceNumber === null)).toBe(true);
    const sent = await Promise.all(
      drafts.map((d, i) => (i % 2 ? agents.admin : agents.manager).post(`/api/invoices/${d.id}/send`).expect(200)),
    );
    const numbers = [(await agents.admin.get(`/api/invoices/${first.id}`)).body.invoice.invoiceNumber, ...sent.map(r => r.body.invoice.invoiceNumber)].sort();
    expect(numbers).toEqual(Array.from({ length: 11 }, (_, i) => `HM-${String(i + 1).padStart(4, '0')}`));
    const [{ next }] = await query<{ next: number }>('SELECT invoice_next_number AS next FROM company_settings');
    expect(next).toBe(12);
    expect((await auditRows('invoice.sent')).map(r => r.metadata.invoiceNumber).sort()).toEqual(numbers);
  });

  it('deleting or cancelling a draft consumes no number; a cancelled sent invoice keeps its number', async () => {
    const deleted = await createInvoice();
    await agents.admin.delete(`/api/invoices/${deleted.id}`).expect(204);
    const cancelledDraft = await createInvoice();
    const c = await agents.admin.post(`/api/invoices/${cancelledDraft.id}/cancel`).send({ reason: 'Not needed (fake)' }).expect(200);
    expect(c.body.invoice.invoiceNumber).toBeNull();
    const a = await sentInvoice();
    const aNumber = (await agents.admin.get(`/api/invoices/${a.id}`)).body.invoice.invoiceNumber;
    expect(aNumber).toBe('HM-0001');
    const cancelled = await agents.admin.post(`/api/invoices/${a.id}/cancel`).send({ reason: 'Raised in error (fake)' }).expect(200);
    expect(cancelled.body.invoice).toMatchObject({ status: 'cancelled', invoiceNumber: 'HM-0001' });
    // The next send gets HM-0002: the cancelled number is never reused.
    const b = await sentInvoice();
    expect((await agents.admin.get(`/api/invoices/${b.id}`)).body.invoice.invoiceNumber).toBe('HM-0002');
  });

  it('a draft that already had a number (from before migration 007) keeps it when sent', async () => {
    const draft = await createInvoice();
    await query(`UPDATE invoices SET invoice_number = 'HM-0042' WHERE id = $1`, [draft.id]);
    const res = await agents.admin.post(`/api/invoices/${draft.id}/send`).expect(200);
    expect(res.body.invoice.invoiceNumber).toBe('HM-0042');
    const [{ next }] = await query<{ next: number }>('SELECT invoice_next_number AS next FROM company_settings');
    expect(next).toBe(1);
  });

  it('skips a number that is already taken (e.g. a prefix changed back)', async () => {
    await sentInvoice(); // HM-0001
    await query(`UPDATE company_settings SET invoice_next_number = 1`);
    const second = await createInvoice();
    expect((await agents.admin.post(`/api/invoices/${second.id}/send`).expect(200)).body.invoice.invoiceNumber).toBe('HM-0002');
  });

  it('rejects an inactive or unknown client', async () => {
    const inactive = await agents.admin.post('/api/invoices').send({ clientId: ids.dormant, dueDate: TODAY, items: [item()] }).expect(409);
    expect(inactive.body.code).toBe('CLIENT_INACTIVE');
    const unknown = await agents.admin
      .post('/api/invoices')
      .send({ clientId: '00000000-0000-4000-a000-00000000dead', dueDate: TODAY, items: [item()] })
      .expect(400);
    expect(unknown.body.details[0].path).toBe('clientId');
    expect((await query('SELECT 1 FROM invoices')).length).toBe(0);
  });

  it('validation errors name the field', async () => {
    const bad = async (body: object, path: string) => {
      const res = await agents.admin.post('/api/invoices').send({ clientId: ids.acme, dueDate: '2026-10-29', items: [item()], ...body }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(path);
    };
    await bad({ items: [] }, 'items');
    await bad({ items: Array.from({ length: 101 }, () => item()) }, 'items');
    await bad({ items: [item('A', 0)] }, 'items.0.quantity');
    await bad({ items: [item('A', -1)] }, 'items.0.quantity');
    await bad({ items: [item('A', 1, -5)] }, 'items.0.unitPrice');
    await bad({ items: [item('A', 1, '10.555')] }, 'items.0.unitPrice');
    await bad({ items: [item('', 1, 10)] }, 'items.0.description');
    await bad({ taxRate: 150 }, 'taxRate');
    await bad({ dueDate: '2026-10-01' }, 'dueDate'); // before the invoice date
    await bad({ dueDate: '2026-02-30' }, 'dueDate');
    await bad({ clientId: undefined, clientName: '' }, 'clientName');
    await bad({ status: 'paid' }, ''); // unknown keys (status is never set directly)
    await bad({ items: [item('A', '99999999.99', '99999.99')] }, 'items');
  });

  it('100 lines are accepted', async () => {
    const invoice = await createInvoice({ items: Array.from({ length: 100 }, (_, i) => item(`Line ${i}`, '0.01', '0.99')) });
    expect(invoice.items).toHaveLength(100);
    expect(invoice).toMatchObject({ subtotal: '1.00', taxAmount: '0.18', total: '1.18' });
  });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
describe('lifecycle', () => {
  it('a draft is fully editable: items replaced as a set, totals recomputed, client refilled', async () => {
    const invoice = await createInvoice();
    const other = await company('Other Co (Fake)');
    const res = await agents.manager
      .patch(`/api/invoices/${invoice.id}`)
      .send({ clientId: other, items: [item('X', 1, '500'), item('Y', 2, '250.50')], taxRate: 5, notes: 'Updated' })
      .expect(200);
    expect(res.body.invoice).toMatchObject({ clientId: other, clientName: 'Other Co (Fake)', clientGstin: null, subtotal: '1001.00', taxAmount: '50.05', total: '1051.05', notes: 'Updated' });
    expect(res.body.invoice.items.map((i: { description: string }) => i.description)).toEqual(['X', 'Y']);
    const [row] = await auditRows('invoice.updated');
    expect((row.metadata.fields as string[]).sort()).toEqual(['clientId', 'items', 'notes', 'taxRate']);
  });

  it('send locks the lines: a sent invoice allows only the due date and notes', async () => {
    const invoice = await sentInvoice();
    const res = await agents.admin.patch(`/api/invoices/${invoice.id}`).send({ items: [item('Z', 1, 1)] }).expect(409);
    expect(res.body.code).toBe('INVOICE_LOCKED');
    await agents.admin.patch(`/api/invoices/${invoice.id}`).send({ taxRate: 0 }).expect(409);
    await agents.admin.patch(`/api/invoices/${invoice.id}`).send({ clientName: 'Someone else' }).expect(409);
    const ok = await agents.manager.patch(`/api/invoices/${invoice.id}`).send({ dueDate: '2026-11-15', notes: 'Extended' }).expect(200);
    expect(ok.body.invoice).toMatchObject({ dueDate: '2026-11-15', notes: 'Extended', total: invoice.total, status: 'sent' });
    expect(ok.body.invoice.sentAt).toBe(T0.toISOString());
    // Sending twice is refused.
    expect((await agents.admin.post(`/api/invoices/${invoice.id}/send`).expect(409)).body.code).toBe('INVALID_STATUS');
  });

  it('a draft without a client name cannot be sent', async () => {
    const invoice = await createInvoice({ clientId: undefined, clientName: 'Temp' });
    await query(`UPDATE invoices SET client_name = '' WHERE id = $1`, [invoice.id]);
    expect((await agents.admin.post(`/api/invoices/${invoice.id}/send`).expect(409)).body.code).toBe('INVOICE_INCOMPLETE');
  });

  it('paid and cancelled invoices are locked; only drafts are deleted', async () => {
    const paid = await sentInvoice();
    await pay(paid.id, paid.total).expect(201);
    expect((await agents.admin.patch(`/api/invoices/${paid.id}`).send({ notes: 'x' }).expect(409)).body.code).toBe('INVOICE_LOCKED');
    expect((await agents.admin.delete(`/api/invoices/${paid.id}`).expect(409)).body.code).toBe('INVOICE_LOCKED');

    const cancelled = await sentInvoice();
    await agents.admin.post(`/api/invoices/${cancelled.id}/cancel`).send({ reason: 'Raised in error (fake)' }).expect(200);
    await agents.admin.patch(`/api/invoices/${cancelled.id}`).send({ dueDate: '2026-12-01' }).expect(409);
    await agents.admin.delete(`/api/invoices/${cancelled.id}`).expect(409);
    const sent = await sentInvoice();
    await agents.manager.delete(`/api/invoices/${sent.id}`).expect(409);

    const draft = await createInvoice();
    await agents.manager.delete(`/api/invoices/${draft.id}`).expect(204);
    await agents.admin.get(`/api/invoices/${draft.id}`).expect(404);
    expect((await auditRows('invoice.deleted'))[0].metadata).toEqual({ invoiceNumber: draft.invoiceNumber });
  });

  it('cancel needs a reason, keeps the number, and is blocked while there are payments', async () => {
    const invoice = await sentInvoice();
    await pay(invoice.id, '10.00').expect(201);
    expect((await agents.admin.post(`/api/invoices/${invoice.id}/cancel`).send({ reason: 'x' }).expect(409)).body.code).toBe('HAS_PAYMENTS');
    const draft = await createInvoice();
    const noReason = await agents.admin.post(`/api/invoices/${draft.id}/cancel`).send({ reason: ' ' }).expect(400);
    expect(noReason.body.details[0].path).toBe('reason');
    const res = await agents.admin.post(`/api/invoices/${draft.id}/cancel`).send({ reason: 'Client withdrew (fake)' }).expect(200);
    expect(res.body.invoice).toMatchObject({ status: 'cancelled', derivedStatus: 'cancelled', invoiceNumber: draft.invoiceNumber, cancelReason: 'Client withdrew (fake)', balance: '0.00' });
    expect((await auditRows('invoice.cancelled'))[0].metadata).toEqual({ invoiceNumber: draft.invoiceNumber });
  });

  it('the client snapshot does not change when the client is edited later', async () => {
    const invoice = await sentInvoice();
    await agents.admin.patch(`/api/clients/${ids.acme}`).send({ companyName: 'Acme Renamed (Fake)', address: '99 New Street' }).expect(200);
    const res = await agents.admin.get(`/api/invoices/${invoice.id}`).expect(200);
    expect(res.body.invoice).toMatchObject({ clientName: 'Acme (Fake)', clientAddress: '1 Fake Road' });
  });

  it('invalid and unknown ids are 404', async () => {
    await agents.admin.get('/api/invoices/not-a-uuid').expect(404);
    await agents.admin.get('/api/invoices/00000000-0000-4000-a000-00000000dead').expect(404);
    await agents.admin.patch('/api/invoices/00000000-0000-4000-a000-00000000dead').send({ notes: 'x' }).expect(404);
    const invoice = await sentInvoice();
    await agents.admin.delete(`/api/invoices/${invoice.id}/payments/00000000-0000-4000-a000-00000000dead`).send({ reason: 'x' }).expect(404);
    await agents.admin.delete(`/api/invoices/${invoice.id}/payments/not-a-uuid`).send({ reason: 'x' }).expect(404);
  });
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
describe('payments', () => {
  it('a zero-total invoice cannot be sent (it could never be paid)', async () => {
    const free = await createInvoice({ items: [item('Courtesy review', 1, 0)] });
    expect(free.total).toBe('0.00');
    const res = await agents.admin.post(`/api/invoices/${free.id}/send`).expect(409);
    expect(res.body.code).toBe('INVOICE_INCOMPLETE');
  });

  it('inconsistent data never produces a 500: a negative balance is an overpayment; a paid invoice cannot be cancelled', async () => {
    const invoice = await sentInvoice(); // 2360.00
    // Paid more than the total by some other path (e.g. a future ledger API): balance -5.00.
    await query(
      `INSERT INTO transactions (txn_date, type, category, description, amount, payment_method, invoice_id, created_by)
       VALUES ($1, 'income', 'Invoice Payment', 'x', 2365.00, 'UPI', $2, $3)`,
      [TODAY, invoice.id, ids.adminUser],
    );
    expect((await pay(invoice.id, '1.00').expect(409)).body.code).toBe('OVERPAYMENT');
    // A paid invoice without payments (manual data fix) still can't be cancelled.
    const paid = await sentInvoice();
    await query(`UPDATE invoices SET status = 'paid' WHERE id = $1`, [paid.id]);
    expect((await agents.admin.post(`/api/invoices/${paid.id}/cancel`).send({ reason: 'x' }).expect(409)).body.code).toBe('INVALID_STATUS');
  });

  it('partial then full payment flips to paid; each payment is exactly one income transaction', async () => {
    const invoice = await sentInvoice({ items: [item('A', 3, '33.33')] }); // 117.99
    const first = await pay(invoice.id, '17.99').expect(201);
    expect(first.body.invoice).toMatchObject({ status: 'sent', derivedStatus: 'partially_paid', amountPaid: '17.99', balance: '100.00' });
    const txns = await query(
      `SELECT type, category, amount::text AS amount, invoice_id, created_by, payment_method, reference_number FROM transactions WHERE invoice_id = $1`,
      [invoice.id],
    );
    expect(txns).toEqual([
      { type: 'income', category: 'Invoice Payment', amount: '17.99', invoice_id: invoice.id, created_by: ids.adminUser, payment_method: 'UPI', reference_number: 'UTR-FAKE-1' },
    ]);

    const second = await pay(invoice.id, 100).expect(201);
    expect(second.body.invoice).toMatchObject({ status: 'paid', derivedStatus: 'paid', amountPaid: '117.99', balance: '0.00' });
    expect(second.body.invoice.payments).toHaveLength(2);
    expect((await query('SELECT 1 FROM transactions WHERE invoice_id = $1', [invoice.id])).length).toBe(2);
    expect((await auditRows('invoice.payment_recorded')).map(r => r.metadata.amount)).toEqual(['17.99', '100.00']);
  });

  it('overpayment is a 409 and writes nothing; a paid invoice takes no more', async () => {
    const invoice = await sentInvoice(); // 2360.00
    expect((await pay(invoice.id, '2360.01').expect(409)).body.code).toBe('OVERPAYMENT');
    await pay(invoice.id, '2360.00').expect(201);
    expect((await pay(invoice.id, '0.01').expect(409)).body.code).toBe('OVERPAYMENT');
    expect((await query('SELECT 1 FROM transactions')).length).toBe(1);
  });

  it('payments on a draft or a cancelled invoice are refused', async () => {
    const draft = await createInvoice();
    expect((await pay(draft.id, '1.00').expect(409)).body.code).toBe('INVALID_STATUS');
    const cancelled = await sentInvoice();
    await agents.admin.post(`/api/invoices/${cancelled.id}/cancel`).send({ reason: 'x' }).expect(200);
    expect((await pay(cancelled.id, '1.00').expect(409)).body.code).toBe('INVALID_STATUS');
    expect((await query('SELECT 1 FROM transactions')).length).toBe(0);
  });

  it('validates the payment body', async () => {
    const invoice = await sentInvoice();
    const bad = async (body: object, path: string) => {
      const res = await agents.admin.post(`/api/invoices/${invoice.id}/payments`).send({ amount: '10', txnDate: TODAY, paymentMethod: 'UPI', ...body }).expect(400);
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(path);
    };
    await bad({ amount: 0 }, 'amount');
    await bad({ amount: '-5' }, 'amount');
    await bad({ amount: '1.001' }, 'amount');
    await bad({ paymentMethod: 'Bitcoin' }, 'paymentMethod');
    await bad({ txnDate: '2026-10-15' }, 'txnDate'); // tomorrow
    await bad({ txnDate: '2026-10-13' }, 'txnDate'); // before the invoice date (2026-10-14)
  });

  const reverse = (id: string, txnId: string, reason: unknown = 'Cheque bounced (fake)') =>
    agents.admin.delete(`/api/invoices/${id}/payments/${txnId}`).send({ reason });

  it('reversal keeps the ledger row marked reversed, excludes it from the balance, and flips paid back to sent', async () => {
    const invoice = await sentInvoice();
    const a = await pay(invoice.id, '360.00').expect(201);
    const b = await pay(invoice.id, '2000.00').expect(201);
    expect(b.body.invoice.status).toBe('paid');
    const res = await reverse(invoice.id, b.body.paymentId).expect(200);
    expect(res.body.invoice).toMatchObject({ status: 'sent', derivedStatus: 'partially_paid', amountPaid: '360.00', balance: '2000.00' });

    // The reversed row still exists, with who / when / why.
    const rows = await query<{ id: string; reversed_at: Date | null; reversed_by: string | null; reverse_reason: string | null }>(
      'SELECT id, reversed_at, reversed_by, reverse_reason FROM transactions ORDER BY created_at',
    );
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.id === a.body.paymentId)).toMatchObject({ reversed_at: null, reversed_by: null, reverse_reason: null });
    expect(rows.find(r => r.id === b.body.paymentId)).toMatchObject({ reversed_at: T0, reversed_by: ids.adminUser, reverse_reason: 'Cheque bounced (fake)' });

    // The detail lists both, the reversed one flagged; only the live one counts.
    const reversedPayment = res.body.invoice.payments.find((p: { id: string }) => p.id === b.body.paymentId);
    expect(reversedPayment).toMatchObject({ amount: '2000.00', reversedAt: T0.toISOString(), reverseReason: 'Cheque bounced (fake)', reversedByName: 'admin@example.test' });
    expect(res.body.invoice.payments.find((p: { id: string }) => p.id === a.body.paymentId).reversedAt).toBeNull();

    // The audit row keeps what the payment said (not the free-text reason).
    expect((await auditRows('invoice.payment_reversed'))[0].metadata).toEqual({
      transactionId: b.body.paymentId,
      amount: '2000.00',
      txnDate: TODAY,
      paymentMethod: 'UPI',
      referenceNumber: 'UTR-FAKE-1',
    });

    // The balance is open again, so the full amount can be paid once more (the reversed row doesn't block it).
    expect((await pay(invoice.id, '2000.00').expect(201)).body.invoice.status).toBe('paid');

    // Another invoice's payment can't be reversed through this one (404, like a missing id).
    const other = await sentInvoice();
    await reverse(other.id, a.body.paymentId).expect(404);
  });

  it('a reversed payment cannot be reversed twice (409); a reason is required', async () => {
    const invoice = await sentInvoice();
    const a = await pay(invoice.id, '100.00').expect(201);
    const noReason = await reverse(invoice.id, a.body.paymentId, ' ').expect(400);
    expect(noReason.body.details[0].path).toBe('reason');
    await agents.admin.delete(`/api/invoices/${invoice.id}/payments/${a.body.paymentId}`).expect(400);
    await reverse(invoice.id, a.body.paymentId).expect(200);
    expect((await reverse(invoice.id, a.body.paymentId).expect(409)).body.code).toBe('ALREADY_REVERSED');
    expect(await auditRows('invoice.payment_reversed')).toHaveLength(1);
  });

  it('after its payments are reversed, an invoice can be cancelled', async () => {
    const invoice = await sentInvoice();
    const a = await pay(invoice.id, '100.00').expect(201);
    await agents.admin.post(`/api/invoices/${invoice.id}/cancel`).send({ reason: 'x' }).expect(409);
    await reverse(invoice.id, a.body.paymentId).expect(200);
    await agents.admin.post(`/api/invoices/${invoice.id}/cancel`).send({ reason: 'x' }).expect(200);
  });
});

// ---------------------------------------------------------------------------
// Derived statuses, filters and the summary
// ---------------------------------------------------------------------------
describe('list, derived statuses and summary', () => {
  it('overdue / partially_paid / outstanding filters and the summary are derived from the clock', async () => {
    const draft = await createInvoice({ dueDate: '2026-10-20' });
    const due = await sentInvoice({ dueDate: '2026-10-20' }); // 2360.00, not yet due
    const overdue = await sentInvoice({ invoiceDate: '2026-09-01', dueDate: '2026-10-13' }); // 2360.00, due yesterday
    const partial = await sentInvoice({ dueDate: '2026-10-30' });
    await pay(partial.id, '360.00').expect(201); // balance 2000.00
    const paid = await sentInvoice();
    await pay(paid.id, '2360.00').expect(201);
    const cancelled = await createInvoice();
    await agents.admin.post(`/api/invoices/${cancelled.id}/cancel`).send({ reason: 'x' }).expect(200);
    // A payment last month does not count as collected this month.
    await query(`UPDATE transactions SET txn_date = '2026-09-30' WHERE invoice_id = $1`, [paid.id]);
    // A reversed payment counts nowhere (neither paid nor collected).
    const bounced = await pay(partial.id, '500.00').expect(201);
    await agents.admin.delete(`/api/invoices/${partial.id}/payments/${bounced.body.paymentId}`).send({ reason: 'Bounced (fake)' }).expect(200);

    const list = async (q: string) => (await agents.manager.get(`/api/invoices${q}`).expect(200)).body;
    const all = await list('');
    expect(all.total).toBe(6);
    const derived = Object.fromEntries(all.invoices.map((i: { id: string; derivedStatus: string }) => [i.id, i.derivedStatus]));
    expect(derived).toEqual({
      [draft.id]: 'draft',
      [due.id]: 'sent',
      [overdue.id]: 'overdue',
      [partial.id]: 'partially_paid',
      [paid.id]: 'paid',
      [cancelled.id]: 'cancelled',
    });
    expect(all.summary).toEqual({ outstandingTotal: '6720.00', overdueTotal: '2360.00', overdueCount: 1, draftCount: 1, collectedThisMonth: '360.00' });
    for (const row of all.invoices) {
      for (const key of ['subtotal', 'taxAmount', 'total', 'amountPaid', 'balance', 'taxRate']) expect(row[key]).toMatch(/^\d+\.\d{2}$/);
    }
    const idsOf = (body: { invoices: { id: string }[] }) => body.invoices.map(i => i.id).sort();
    expect(idsOf(await list('?status=overdue'))).toEqual([overdue.id]);
    expect(idsOf(await list('?status=partially_paid'))).toEqual([partial.id]);
    expect(idsOf(await list('?status=outstanding'))).toEqual([due.id, overdue.id, partial.id].sort());
    expect(idsOf(await list('?status=draft'))).toEqual([draft.id]);

    // Two days later the not-yet-due invoice is overdue too (nothing is stored).
    setClock(new Date('2026-10-21T04:00:00Z'));
    agents.manager = await signIn('manager@example.test'); // sessions last 12 hours
    expect(idsOf(await list('?status=overdue'))).toEqual([due.id, overdue.id].sort());
    expect((await list('')).summary.overdueTotal).toBe('4720.00');
  });

  it('filters by client, date range and search (number or client name), with pagination', async () => {
    const other = await company('Globex (Fake)');
    const a = await createInvoice({ invoiceDate: '2026-10-01', dueDate: '2026-10-31' });
    const b = await createInvoice({ clientId: other, invoiceDate: '2026-10-10', dueDate: '2026-10-31' });
    const list = async (q: string) => (await agents.admin.get(`/api/invoices${q}`).expect(200)).body;
    // A draft has no number, so a number search can't match it.
    expect((await list('?search=HM-')).total).toBe(0);
    a.invoiceNumber = (await agents.admin.post(`/api/invoices/${a.id}/send`).expect(200)).body.invoice.invoiceNumber;
    expect((await list(`?clientId=${other}`)).invoices.map((i: { id: string }) => i.id)).toEqual([b.id]);
    expect((await list('?from=2026-10-05&to=2026-10-31')).invoices.map((i: { id: string }) => i.id)).toEqual([b.id]);
    expect((await list('?search=globex')).invoices.map((i: { id: string }) => i.id)).toEqual([b.id]);
    expect((await list(`?search=${a.invoiceNumber}`)).invoices.map((i: { id: string }) => i.id)).toEqual([a.id]);
    expect((await list('?search=%25')).total).toBe(0); // % is literal
    const page = await list('?limit=1&offset=1');
    expect(page).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(page.invoices.map((i: { id: string }) => i.id)).toEqual([a.id]); // newest invoice date first
    await agents.admin.get('/api/invoices?status=bogus').expect(400);
    await agents.admin.get('/api/invoices?clientId=nope').expect(400);
  });
});
