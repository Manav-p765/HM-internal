// Client portal invoices (/api/portal/invoices): a client user reads their own company's issued invoices,
// read-only. Never drafts, never another company's, and never internal fields: no cancel reason, no payment
// notes or references, no who-recorded-what, no reversed payments. Asserted on the raw JSON text.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { istDate, now } from '../src/services/clock.js';
import { company, employee, resetAll, signIn, user } from './fixtures.js';

const SECRET_NOTE = 'INTERNAL-PAYMENT-NOTE-xyz';
const SECRET_REF = 'UTR-REF-SECRET-123';
const SECRET_REASON = 'INTERNAL-CANCEL-REASON-abc';
const REVERSE_REASON = 'INTERNAL-REVERSE-REASON-def';

let ids: { acme: string; globex: string; sent: string; paid: string; cancelled: string; draft: string; globexInv: string };
let acmeClient: request.Agent;
let admin: request.Agent;

async function invoiceFor(clientId: string, unitPrice: string, send = true): Promise<string> {
  const res = await admin
    .post('/api/invoices')
    .send({ clientId, dueDate: '2099-01-01', notes: 'Thank you for your business (printed)', items: [{ description: 'Design (fake)', quantity: '1', unitPrice }] })
    .expect(201);
  if (send) await admin.post(`/api/invoices/${res.body.invoice.id}/send`).expect(200);
  return res.body.invoice.id;
}

beforeEach(async () => {
  await resetAll();
  await query('TRUNCATE invoices, transactions CASCADE');
  await query(`UPDATE company_settings SET invoice_prefix = 'HM-', invoice_next_number = 1, default_gst_rate = 18`);
  await user('admin@example.test', 'admin', { employeeId: await employee('Ada Admin') });
  const acme = await company('Acme (Fake)');
  const globex = await company('Globex (Fake)');
  await user('client@acme.example.test', 'client', { clientId: acme });
  admin = await signIn('admin@example.test');
  const today = istDate(now());

  const sent = await invoiceFor(acme, '1000.00');
  // A live payment (with an internal note and reference) and a reversed one.
  await admin.post(`/api/invoices/${sent}/payments`).send({ amount: '300.00', txnDate: today, paymentMethod: 'UPI', referenceNumber: SECRET_REF, notes: SECRET_NOTE }).expect(201);
  const bounced = await admin.post(`/api/invoices/${sent}/payments`).send({ amount: '100.00', txnDate: today, paymentMethod: 'Cheque' }).expect(201);
  await admin.delete(`/api/invoices/${sent}/payments/${bounced.body.paymentId}`).send({ reason: REVERSE_REASON }).expect(200);

  const paid = await invoiceFor(acme, '500.00');
  await admin.post(`/api/invoices/${paid}/payments`).send({ amount: '590.00', txnDate: today, paymentMethod: 'Bank Transfer' }).expect(201);
  const cancelled = await invoiceFor(acme, '200.00');
  await admin.post(`/api/invoices/${cancelled}/cancel`).send({ reason: SECRET_REASON }).expect(200);
  const draft = await invoiceFor(acme, '999.00', false);
  const globexInv = await invoiceFor(globex, '777.00');

  ids = { acme, globex, sent, paid, cancelled, draft, globexInv };
  acmeClient = await signIn('client@acme.example.test');
});

afterAll(async () => {
  await pool.end();
});

describe('GET /api/portal/invoices', () => {
  it('lists only the company\'s issued invoices (sent, paid, cancelled), never drafts or another company\'s', async () => {
    const res = await acmeClient.get('/api/portal/invoices').expect(200);
    const listed = res.body.invoices.map((i: { id: string }) => i.id).sort();
    expect(listed).toEqual([ids.sent, ids.paid, ids.cancelled].sort());
    const sent = res.body.invoices.find((i: { id: string }) => i.id === ids.sent);
    // 1000 + 18% GST = 1180; 300 paid (the reversed 100 does not count).
    expect(sent).toEqual({
      id: ids.sent,
      invoiceNumber: expect.stringMatching(/^HM-\d{4}$/),
      invoiceDate: expect.any(String),
      dueDate: '2099-01-01',
      total: '1180.00',
      amountPaid: '300.00',
      balance: '880.00',
      status: 'sent',
      derivedStatus: 'partially_paid',
    });
    expect(res.body.summary).toEqual({ count: 3, outstandingTotal: '880.00', overdueTotal: '0.00', overdueCount: 0 });
    expect(JSON.stringify(res.body)).not.toMatch(new RegExp([SECRET_NOTE, SECRET_REF, SECRET_REASON, REVERSE_REASON, 'Globex'].join('|')));
  });

  it("another company's client sees only their own invoice; a company without invoices sees none", async () => {
    await user('client@globex.example.test', 'client', { clientId: ids.globex });
    const globex = await (await signIn('client@globex.example.test')).get('/api/portal/invoices').expect(200);
    expect(globex.body.invoices.map((i: { id: string }) => i.id)).toEqual([ids.globexInv]);
    expect(globex.body.summary).toEqual({ count: 1, outstandingTotal: '916.86', overdueTotal: '0.00', overdueCount: 0 });

    const initech = await company('Initech (Fake)');
    await user('client@initech.example.test', 'client', { clientId: initech });
    const none = await (await signIn('client@initech.example.test')).get('/api/portal/invoices').expect(200);
    expect(none.body).toEqual({ invoices: [], summary: { count: 0, outstandingTotal: '0.00', overdueTotal: '0.00', overdueCount: 0 } });
  });
});

describe('GET /api/portal/invoices/:id', () => {
  it('returns the printable invoice with live payments only and no internal fields', async () => {
    const res = await acmeClient.get(`/api/portal/invoices/${ids.sent}`).expect(200);
    const { invoice, company: issuer } = res.body;
    expect(invoice).toMatchObject({ id: ids.sent, clientName: 'Acme (Fake)', subtotal: '1000.00', taxAmount: '180.00', total: '1180.00', balance: '880.00' });
    expect(invoice.totalInWords).toMatch(/Rupees/);
    expect(invoice.items).toHaveLength(1);
    expect(invoice.payments).toEqual([{ id: expect.any(String), txnDate: expect.any(String), amount: '300.00', paymentMethod: 'UPI' }]);
    expect(Object.keys(issuer).sort()).toEqual(
      ['bankDetails', 'companyAddress', 'companyEmail', 'companyGstin', 'companyName', 'companyPhone', 'logoDataUrl', 'terms'].sort(),
    );
    const raw = JSON.stringify(res.body);
    for (const hidden of [SECRET_NOTE, SECRET_REF, REVERSE_REASON, 'recordedByName', 'reversedAt', 'cancelReason', 'clientId', 'createdAt', 'invoicePrefix', 'invoiceNextNumber', 'admin@example.test']) {
      expect(raw).not.toContain(hidden);
    }
  });

  it('a cancelled invoice is readable without its cancel reason', async () => {
    const res = await acmeClient.get(`/api/portal/invoices/${ids.cancelled}`).expect(200);
    expect(res.body.invoice.status).toBe('cancelled');
    expect(JSON.stringify(res.body)).not.toContain(SECRET_REASON);
  });

  it('a draft, another company\'s invoice, a missing id and a malformed id are the same 404', async () => {
    for (const id of [ids.draft, ids.globexInv, '00000000-0000-4000-a000-00000000dead', 'not-a-uuid']) {
      const res = await acmeClient.get(`/api/portal/invoices/${id}`).expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    }
  });

  it('staff use /api/invoices, not the portal: 403 for admin, manager and employee; 401 anonymous', async () => {
    await user('manager@example.test', 'manager');
    await user('staff@example.test', 'employee', { employeeId: await employee('Sam Staff') });
    for (const agent of [admin, await signIn('manager@example.test'), await signIn('staff@example.test')]) {
      await agent.get('/api/portal/invoices').expect(403);
      await agent.get(`/api/portal/invoices/${ids.sent}`).expect(403);
    }
    await request(app).get('/api/portal/invoices').expect(401);
  });

  it('a client still cannot use the staff invoice API', async () => {
    await acmeClient.get('/api/invoices').expect(403);
    await acmeClient.get(`/api/invoices/${ids.sent}`).expect(403);
  });
});
