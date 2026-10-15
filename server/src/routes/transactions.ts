import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { now, todayIst } from '../services/clock.js';
import { CSV_ROW_CAP, sendCsv, toCsv } from '../services/csv.js';
import { moneyAmount, toHundredths } from '../services/money.js';
import { createRouter } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { isoDate, likePattern, optionalText, pageQuery } from './shared.js';
import { PAYMENT_METHODS } from './invoices.js';

// The ledger (/api/transactions): admin only. Every money movement is a row here: invoice payments (income,
// invoice_id), salary payments (expense, salary_id) and manual income/expense rows. Linked rows are owned by
// their invoice or salary and change only through those routes (409 LINKED_TRANSACTION here). Manual rows
// are created, edited and voided (reversed_at/by/reason); nothing is ever deleted (there is no DELETE route).
// Voided/reversed rows are excluded from every total. Categories: transaction_categories; "Invoice Payment"
// and "Salary" are system categories that manual rows may not use.
export const transactionsRouter = createRouter();

const notFound = () => new HttpError(404, 'Transaction not found', 'NOT_FOUND');
const categoryNotFound = () => new HttpError(404, 'Category not found', 'NOT_FOUND');
// numeric(14,2) would allow 12 digits; the ledger caps manual rows at 11 (99,999,999,999.99).
const MAX_MANUAL_PAISE = 9_999_999_999_999n;

function parseId(raw: unknown, onError = notFound): string {
  const result = z.uuid().safeParse(raw);
  if (!result.success) throw onError();
  return result.data;
}

// IST date + 1 day: manual rows may be dated at most tomorrow.
function tomorrowIst(): string {
  const d = new Date(`${todayIst()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// SQL fragments
// ---------------------------------------------------------------------------
const SOURCE_SQL = `CASE WHEN t.invoice_id IS NOT NULL THEN 'invoice' WHEN t.salary_id IS NOT NULL THEN 'salary' ELSE 'manual' END`;

const ROW_COLUMNS = `
  t.id, t.txn_date AS "txnDate", t.type, t.category, t.description, t.amount::text AS amount,
  t.payment_method AS "paymentMethod", t.reference_number AS "referenceNumber", t.notes,
  ${SOURCE_SQL} AS source,
  t.invoice_id AS "invoiceId", i.invoice_number AS "invoiceNumber",
  t.salary_id AS "salaryId", to_char(s.salary_month, 'YYYY-MM') AS "salaryMonth", se.full_name AS "salaryEmployeeName",
  t.reversed_at AS "voidedAt", t.reverse_reason AS "voidReason",
  CASE WHEN t.reversed_by IS NULL THEN NULL ELSE coalesce(re.full_name, ru.email::text) END AS "voidedByName",
  coalesce(ce.full_name, cu.email::text) AS "createdByName", t.created_at AS "createdAt", t.updated_at AS "updatedAt"`;

const ROW_JOINS = `
  LEFT JOIN invoices i ON i.id = t.invoice_id
  LEFT JOIN salaries s ON s.id = t.salary_id
  LEFT JOIN employees se ON se.id = s.employee_id
  LEFT JOIN users cu ON cu.id = t.created_by
  LEFT JOIN employees ce ON ce.id = cu.employee_id
  LEFT JOIN users ru ON ru.id = t.reversed_by
  LEFT JOIN employees re ON re.id = ru.employee_id`;

async function loadRow(id: string, db?: PoolClient) {
  const sql = `SELECT ${ROW_COLUMNS} FROM transactions t ${ROW_JOINS} WHERE t.id = $1`;
  const rows = db ? (await db.query(sql, [id])).rows : await query(sql, [id]);
  if (!rows[0]) throw notFound();
  return rows[0];
}

// ---------------------------------------------------------------------------
// Filters (GET / and GET /export.csv)
// ---------------------------------------------------------------------------
const booleanParam = z
  .enum(['true', 'false', '1', '0'])
  .transform(v => v === 'true' || v === '1')
  .optional();

const filterQuery = z.object({
  type: z.enum(['income', 'expense']).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  source: z.enum(['manual', 'invoice', 'salary']).optional(),
  search: z.string().trim().max(100).optional(),
  includeVoided: booleanParam,
});
type Filters = z.infer<typeof filterQuery>;

function parseQuery<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
    throw new HttpError(400, details[0].message, 'VALIDATION_ERROR', details);
  }
  return parsed.data;
}

// WHERE clause from fixed fragments; values are parameters only.
function whereFor(f: Filters, params: unknown[], { voided }: { voided: boolean }): string {
  const where: string[] = [];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };
  if (f.from && f.to && f.from > f.to) {
    throw new HttpError(400, 'The start date must be on or before the end date', 'VALIDATION_ERROR', [{ path: 'to', message: 'The start date must be on or before the end date' }]);
  }
  if (f.type) add(p => `t.type = ${p}`, f.type);
  if (f.category) add(p => `lower(t.category) = lower(${p})`, f.category);
  if (f.from) add(p => `t.txn_date >= ${p}::date`, f.from);
  if (f.to) add(p => `t.txn_date <= ${p}::date`, f.to);
  if (f.paymentMethod) add(p => `t.payment_method = ${p}`, f.paymentMethod);
  if (f.source === 'manual') where.push('t.invoice_id IS NULL AND t.salary_id IS NULL');
  if (f.source === 'invoice') where.push('t.invoice_id IS NOT NULL');
  if (f.source === 'salary') where.push('t.salary_id IS NOT NULL');
  if (f.search) add(p => `(t.description ILIKE ${p} OR t.reference_number ILIKE ${p})`, likePattern(f.search));
  if (!voided) where.push('t.reversed_at IS NULL');
  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}

// ---------------------------------------------------------------------------
// GET /api/transactions  (admin)
// Totals cover the whole FILTERED set (not just the page) and never include voided/reversed rows.
// ---------------------------------------------------------------------------
const listQuery = filterQuery.extend(pageQuery.shape);

transactionsRouter.get('/', ['admin'], async (req, res) => {
  const f = parseQuery(listQuery, req.query);
  const params: unknown[] = [];
  const where = whereFor(f, params, { voided: f.includeVoided ?? false });
  const totalsParams: unknown[] = [];
  const totalsWhere = whereFor(f, totalsParams, { voided: false });
  const [transactions, [{ total }], [totals]] = await Promise.all([
    query(
      `SELECT ${ROW_COLUMNS} FROM transactions t ${ROW_JOINS} ${where}
        ORDER BY t.txn_date DESC, t.created_at DESC, t.id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset],
    ),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM transactions t ${where}`, params),
    query(
      `SELECT coalesce(sum(t.amount) FILTER (WHERE t.type = 'income'), 0)::numeric(14,2)::text AS income,
              coalesce(sum(t.amount) FILTER (WHERE t.type = 'expense'), 0)::numeric(14,2)::text AS expense,
              (coalesce(sum(t.amount) FILTER (WHERE t.type = 'income'), 0)
                 - coalesce(sum(t.amount) FILTER (WHERE t.type = 'expense'), 0))::numeric(14,2)::text AS net,
              count(*)::int AS count
         FROM transactions t ${totalsWhere}`,
      totalsParams,
    ),
  ]);
  res.json({ today: todayIst(), transactions, total, limit: f.limit, offset: f.offset, totals });
});

// ---------------------------------------------------------------------------
// GET /api/transactions/export.csv  (admin): same filters, at most CSV_ROW_CAP rows.
// ---------------------------------------------------------------------------
transactionsRouter.get('/export.csv', ['admin'], async (req, res) => {
  const f = parseQuery(filterQuery, req.query);
  const params: unknown[] = [];
  const where = whereFor(f, params, { voided: f.includeVoided ?? false });
  const rows = await query<Record<string, string | null>>(
    `SELECT ${ROW_COLUMNS} FROM transactions t ${ROW_JOINS} ${where}
      ORDER BY t.txn_date DESC, t.created_at DESC, t.id LIMIT $${params.length + 1}`,
    [...params, CSV_ROW_CAP + 1],
  );
  const capped = rows.length > CSV_ROW_CAP;
  const data = rows.slice(0, CSV_ROW_CAP).map(r => [
    r.txnDate,
    r.type,
    r.category,
    r.description,
    r.amount,
    r.paymentMethod,
    r.referenceNumber,
    r.source === 'invoice' ? `Invoice ${r.invoiceNumber ?? ''}`.trim() : r.source === 'salary' ? `Salary ${r.salaryMonth} ${r.salaryEmployeeName ?? ''}`.trim() : 'Manual',
    r.voidedAt ? 'yes' : '',
    r.voidReason,
  ]);
  const csv = toCsv(
    ['Date', 'Type', 'Category', 'Description', 'Amount (INR)', 'Payment method', 'Reference', 'Source', 'Voided', 'Void reason'],
    data,
  );
  // Filters as given, except the free-text search, which is only recorded as used or not.
  const { search, ...filters } = f;
  await audit(req, {
    action: 'export.downloaded',
    entityType: 'export',
    metadata: { export: 'transactions', filters: { ...filters, search: Boolean(search) }, rows: data.length, capped },
  });
  sendCsv(res, 'transactions', csv, capped);
});

// ---------------------------------------------------------------------------
// Categories (admin). Declared before /:id.
// ---------------------------------------------------------------------------
const CATEGORY_COLUMNS = `
  c.id, c.name::text AS name, c.type, c.is_system AS "isSystem", c.active,
  (SELECT count(*)::int FROM transactions t WHERE lower(t.category) = lower(c.name::text)) AS "usageCount",
  c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;

transactionsRouter.get('/categories', ['admin'], async (_req, res) => {
  const categories = await query(`SELECT ${CATEGORY_COLUMNS} FROM transaction_categories c ORDER BY c.type, lower(c.name::text)`);
  res.json({ categories });
});

const categoryName = z
  .string()
  .trim()
  .min(1, 'A name is required')
  .max(60, 'At most 60 characters')
  .refine(v => !/[\r\n\t]/.test(v), 'One line, no tabs');

const categoryCreate = z.object({ name: categoryName, type: z.enum(['income', 'expense'], 'Choose income or expense') }).strict();

function duplicateName(err: unknown): never {
  if ((err as { code?: string }).code === '23505') {
    throw new HttpError(409, 'A category with this name already exists', 'DUPLICATE_CATEGORY', [{ path: 'name', message: 'A category with this name already exists' }]);
  }
  throw err;
}

transactionsRouter.post('/categories', ['admin'], async (req, res) => {
  const body = parseBody(categoryCreate, req.body);
  const [row] = await query<{ id: string }>(
    `INSERT INTO transaction_categories (name, type) VALUES ($1, $2) RETURNING id`,
    [body.name, body.type],
  ).catch(duplicateName);
  await audit(req, { action: 'category.created', entityType: 'transaction_category', entityId: row.id, metadata: { name: body.name, type: body.type } });
  const [category] = await query(`SELECT ${CATEGORY_COLUMNS} FROM transaction_categories c WHERE c.id = $1`, [row.id]);
  res.status(201).json({ category });
});

// PATCH /api/transactions/categories/:id { name?, active? }
// Renaming also renames the category text on every existing transaction, in the same DB transaction.
// System categories can't be renamed or deactivated. Deactivating one in use is allowed (hidden from pickers).
const categoryPatch = z
  .object({ name: categoryName, active: z.boolean() })
  .partial()
  .strict()
  .refine(b => b.name !== undefined || b.active !== undefined, 'Nothing to update');

transactionsRouter.patch('/categories/:id', ['admin'], async (req, res) => {
  const id = parseId(req.params.id, categoryNotFound);
  const body = parseBody(categoryPatch, req.body);
  const result = await withTransaction(async db => {
    const { rows } = await db.query<{ name: string; isSystem: boolean; active: boolean }>(
      `SELECT name::text AS name, is_system AS "isSystem", active FROM transaction_categories WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const current = rows[0];
    if (!current) throw categoryNotFound();
    const renaming = body.name !== undefined && body.name !== current.name;
    const deactivating = body.active === false && current.active;
    if (current.isSystem && (renaming || body.active === false)) {
      throw new HttpError(409, 'System categories cannot be renamed or deactivated', 'SYSTEM_CATEGORY');
    }
    let renamedRows = 0;
    if (renaming) {
      // Invoice and salary rows are owned by their records and never rewritten here. They normally use the
      // system categories (which can't be renamed), but legacy rows may use another name: refuse instead.
      const { rows: linked } = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM transactions
          WHERE lower(category) = lower($1) AND (invoice_id IS NOT NULL OR salary_id IS NOT NULL)`,
        [current.name],
      );
      if (linked[0].n > 0) {
        throw new HttpError(409, 'Invoice or salary payments use this category, so it cannot be renamed', 'CATEGORY_LINKED');
      }
      await db.query('UPDATE transaction_categories SET name = $2 WHERE id = $1', [id, body.name]).catch(duplicateName);
      const updated = await db.query('UPDATE transactions SET category = $2 WHERE lower(category) = lower($1)', [current.name, body.name]);
      renamedRows = updated.rowCount ?? 0;
    }
    if (body.active !== undefined && body.active !== current.active) {
      await db.query('UPDATE transaction_categories SET active = $2 WHERE id = $1', [id, body.active]);
    }
    return { from: current.name, renaming, deactivating, renamedRows };
  });
  await audit(req, {
    action: 'category.updated',
    entityType: 'transaction_category',
    entityId: id,
    metadata: {
      fields: Object.keys(body),
      ...(result.renaming ? { renamedFrom: result.from, renamedTo: body.name, transactionsRenamed: result.renamedRows } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
  });
  const [category] = await query(`SELECT ${CATEGORY_COLUMNS} FROM transaction_categories c WHERE c.id = $1`, [id]);
  res.json({ category });
});

// ---------------------------------------------------------------------------
// Manual rows: create / edit / void
// ---------------------------------------------------------------------------
const manualAmount = moneyAmount('Amount', 'positive').refine(
  v => toHundredths(v) <= MAX_MANUAL_PAISE,
  'Amount must be at most 99999999999.99',
);

const manualFields = {
  txnDate: isoDate,
  type: z.enum(['income', 'expense'], 'Choose income or expense'),
  category: z.string().trim().min(1, 'Choose a category').max(60),
  description: z.string().trim().min(1, 'A description is required').max(500),
  amount: manualAmount,
  paymentMethod: z.enum(PAYMENT_METHODS, 'Choose a payment method'),
  referenceNumber: optionalText(100),
  notes: optionalText(2000),
};

// .strict(): invoiceId, salaryId (or anything else) in the body is a 400.
const createSchema = z.object(manualFields).strict();
const patchSchema = z
  .object(manualFields)
  .partial()
  .strict()
  .refine(b => Object.keys(b).length > 0, 'Nothing to update');

// The category must exist (case-insensitive), be active, match the type and not be a system category.
// Returns the canonical name. A row being edited may keep its current (now inactive) category.
async function checkCategory(db: PoolClient, name: string, type: string, keep?: string): Promise<string> {
  const { rows } = await db.query<{ name: string; type: string; isSystem: boolean; active: boolean }>(
    // FOR SHARE: a concurrent rename (FOR UPDATE on this row) finishes first, so the old name is never written.
    `SELECT name::text AS name, type, is_system AS "isSystem", active FROM transaction_categories WHERE name = $1::citext FOR SHARE`,
    [name],
  );
  const c = rows[0];
  const bad = (message: string) => new HttpError(400, message, 'VALIDATION_ERROR', [{ path: 'category', message }]);
  if (!c) throw bad('Choose an existing category');
  if (c.isSystem) throw bad(`"${c.name}" is used by ${c.name === 'Salary' ? 'salary' : 'invoice'} payments and can't be chosen here`);
  if (c.type !== type) throw bad(`"${c.name}" is an ${c.type} category`);
  if (!c.active && c.name.toLowerCase() !== keep?.toLowerCase()) throw bad(`"${c.name}" is inactive`);
  return c.name;
}

function checkDate(date: string) {
  if (date > tomorrowIst()) {
    throw new HttpError(400, 'The date cannot be more than one day in the future', 'VALIDATION_ERROR', [
      { path: 'txnDate', message: 'The date cannot be more than one day in the future' },
    ]);
  }
}

transactionsRouter.post('/', ['admin'], async (req, res) => {
  const body = parseBody(createSchema, req.body);
  checkDate(body.txnDate);
  const id = await withTransaction(async db => {
    const category = await checkCategory(db, body.category, body.type);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO transactions (txn_date, type, category, description, amount, payment_method, reference_number, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [body.txnDate, body.type, category, body.description, body.amount, body.paymentMethod, body.referenceNumber, body.notes, req.user!.id],
    );
    return rows[0].id;
  });
  await audit(req, { action: 'transaction.created', entityType: 'transaction', entityId: id, metadata: { type: body.type, category: body.category, txnDate: body.txnDate } });
  res.status(201).json({ transaction: await loadRow(id) });
});

interface LockedRow {
  id: string;
  type: string;
  category: string;
  txnDate: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  salaryId: string | null;
  salaryMonth: string | null;
  voided: boolean;
}

// Locks the row; missing -> 404; linked -> 409 LINKED_TRANSACTION naming the owning record; voided -> 409.
async function lockManual(db: PoolClient, id: string): Promise<LockedRow> {
  const { rows } = await db.query<LockedRow>(
    `SELECT t.id, t.type, t.category, t.txn_date AS "txnDate", t.invoice_id AS "invoiceId", i.invoice_number AS "invoiceNumber",
            t.salary_id AS "salaryId", to_char(s.salary_month, 'YYYY-MM') AS "salaryMonth", t.reversed_at IS NOT NULL AS voided
       FROM transactions t
       LEFT JOIN invoices i ON i.id = t.invoice_id
       LEFT JOIN salaries s ON s.id = t.salary_id
      WHERE t.id = $1 FOR UPDATE OF t`,
    [id],
  );
  const row = rows[0];
  if (!row) throw notFound();
  if (row.invoiceId) {
    // An invoice with a payment has been sent, so it has a number.
    throw new HttpError(409, `This payment belongs to invoice ${row.invoiceNumber}. Change it on the invoice.`, 'LINKED_TRANSACTION', [
      { path: 'owner', message: 'Linked to an invoice', type: 'invoice', invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber },
    ]);
  }
  if (row.salaryId) {
    throw new HttpError(409, `This payment belongs to the ${row.salaryMonth} salary. Change it on the Salary page.`, 'LINKED_TRANSACTION', [
      { path: 'owner', message: 'Linked to a salary', type: 'salary', salaryId: row.salaryId, salaryMonth: row.salaryMonth },
    ]);
  }
  if (row.voided) throw new HttpError(409, 'This transaction has been voided', 'VOIDED');
  return row;
}

// PATCH /api/transactions/:id  (admin): manual, not voided.
transactionsRouter.patch('/:id', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(patchSchema, req.body);
  if (body.txnDate) checkDate(body.txnDate);
  const fields = Object.keys(body);
  await withTransaction(async db => {
    const current = await lockManual(db, id);
    const type = body.type ?? current.type;
    let category: string | undefined;
    if (body.category !== undefined || body.type !== undefined) {
      category = await checkCategory(db, body.category ?? current.category, type, current.category);
    }
    const COLUMN: Record<string, string> = {
      txnDate: 'txn_date',
      type: 'type',
      description: 'description',
      amount: 'amount',
      paymentMethod: 'payment_method',
      referenceNumber: 'reference_number',
      notes: 'notes',
    };
    const params: unknown[] = [id];
    const sets: string[] = [];
    for (const [key, column] of Object.entries(COLUMN)) {
      if (key in body) {
        params.push((body as Record<string, unknown>)[key]);
        sets.push(`${column} = $${params.length}`);
      }
    }
    if (category !== undefined) {
      params.push(category);
      sets.push(`category = $${params.length}`);
    }
    if (sets.length) await db.query(`UPDATE transactions SET ${sets.join(', ')} WHERE id = $1`, params);
  });
  await audit(req, { action: 'transaction.updated', entityType: 'transaction', entityId: id, metadata: { fields } });
  res.json({ transaction: await loadRow(id) });
});

// POST /api/transactions/:id/void { reason }  (admin): manual only. The row stays, marked voided.
const voidSchema = z.object({ reason: z.string().trim().min(1, 'A reason is required').max(500) }).strict();

transactionsRouter.post('/:id/void', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const { reason } = parseBody(voidSchema, req.body);
  const row = await withTransaction(async db => {
    const current = await lockManual(db, id);
    await db.query(`UPDATE transactions SET reversed_at = $2, reversed_by = $3, reverse_reason = $4 WHERE id = $1`, [id, now(), req.user!.id, reason]);
    return current;
  });
  // The reason stays on the row; the audit records what was voided, not the free text.
  await audit(req, { action: 'transaction.voided', entityType: 'transaction', entityId: id, metadata: { type: row.type, category: row.category, txnDate: row.txnDate } });
  res.json({ transaction: await loadRow(id) });
});
