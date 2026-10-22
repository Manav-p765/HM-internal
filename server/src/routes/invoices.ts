import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { amountInWords } from '../services/amountInWords.js';
import { audit } from '../services/audit.js';
import { BASE_CURRENCY, currencyValue, type Currency } from '../services/currency.js';
import { istDate, now } from '../services/clock.js';
import {
  compareMoney,
  computeTotals,
  MAX_LINES,
  moneyAmount,
  MoneyRangeError,
  percentValue,
  quantityValue,
  subtractMoney,
} from '../services/money.js';
import { createRouter } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { isoDate, likePattern, optionalEmail, optionalGstin, optionalText, pageQuery } from './shared.js';
import { formatInvoiceNumber } from './settings.js';

// Invoices: admin only (managers see no money at all). Clients read their own company's issued invoices
// through /api/portal/invoices, never through these routes.
// Employees and clients are refused everywhere (clients never see finance).
//
// Lifecycle: draft (no number; everything editable, may be deleted) -> sent (the number is assigned now;
// client and lines locked; only the due date and notes change) -> paid (when payments reach the total;
// locked). Draft or sent invoices without payments can be cancelled; a cancelled invoice keeps its number
// (if it had one) and is never deleted. Numbers are never changed or reused.
// Payments are income transactions (category "Invoice Payment", invoice_id set). A reversed payment stays in
// the ledger (reversed_at/by/reason) and is ignored by every sum. Derived states are never stored: amount
// paid, balance, overdue (sent, balance > 0, due date before today IST) and partially paid.
// All money is computed by services/money.ts and travels as 2-decimal strings.
// Currency: an invoice is in one currency (`currency`, taken from the client's default unless the request
// chose one); its lines, totals, payments (`amount`) and balance are all in it. Each payment also records the
// INR actually received (`amountInr`, the ledger's transactions.amount); for an INR invoice the two are equal.
// Sums over several invoices never mix currencies: the list summary gives INR and each other currency apart.
export const invoicesRouter = createRouter();

export const PAYMENT_METHODS = ['Bank Transfer', 'UPI', 'Credit Card', 'Cheque', 'Cash'] as const;
export const PAYMENT_CATEGORY = 'Invoice Payment';
const LIST_STATUSES = ['draft', 'sent', 'paid', 'cancelled', 'overdue', 'partially_paid', 'outstanding'] as const;

const notFound = () => new HttpError(404, 'Invoice not found', 'NOT_FOUND');
const locked = (message = 'This invoice can no longer be changed') => new HttpError(409, message, 'INVOICE_LOCKED');

function parseId(raw: unknown): string {
  const result = z.uuid().safeParse(raw);
  if (!result.success) throw notFound();
  return result.data;
}

// ---------------------------------------------------------------------------
// SQL fragments. $TODAY is the IST date of the server clock, always passed as a parameter.
// ---------------------------------------------------------------------------
export const PAID_JOIN = `
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(t.invoice_amount), 0)::numeric(14,2) AS paid FROM transactions t WHERE t.invoice_id = i.id AND t.reversed_at IS NULL
  ) p ON true`;

export const BALANCE_SQL = `(CASE WHEN i.status = 'cancelled' THEN 0 ELSE i.total_amount - p.paid END)::numeric(14,2)`;
export const overdueSql = (today: string) => `(i.status = 'sent' AND i.total_amount > p.paid AND i.due_date < ${today}::date)`;
const partiallyPaidSql = `(i.status = 'sent' AND p.paid > 0 AND i.total_amount > p.paid)`;
// Overdue wins over partially paid (an overdue invoice may also be partly paid).
export const derivedStatusSql = (today: string) => `
  CASE WHEN ${overdueSql(today)} THEN 'overdue'
       WHEN ${partiallyPaidSql} THEN 'partially_paid'
       ELSE i.status END`;

const invoiceColumns = (today: string) => `
  i.id, i.invoice_number AS "invoiceNumber", i.client_id AS "clientId", i.client_name AS "clientName",
  i.client_email AS "clientEmail", i.client_address AS "clientAddress", i.client_gstin AS "clientGstin",
  i.invoice_date AS "invoiceDate", i.due_date AS "dueDate", i.currency,
  i.subtotal::text AS subtotal, i.tax_rate::text AS "taxRate", i.tax_amount::text AS "taxAmount", i.total_amount::text AS total,
  p.paid::text AS "amountPaid", ${BALANCE_SQL}::text AS balance,
  i.status, ${derivedStatusSql(today)} AS "derivedStatus",
  i.notes, i.sent_at AS "sentAt", i.cancelled_at AS "cancelledAt", i.cancel_reason AS "cancelReason",
  i.created_at AS "createdAt", i.updated_at AS "updatedAt"`;

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  clientId: string | null;
  clientName: string;
  invoiceDate: string;
  dueDate: string;
  currency: Currency;
  total: string;
  amountPaid: string;
  balance: string;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  derivedStatus: string;
}

const todayIst = () => istDate(now());

async function loadInvoice(id: string, db: Pick<PoolClient, 'query'> | null = null) {
  const run = async <T>(sql: string, params: unknown[]) =>
    db ? ((await db.query(sql, params)).rows as T[]) : await query<T & Record<string, unknown>>(sql, params);
  const [invoice] = await run<InvoiceRow>(`SELECT ${invoiceColumns('$2')} FROM invoices i ${PAID_JOIN} WHERE i.id = $1`, [id, todayIst()]);
  if (!invoice) throw notFound();
  const items = await run(
    `SELECT id, position, description, quantity::text AS quantity, unit_price::text AS "unitPrice", line_total::text AS "lineTotal"
       FROM invoice_items WHERE invoice_id = $1 ORDER BY position`,
    [id],
  );
  const payments = await run(
    `SELECT t.id, t.txn_date AS "txnDate", t.invoice_amount::text AS amount, t.amount::text AS "amountInr",
            t.payment_method AS "paymentMethod",
            t.reference_number AS "referenceNumber", t.notes, t.created_at AS "createdAt",
            coalesce(e.full_name, u.email::text) AS "recordedByName",
            t.reversed_at AS "reversedAt", t.reverse_reason AS "reverseReason",
            CASE WHEN t.reversed_by IS NULL THEN NULL ELSE coalesce(re.full_name, ru.email::text) END AS "reversedByName"
       FROM transactions t
       JOIN users u ON u.id = t.created_by
       LEFT JOIN employees e ON e.id = u.employee_id
       LEFT JOIN users ru ON ru.id = t.reversed_by
       LEFT JOIN employees re ON re.id = ru.employee_id
      WHERE t.invoice_id = $1
      ORDER BY t.txn_date, t.created_at`,
    [id],
  );
  // Printed under the totals; derived from the stored total on every read, never stored.
  return { ...invoice, totalInWords: amountInWords(invoice.total, invoice.currency), items, payments };
}

// ---------------------------------------------------------------------------
// GET /api/invoices  (admin)
//   ?status=draft|sent|paid|cancelled|overdue|partially_paid|outstanding &clientId= &from= &to= &search= &limit &offset
// ---------------------------------------------------------------------------
const listQuery = pageQuery.extend({
  status: z.enum(LIST_STATUSES).optional(),
  clientId: z.uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  search: z.string().trim().max(100).optional(),
});

invoicesRouter.get('/', ['admin'], async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  const { status, clientId, from, to, search, limit, offset } = parsed.data;
  const today = todayIst();

  const params: unknown[] = [today];
  const where: string[] = [];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };
  if (status === 'overdue') where.push(overdueSql('$1'));
  else if (status === 'partially_paid') where.push(partiallyPaidSql);
  else if (status === 'outstanding') where.push(`(i.status = 'sent' AND i.total_amount > p.paid)`);
  else if (status) add(p => `i.status = ${p}`, status);
  if (clientId) add(p => `i.client_id = ${p}`, clientId);
  if (from) add(p => `i.invoice_date >= ${p}::date`, from);
  if (to) add(p => `i.invoice_date <= ${p}::date`, to);
  // Drafts have no number, so a number search only ever matches numbered invoices.
  if (search) add(p => `(i.invoice_number ILIKE ${p} OR i.client_name ILIKE ${p})`, likePattern(search));
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const monthStart = `${today.slice(0, 7)}-01`;
  const [invoices, [{ total }], [summary], byCurrency] = await Promise.all([
    query(
      `SELECT ${invoiceColumns('$1')} FROM invoices i ${PAID_JOIN} ${whereSql}
        ORDER BY i.invoice_date DESC, i.invoice_number DESC NULLS FIRST, i.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    // The CTE types $1 (today) even when no filter uses it.
    query<{ total: number }>(
      `WITH params AS (SELECT $1::date AS today) SELECT count(*)::int AS total FROM invoices i ${PAID_JOIN} ${whereSql}`,
      params,
    ),
    // Headline numbers over all invoices (not the filtered page). Outstanding and overdue are per currency
    // (outstandingByCurrency); collected this month is the INR received (the ledger), whatever the currency.
    query(
      `SELECT count(*) FILTER (WHERE ${overdueSql('$1')})::int AS "overdueCount",
              count(*) FILTER (WHERE i.status = 'draft')::int AS "draftCount",
              (SELECT coalesce(sum(t.amount), 0)::numeric(14,2)::text FROM transactions t
                WHERE t.invoice_id IS NOT NULL AND t.reversed_at IS NULL AND t.txn_date BETWEEN $2::date AND $1::date) AS "collectedThisMonth"
         FROM invoices i ${PAID_JOIN}`,
      [today, monthStart],
    ),
    outstandingByCurrency(today),
  ]);
  res.json({ today, invoices, total, limit, offset, summary: { ...summary, ...splitByCurrency(byCurrency) } });
});

type CurrencyTotals = { currency: Currency; outstandingTotal: string; overdueTotal: string };

// Outstanding and overdue balances of sent invoices, one row per currency that has any. `scope` narrows the
// invoices (the portal passes its own company as $2); $1 is today.
export function outstandingByCurrency(today: string, scope = 'true', scopeParams: unknown[] = []) {
  return query<CurrencyTotals>(
    `SELECT i.currency,
            sum(${BALANCE_SQL})::numeric(14,2)::text AS "outstandingTotal",
            coalesce(sum(${BALANCE_SQL}) FILTER (WHERE ${overdueSql('$1')}), 0)::numeric(14,2)::text AS "overdueTotal"
       FROM invoices i ${PAID_JOIN}
      WHERE i.status = 'sent' AND i.total_amount > p.paid AND ${scope}
      GROUP BY i.currency
      ORDER BY i.currency`,
    [today, ...scopeParams],
  );
}

// INR stays in outstandingTotal/overdueTotal; every other currency with a balance is listed apart, never added.
export function splitByCurrency(rows: CurrencyTotals[]) {
  const inr = rows.find(r => r.currency === BASE_CURRENCY);
  return {
    outstandingTotal: inr?.outstandingTotal ?? '0.00',
    overdueTotal: inr?.overdueTotal ?? '0.00',
    otherCurrencies: rows.filter(r => r.currency !== BASE_CURRENCY),
  };
}

// ---------------------------------------------------------------------------
// GET /api/invoices/:id  (admin)
// ---------------------------------------------------------------------------
invoicesRouter.get('/:id', ['admin'], async (req, res) => {
  res.json({ today: todayIst(), invoice: await loadInvoice(parseId(req.params.id)) });
});

// ---------------------------------------------------------------------------
// Create / edit bodies
// ---------------------------------------------------------------------------
const itemSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(500),
  quantity: quantityValue,
  unitPrice: moneyAmount('Unit price'),
});

const fields = {
  clientId: z.uuid('Choose a valid client').nullish(),
  clientName: z.string().trim().max(200).nullish(),
  clientEmail: optionalEmail,
  clientAddress: optionalText(1000),
  clientGstin: optionalGstin,
  invoiceDate: isoDate,
  dueDate: isoDate,
  currency: currencyValue,
  taxRate: percentValue('Tax rate'),
  notes: optionalText(4000),
  items: z
    .array(itemSchema)
    .min(1, 'Add at least one line item')
    .max(MAX_LINES, `An invoice can have at most ${MAX_LINES} lines`),
};

const createSchema = z
  .object({ ...fields, invoiceDate: fields.invoiceDate.optional(), currency: fields.currency.optional(), taxRate: fields.taxRate.optional() })
  .strict();
const patchSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine(body => Object.keys(body).length > 0, 'Nothing to update');

type Body = Partial<z.infer<typeof patchSchema>>;
const SNAPSHOT = ['clientName', 'clientEmail', 'clientAddress', 'clientGstin'] as const;
const sentKeys = (raw: unknown) => new Set(raw && typeof raw === 'object' ? Object.keys(raw) : []);

// Fills the client snapshot from the client record for every snapshot field the request did not send
// (`sent` = the keys present in the raw request body; parsed bodies turn a missing field into null), and
// returns the client's default currency. An unknown client is a 400 on clientId; an inactive one a 409.
async function clientSnapshot(db: PoolClient, clientId: string, body: Body, sent: Set<string>) {
  const { rows } = await db.query(
    `SELECT company_name AS "clientName", contact_email AS "clientEmail", address AS "clientAddress", gstin AS "clientGstin",
            status, currency
       FROM clients WHERE id = $1`,
    [clientId],
  );
  const client = rows[0];
  if (!client) {
    throw new HttpError(400, 'Choose a valid client', 'VALIDATION_ERROR', [{ path: 'clientId', message: 'Client not found' }]);
  }
  if (client.status !== 'active') throw new HttpError(409, 'This client is inactive', 'CLIENT_INACTIVE');
  const snapshot: Record<string, unknown> = {};
  for (const key of SNAPSHOT) snapshot[key] = sent.has(key) ? body[key] : client[key];
  return { snapshot, currency: client.currency as Currency };
}

function totalsFor(items: { quantity: string; unitPrice: string }[], taxRate: string) {
  try {
    return computeTotals({ items, taxRate });
  } catch (err) {
    if (err instanceof MoneyRangeError) {
      throw new HttpError(400, err.message, 'VALIDATION_ERROR', [{ path: 'items', message: err.message }]);
    }
    throw err;
  }
}

function checkDates(invoiceDate: string, dueDate: string) {
  if (dueDate < invoiceDate) {
    throw new HttpError(400, 'The due date cannot be before the invoice date', 'VALIDATION_ERROR', [
      { path: 'dueDate', message: 'The due date cannot be before the invoice date' },
    ]);
  }
}

async function insertItems(db: PoolClient, invoiceId: string, items: { description: string; quantity: string; unitPrice: string }[]) {
  const params: unknown[] = [invoiceId];
  const values = items.map((item, index) => {
    params.push(index, item.description, item.quantity, item.unitPrice);
    const n = params.length;
    return `($1, $${n - 3}, $${n - 2}, $${n - 1}, $${n})`;
  });
  await db.query(`INSERT INTO invoice_items (invoice_id, position, description, quantity, unit_price) VALUES ${values.join(', ')}`, params);
}

// ---------------------------------------------------------------------------
// POST /api/invoices  (admin): a draft, without a number (it gets one at send). The server
// computes the totals.
// ---------------------------------------------------------------------------
invoicesRouter.post('/', ['admin'], async (req, res) => {
  const body = parseBody(createSchema, req.body);
  const invoiceDate = body.invoiceDate ?? todayIst();
  checkDates(invoiceDate, body.dueDate);
  if (!body.clientId && !body.clientName) {
    throw new HttpError(400, 'Choose a client or enter a client name', 'VALIDATION_ERROR', [
      { path: 'clientName', message: 'Choose a client or enter a client name' },
    ]);
  }

  const id = await withTransaction(async db => {
    const {
      rows: [settings],
    } = await db.query<{ rate: string }>(`SELECT default_gst_rate::text AS rate FROM company_settings`);
    const taxRate = body.taxRate ?? settings.rate;
    const totals = totalsFor(body.items, taxRate);
    const fromClient = body.clientId ? await clientSnapshot(db, body.clientId, body, sentKeys(req.body)) : null;
    const snapshot = fromClient?.snapshot ?? Object.fromEntries(SNAPSHOT.map(k => [k, body[k] ?? null]));
    const currency = body.currency ?? fromClient?.currency ?? BASE_CURRENCY;

    const {
      rows: [row],
    } = await db.query<{ id: string }>(
      `INSERT INTO invoices (client_id, client_name, client_email, client_address, client_gstin,
                             invoice_date, due_date, subtotal, tax_rate, tax_amount, total_amount, status, notes, created_by, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', $12, $13, $14) RETURNING id`,
      [
        body.clientId ?? null,
        snapshot.clientName ?? '',
        snapshot.clientEmail ?? null,
        snapshot.clientAddress ?? null,
        snapshot.clientGstin ?? null,
        invoiceDate,
        body.dueDate,
        totals.subtotal,
        taxRate,
        totals.taxAmount,
        totals.total,
        body.notes ?? null,
        req.user!.id,
        currency,
      ],
    );
    await insertItems(db, row.id, body.items);
    return row.id;
  });

  const invoice = await loadInvoice(id);
  await audit(req, { action: 'invoice.created', entityType: 'invoice', entityId: id, metadata: { invoiceNumber: invoice.invoiceNumber } });
  res.status(201).json({ invoice });
});

// Locks the invoice row for the rest of the transaction; missing -> 404.
async function lockInvoice(db: PoolClient, id: string) {
  const { rows } = await db.query<{
    id: string;
    invoiceNumber: string | null;
    status: InvoiceRow['status'];
    clientId: string | null;
    clientName: string;
    invoiceDate: string;
    dueDate: string;
    taxRate: string;
    total: string;
    currency: Currency;
  }>(
    `SELECT id, invoice_number AS "invoiceNumber", status, client_id AS "clientId", client_name AS "clientName",
            invoice_date AS "invoiceDate", due_date AS "dueDate", tax_rate::text AS "taxRate", total_amount::text AS total, currency
       FROM invoices WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}

async function paidSoFar(db: PoolClient, id: string): Promise<string> {
  const { rows } = await db.query<{ paid: string }>(
    `SELECT coalesce(sum(invoice_amount), 0)::numeric(14,2)::text AS paid FROM transactions WHERE invoice_id = $1 AND reversed_at IS NULL`,
    [id],
  );
  return rows[0].paid;
}

// ---------------------------------------------------------------------------
// PATCH /api/invoices/:id  (admin)
//   draft: everything (items replaced as a set, totals recomputed); sent: only dueDate and notes;
//   paid / cancelled: 409 INVOICE_LOCKED.
// ---------------------------------------------------------------------------
const SENT_EDITABLE = new Set(['dueDate', 'notes']);

invoicesRouter.patch('/:id', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(patchSchema, req.body) as Body;
  const sent = sentKeys(req.body);
  const fieldsChanged = Object.keys(body).filter(k => sent.has(k));

  await withTransaction(async db => {
    const current = await lockInvoice(db, id);
    if (current.status === 'paid' || current.status === 'cancelled') throw locked();
    if (current.status === 'sent' && fieldsChanged.some(f => !SENT_EDITABLE.has(f))) {
      throw locked('After sending, only the due date and notes can be changed');
    }
    checkDates(body.invoiceDate ?? current.invoiceDate, body.dueDate ?? current.dueDate);

    const sets: string[] = [];
    const params: unknown[] = [id];
    const set = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (sent.has('dueDate')) set('due_date', body.dueDate);
    if (sent.has('notes')) set('notes', body.notes);

    if (current.status === 'draft') {
      if (sent.has('invoiceDate')) set('invoice_date', body.invoiceDate);
      // Client: a new clientId refills the snapshot and the currency (fields sent in the request win);
      // clientId: null unlinks.
      if (body.clientId) {
        const { snapshot, currency } = await clientSnapshot(db, body.clientId, body, sent);
        set('client_id', body.clientId);
        for (const key of SNAPSHOT) set(key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`), snapshot[key] ?? (key === 'clientName' ? '' : null));
        if (!sent.has('currency')) set('currency', currency);
      } else {
        if (body.clientId === null) set('client_id', null);
        for (const key of SNAPSHOT) {
          if (sent.has(key)) set(key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`), body[key] ?? (key === 'clientName' ? '' : null));
        }
      }
      if (sent.has('currency')) set('currency', body.currency);
      if (body.items || body.taxRate !== undefined) {
        const taxRate = body.taxRate ?? current.taxRate;
        const items =
          body.items ??
          (
            await db.query<{ quantity: string; unitPrice: string }>(
              `SELECT quantity::text AS quantity, unit_price::text AS "unitPrice" FROM invoice_items WHERE invoice_id = $1 ORDER BY position`,
              [id],
            )
          ).rows;
        const totals = totalsFor(items, taxRate);
        set('tax_rate', taxRate);
        set('subtotal', totals.subtotal);
        set('tax_amount', totals.taxAmount);
        set('total_amount', totals.total);
        if (body.items) {
          await db.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
          await insertItems(db, id, body.items);
        }
      }
    }
    if (sets.length) await db.query(`UPDATE invoices SET ${sets.join(', ')} WHERE id = $1`, params);
  });

  await audit(req, { action: 'invoice.updated', entityType: 'invoice', entityId: id, metadata: { fields: fieldsChanged } });
  res.json({ invoice: await loadInvoice(id) });
});

// The next invoice number. The settings row is locked for the rest of the transaction, so concurrent sends
// queue here: numbers are unique and sequential, and only a send that commits consumes one (a deleted or
// cancelled draft never does). Numbers already taken (e.g. after the prefix was changed back) are skipped.
async function takeInvoiceNumber(db: PoolClient): Promise<string> {
  const {
    rows: [settings],
  } = await db.query<{ prefix: string; next: number }>(
    `SELECT invoice_prefix AS prefix, invoice_next_number AS next FROM company_settings FOR UPDATE`,
  );
  let next = settings.next;
  let number = formatInvoiceNumber(settings.prefix, next);
  while ((await db.query('SELECT 1 FROM invoices WHERE invoice_number = $1', [number])).rowCount) {
    next += 1;
    number = formatInvoiceNumber(settings.prefix, next);
  }
  await db.query('UPDATE company_settings SET invoice_next_number = $1', [next + 1]);
  return number;
}

// ---------------------------------------------------------------------------
// POST /api/invoices/:id/send  (admin): draft -> sent; the invoice gets its number. No email is
// sent (v2).
// ---------------------------------------------------------------------------
invoicesRouter.post('/:id/send', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  await withTransaction(async db => {
    const current = await lockInvoice(db, id);
    if (current.status !== 'draft') throw new HttpError(409, 'Only a draft can be sent', 'INVALID_STATUS');
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM invoice_items WHERE invoice_id = $1', [id]);
    if (rows[0].n === 0) throw new HttpError(409, 'Add at least one line item before sending', 'INVOICE_INCOMPLETE');
    // A zero total could never be paid (payments must be greater than 0), so it would stay "sent" forever.
    if (compareMoney(current.total, '0.00') <= 0) throw new HttpError(409, 'The invoice total must be more than zero', 'INVOICE_INCOMPLETE');
    if (!current.clientName.trim()) throw new HttpError(409, 'Enter a client name before sending', 'INVOICE_INCOMPLETE');
    // Drafts from before numbers moved to send (migration 007) already have one and keep it.
    const number = current.invoiceNumber ?? (await takeInvoiceNumber(db));
    await db.query(`UPDATE invoices SET status = 'sent', sent_at = $2, invoice_number = $3 WHERE id = $1`, [id, now(), number]);
  });
  const invoice = await loadInvoice(id);
  await audit(req, { action: 'invoice.sent', entityType: 'invoice', entityId: id, metadata: { invoiceNumber: invoice.invoiceNumber } });
  res.json({ invoice });
});

// ---------------------------------------------------------------------------
// POST /api/invoices/:id/cancel  (admin): draft or sent, no live payments, reason required. Keeps its number
// if it has one; a cancelled draft never gets one.
// ---------------------------------------------------------------------------
const cancelSchema = z.object({ reason: z.string().trim().min(1, 'A reason is required').max(500) });

invoicesRouter.post('/:id/cancel', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const { reason } = parseBody(cancelSchema, req.body);
  await withTransaction(async db => {
    const current = await lockInvoice(db, id);
    if (current.status === 'cancelled') throw new HttpError(409, 'This invoice is already cancelled', 'INVALID_STATUS');
    if (current.status !== 'draft' && current.status !== 'sent') throw new HttpError(409, 'Only a draft or sent invoice can be cancelled', 'INVALID_STATUS');
    if (compareMoney(await paidSoFar(db, id), '0.00') > 0) {
      throw new HttpError(409, 'Reverse the payments before cancelling this invoice', 'HAS_PAYMENTS');
    }
    await db.query(`UPDATE invoices SET status = 'cancelled', cancelled_at = $2, cancel_reason = $3 WHERE id = $1`, [id, now(), reason]);
  });
  const invoice = await loadInvoice(id);
  // The reason is internal free text; the audit row only records that one was given.
  await audit(req, { action: 'invoice.cancelled', entityType: 'invoice', entityId: id, metadata: { invoiceNumber: invoice.invoiceNumber } });
  res.json({ invoice });
});

// ---------------------------------------------------------------------------
// POST /api/invoices/:id/payments  (admin): an income transaction against a sent invoice.
//   amount: in the invoice's currency (counts towards the balance). amountInr: the INR actually received,
//   required for a foreign-currency invoice and refused (must equal amount) for an INR one.
// ---------------------------------------------------------------------------
const paymentSchema = z.object({
  amount: moneyAmount('Amount', 'positive'),
  amountInr: moneyAmount('Amount received (INR)', 'positive').optional(),
  txnDate: isoDate,
  paymentMethod: z.enum(PAYMENT_METHODS, 'Choose a payment method'),
  referenceNumber: optionalText(100),
  notes: optionalText(1000),
});

invoicesRouter.post('/:id/payments', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(paymentSchema, req.body);
  if (body.txnDate > todayIst()) {
    throw new HttpError(400, 'The payment date cannot be in the future', 'VALIDATION_ERROR', [
      { path: 'txnDate', message: 'The payment date cannot be in the future' },
    ]);
  }

  let invoiceCurrency: Currency = BASE_CURRENCY;
  const txnId = await withTransaction(async db => {
    const current = await lockInvoice(db, id);
    invoiceCurrency = current.currency;
    if (current.status === 'draft') throw new HttpError(409, 'Send the invoice before recording a payment', 'INVALID_STATUS');
    if (current.status === 'cancelled') throw new HttpError(409, 'This invoice is cancelled', 'INVALID_STATUS');
    if (body.txnDate < current.invoiceDate) {
      throw new HttpError(400, 'The payment date cannot be before the invoice date', 'VALIDATION_ERROR', [
        { path: 'txnDate', message: 'The payment date cannot be before the invoice date' },
      ]);
    }
    const foreign = current.currency !== BASE_CURRENCY;
    if (foreign && !body.amountInr) {
      throw new HttpError(400, 'Enter the amount received in INR', 'VALIDATION_ERROR', [
        { path: 'amountInr', message: 'Enter the amount received in INR' },
      ]);
    }
    if (!foreign && body.amountInr && compareMoney(body.amountInr, body.amount) !== 0) {
      throw new HttpError(400, 'For an INR invoice the amount received is the amount', 'VALIDATION_ERROR', [
        { path: 'amountInr', message: 'For an INR invoice the amount received is the amount' },
      ]);
    }
    const balance = subtractMoney(current.total, await paidSoFar(db, id));
    if (compareMoney(body.amount, balance) > 0) {
      throw new HttpError(409, `The payment is more than the balance due (${current.currency} ${balance})`, 'OVERPAYMENT');
    }
    const label = `Payment for ${current.invoiceNumber ?? 'invoice'}`;
    const {
      rows: [txn],
    } = await db.query<{ id: string }>(
      `INSERT INTO transactions (txn_date, type, category, description, amount, invoice_amount, payment_method, reference_number, notes, invoice_id, created_by)
       VALUES ($1, 'income', $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        body.txnDate,
        PAYMENT_CATEGORY,
        foreign ? `${label} (${current.currency} ${body.amount})` : label,
        foreign ? body.amountInr : body.amount,
        body.amount,
        body.paymentMethod,
        body.referenceNumber,
        body.notes,
        id,
        req.user!.id,
      ],
    );
    // Fully paid -> paid, in the same transaction.
    if (compareMoney(body.amount, balance) === 0) await db.query(`UPDATE invoices SET status = 'paid' WHERE id = $1`, [id]);
    return txn.id;
  });

  await audit(req, {
    action: 'invoice.payment_recorded',
    entityType: 'invoice',
    entityId: id,
    metadata: { transactionId: txnId, amount: body.amount, currency: invoiceCurrency, ...(body.amountInr ? { amountInr: body.amountInr } : {}) },
  });
  res.status(201).json({ invoice: await loadInvoice(id), paymentId: txnId });
});

// ---------------------------------------------------------------------------
// DELETE /api/invoices/:id/payments/:txnId  (admin) { reason }: reverses a payment. The ledger row is kept
// and marked reversed (who, when, why) and no longer counts; a paid invoice goes back to sent.
// ---------------------------------------------------------------------------
const reverseSchema = z.object({ reason: z.string().trim().min(1, 'A reason is required').max(500) });

invoicesRouter.delete('/:id/payments/:txnId', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const txnResult = z.uuid().safeParse(req.params.txnId);
  if (!txnResult.success) throw new HttpError(404, 'Payment not found', 'NOT_FOUND');
  const txnId = txnResult.data;
  const { reason } = parseBody(reverseSchema, req.body);

  const reversed = await withTransaction(async db => {
    const current = await lockInvoice(db, id);
    const { rows } = await db.query<{
      amount: string;
      amountInr: string;
      txnDate: string;
      paymentMethod: string;
      referenceNumber: string | null;
      reversedAt: Date | null;
    }>(
      `SELECT invoice_amount::text AS amount, amount::text AS "amountInr", txn_date AS "txnDate", payment_method AS "paymentMethod",
              reference_number AS "referenceNumber", reversed_at AS "reversedAt"
         FROM transactions WHERE id = $1 AND invoice_id = $2 FOR UPDATE`,
      [txnId, id],
    );
    if (!rows[0]) throw new HttpError(404, 'Payment not found', 'NOT_FOUND');
    const { reversedAt, ...payment } = rows[0];
    if (reversedAt) throw new HttpError(409, 'This payment has already been reversed', 'ALREADY_REVERSED');
    await db.query(`UPDATE transactions SET reversed_at = $2, reversed_by = $3, reverse_reason = $4 WHERE id = $1`, [
      txnId,
      now(),
      req.user!.id,
      reason,
    ]);
    if (current.status === 'paid') await db.query(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [id]);
    return payment;
  });

  // The audit row keeps what the payment said; the reason is internal free text kept on the ledger row.
  await audit(req, {
    action: 'invoice.payment_reversed',
    entityType: 'invoice',
    entityId: id,
    metadata: { transactionId: txnId, ...reversed },
  });
  res.json({ invoice: await loadInvoice(id) });
});

// ---------------------------------------------------------------------------
// DELETE /api/invoices/:id  (admin): drafts only. Sent, paid and cancelled invoices are kept.
// ---------------------------------------------------------------------------
invoicesRouter.delete('/:id', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const invoiceNumber = await withTransaction(async db => {
    const current = await lockInvoice(db, id);
    if (current.status !== 'draft') throw locked('Only draft invoices can be deleted');
    await db.query('DELETE FROM invoices WHERE id = $1', [id]);
    return current.invoiceNumber;
  });
  await audit(req, { action: 'invoice.deleted', entityType: 'invoice', entityId: id, metadata: { invoiceNumber } });
  res.status(204).end();
});

