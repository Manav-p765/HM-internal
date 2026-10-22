// Invoices in another currency: the client's default currency, payments with the INR received, summaries and
// reports that never add currencies together, the total in words, and the signature in company settings.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pool, query } from '../src/db.js';
import { amountInWords } from '../src/services/amountInWords.js';
import { resetClock, setClock } from '../src/services/clock.js';
import { company, resetAll, signIn, user } from './fixtures.js';

// Wednesday 2026-10-14, 09:30 IST.
const TODAY = '2026-10-14';
const T0 = new Date('2026-10-14T04:00:00Z');

let admin: request.Agent;
let ids: { acme: string; globex: string };

const line = { description: 'Design work (fake)', quantity: '2', unitPrice: '500' };

async function createInvoice(body: Record<string, unknown>) {
  const res = await admin.post('/api/invoices').send({ invoiceDate: TODAY, dueDate: '2026-10-29', items: [line], ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.invoice;
}

async function sentInvoice(body: Record<string, unknown>) {
  const invoice = await createInvoice(body);
  await admin.post(`/api/invoices/${invoice.id}/send`).expect(200);
  return invoice;
}

const pay = (id: string, body: Record<string, unknown>) =>
  admin.post(`/api/invoices/${id}/payments`).send({ txnDate: TODAY, paymentMethod: 'Bank Transfer', ...body });

beforeEach(async () => {
  setClock(T0);
  await resetAll();
  await query(
    `UPDATE company_settings SET invoice_prefix = 'HM-', invoice_next_number = 1, default_gst_rate = 0,
            logo_data_url = NULL, signature_data_url = NULL, signatory_name = NULL, signatory_designation = NULL`,
  );
  await user('admin@example.test', 'admin');
  const acme = await company('Acme US (Fake)');
  await query(`UPDATE clients SET currency = 'USD' WHERE id = $1`, [acme]);
  const globex = await company('Globex India (Fake)');
  ids = { acme, globex };
  admin = await signIn('admin@example.test');
});

afterEach(() => resetClock());

afterAll(async () => {
  await pool.end();
});

describe('currency of an invoice', () => {
  it("takes the client's default currency, unless the request chose one", async () => {
    expect((await createInvoice({ clientId: ids.acme })).currency).toBe('USD');
    expect((await createInvoice({ clientId: ids.globex })).currency).toBe('INR');
    expect((await createInvoice({ clientId: ids.globex, currency: 'EUR' })).currency).toBe('EUR');
    expect((await createInvoice({ clientName: 'Walk-in (Fake)' })).currency).toBe('INR');
  });

  it('refuses an unsupported currency', async () => {
    const res = await admin.post('/api/invoices').send({ clientId: ids.acme, dueDate: '2026-10-29', currency: 'XYZ', items: [line] }).expect(400);
    expect(res.body.details).toEqual([expect.objectContaining({ path: 'currency' })]);
  });

  it('a draft can change currency (a new client brings its own); a sent invoice cannot', async () => {
    const draft = await createInvoice({ clientId: ids.globex });
    expect((await admin.patch(`/api/invoices/${draft.id}`).send({ clientId: ids.acme }).expect(200)).body.invoice.currency).toBe('USD');
    expect((await admin.patch(`/api/invoices/${draft.id}`).send({ currency: 'GBP' }).expect(200)).body.invoice.currency).toBe('GBP');
    await admin.post(`/api/invoices/${draft.id}/send`).expect(200);
    await admin.patch(`/api/invoices/${draft.id}`).send({ currency: 'INR' }).expect(409);
  });

  it('spells the total in the invoice currency', async () => {
    const invoice = await createInvoice({ clientId: ids.acme, items: [{ description: 'x', quantity: '1', unitPrice: '1250.50' }] });
    expect(invoice.totalInWords).toBe('One Thousand Two Hundred and Fifty US Dollars and Fifty Cents Only');
  });

  it('a client saves its default currency', async () => {
    const created = await admin.post('/api/clients').send({ companyName: 'Initech UK (Fake)', currency: 'GBP' }).expect(201);
    expect(created.body.client.currency).toBe('GBP');
    const updated = await admin.patch(`/api/clients/${created.body.client.id}`).send({ currency: 'EUR' }).expect(200);
    expect(updated.body.client.currency).toBe('EUR');
    await admin.patch(`/api/clients/${created.body.client.id}`).send({ currency: 'usd ' }).expect(400);
  });
});

describe('payments on a foreign-currency invoice', () => {
  it('count the invoice-currency amount towards the balance and put the INR received in the ledger', async () => {
    const invoice = await sentInvoice({ clientId: ids.acme }); // USD 1000.00
    const missing = await pay(invoice.id, { amount: '400.00' }).expect(400);
    expect(missing.body.details).toEqual([expect.objectContaining({ path: 'amountInr' })]);

    const res = await pay(invoice.id, { amount: '400.00', amountInr: '33400.00' }).expect(201);
    expect(res.body.invoice).toMatchObject({ currency: 'USD', amountPaid: '400.00', balance: '600.00', derivedStatus: 'partially_paid' });
    expect(res.body.invoice.payments[0]).toMatchObject({ amount: '400.00', amountInr: '33400.00' });

    const [txn] = await query<{ amount: string; invoice_amount: string; description: string }>(
      `SELECT amount::text, invoice_amount::text, description FROM transactions WHERE id = $1`,
      [res.body.paymentId],
    );
    expect(txn).toEqual({ amount: '33400.00', invoice_amount: '400.00', description: 'Payment for HM-0001 (USD 400.00)' });

    // The overpayment check is in the invoice currency.
    await pay(invoice.id, { amount: '600.01', amountInr: '1.00' }).expect(409);
    const paid = await pay(invoice.id, { amount: '600.00', amountInr: '50100.00' }).expect(201);
    expect(paid.body.invoice.status).toBe('paid');

    // The ledger and P&L see INR only.
    const pnl = await admin.get('/api/reports/profit-loss?preset=this_month').expect(200);
    expect(JSON.stringify(pnl.body)).toContain('83500.00');
  });

  it('an INR invoice needs no INR amount, and refuses a different one', async () => {
    const invoice = await sentInvoice({ clientId: ids.globex });
    await pay(invoice.id, { amount: '100.00', amountInr: '99.00' }).expect(400);
    const res = await pay(invoice.id, { amount: '100.00' }).expect(201);
    expect(res.body.invoice.payments[0]).toMatchObject({ amount: '100.00', amountInr: '100.00' });
  });
});

describe('summaries never add currencies together', () => {
  it('the list summary keeps INR apart from every other currency', async () => {
    await sentInvoice({ clientId: ids.acme }); // USD 1000
    await sentInvoice({ clientId: ids.globex }); // INR 1000
    await sentInvoice({ clientId: ids.globex, currency: 'EUR' }); // EUR 1000
    const { summary } = (await admin.get('/api/invoices').expect(200)).body;
    expect(summary.outstandingTotal).toBe('1000.00');
    expect(summary.otherCurrencies).toEqual([
      { currency: 'EUR', outstandingTotal: '1000.00', overdueTotal: '0.00' },
      { currency: 'USD', outstandingTotal: '1000.00', overdueTotal: '0.00' },
    ]);
  });

  it('the invoice report is for one currency at a time', async () => {
    await sentInvoice({ clientId: ids.acme });
    await sentInvoice({ clientId: ids.acme });
    await sentInvoice({ clientId: ids.globex });
    const inr = (await admin.get('/api/reports/invoices?preset=this_month').expect(200)).body;
    expect(inr).toMatchObject({ currency: 'INR', currencies: ['INR', 'USD'] });
    expect(inr.summary.invoiced).toBe('1000.00');
    const usd = (await admin.get('/api/reports/invoices?preset=this_month&currency=USD').expect(200)).body;
    expect(usd.summary.invoiced).toBe('2000.00');
    expect(usd.openInvoices).toHaveLength(2);
    await admin.get('/api/reports/invoices?currency=ABC').expect(400);
    const csv = await admin.get('/api/reports/invoices.csv?preset=this_month&currency=USD').expect(200);
    expect(csv.text.split('\r\n')[0]).toBe('﻿Invoice,Client,Invoice date,Due date,Status,Total (USD),Paid (USD),Balance (USD),Days overdue');
  });
});

describe('amountInWords', () => {
  it('uses Indian grouping for INR and international grouping otherwise', () => {
    expect(amountInWords('118000.50')).toBe('One Lakh Eighteen Thousand Indian Rupees and Fifty Paise Only');
    expect(amountInWords('2500000.00', 'USD')).toBe('Two Million Five Hundred Thousand US Dollars Only');
    expect(amountInWords('1000000005.00', 'EUR')).toBe('One Billion and Five Euros Only');
    expect(amountInWords('0.05', 'GBP')).toBe('Five Pence Only');
    expect(amountInWords('0.00', 'AED')).toBe('Zero UAE Dirhams Only');
  });
});

describe('signature in company settings', () => {
  // The smallest valid PNG signature bytes, padded; the server checks the file signature, not the image.
  const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64')}`;

  it('saves a signature image, name and designation, and refuses anything else', async () => {
    const res = await admin
      .patch('/api/settings/company')
      .send({ signatureDataUrl: png, signatoryName: 'Asha Rao (Fake)', signatoryDesignation: 'Director' })
      .expect(200);
    expect(res.body.company).toMatchObject({ signatureDataUrl: png, signatoryName: 'Asha Rao (Fake)', signatoryDesignation: 'Director' });

    const bad = await admin.patch('/api/settings/company').send({ signatureDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }).expect(400);
    expect(bad.body.details).toEqual([{ path: 'signatureDataUrl', message: 'Signature must be a PNG, JPEG or WebP image' }]);
    const renamed = `data:image/jpeg;base64,${Buffer.from('not a jpeg at all').toString('base64')}`;
    await admin.patch('/api/settings/company').send({ signatureDataUrl: renamed }).expect(400);

    const removed = await admin.patch('/api/settings/company').send({ signatureDataUrl: null }).expect(200);
    expect(removed.body.company.signatureDataUrl).toBeNull();
  });
});
