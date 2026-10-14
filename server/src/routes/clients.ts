import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { deleteUserSessions } from '../middleware/auth.js';
import { clientScope, createRouter } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';

// Client companies. Admin and manager create and edit; only admin deactivates/reactivates. Never deleted.
// Client users see only their own company, through GET /me (scoped by req.user.clientId).
export const clientsRouter = createRouter();

const CLIENT_COLUMNS = `
  c.id, c.company_name AS "companyName", c.contact_name AS "contactName", c.contact_email AS "contactEmail",
  c.contact_phone AS "contactPhone", c.address, c.gstin, c.status, c.notes,
  c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;

// Portal-login counts per company, for the list.
const PORTAL_COUNTS = `
  (SELECT count(*)::int FROM users u WHERE u.client_id = c.id) AS "portalUsers",
  (SELECT count(*)::int FROM users u WHERE u.client_id = c.id AND u.status = 'active') AS "activePortalUsers"`;

async function getClient(id: string) {
  const [client] = await query(
    `SELECT ${CLIENT_COLUMNS}, ${PORTAL_COUNTS},
            coalesce((SELECT json_agg(json_build_object(
                        'id', u.id, 'email', u.email, 'status', u.status,
                        'mustChangePassword', u.must_change_password, 'lastLoginAt', u.last_login_at,
                        'createdAt', u.created_at) ORDER BY u.created_at, u.email)
                      FROM users u WHERE u.client_id = c.id), '[]'::json) AS users
       FROM clients c WHERE c.id = $1`,
    [id],
  );
  return client as Record<string, unknown> | undefined;
}

function parseId(raw: unknown): string {
  const result = z.uuid().safeParse(raw);
  if (!result.success) throw new HttpError(404, 'Client not found', 'NOT_FOUND');
  return result.data;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform(v => (v ? v : null));

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine(v => v === '' || z.email().safeParse(v).success, 'Enter a valid email address')
  .nullish()
  .transform(v => (v ? v : null));

const createSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(200),
  contactName: optionalText(120),
  contactEmail: optionalEmail,
  contactPhone: optionalText(40),
  address: optionalText(1000),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine(v => v === '' || /^[0-9A-Z]{15}$/.test(v), 'GSTIN must be 15 letters/digits')
    .nullish()
    .transform(v => (v ? v : null)),
  notes: optionalText(2000),
});

const updateSchema = createSchema.partial().refine(body => Object.keys(body).length > 0, 'Nothing to update');

const COLUMN: Record<string, string> = {
  companyName: 'company_name',
  contactName: 'contact_name',
  contactEmail: 'contact_email',
  contactPhone: 'contact_phone',
  address: 'address',
  gstin: 'gstin',
  notes: 'notes',
};

// ---------------------------------------------------------------------------
// GET /api/clients  (admin, manager)  ?search=&status=&limit=50&offset=0
// ---------------------------------------------------------------------------
const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

clientsRouter.get('/', ['admin', 'manager'], async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  const { search, status, limit, offset } = parsed.data;

  const where: string[] = [];
  const params: unknown[] = [];
  if (search) {
    params.push(`%${search.replace(/[\\%_]/g, c => `\\${c}`)}%`);
    const p = `$${params.length}`;
    where.push(`(c.company_name ILIKE ${p} OR c.contact_name ILIKE ${p} OR c.contact_email ILIKE ${p})`);
  }
  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [clients, [{ total }]] = await Promise.all([
    query(
      `SELECT ${CLIENT_COLUMNS}, ${PORTAL_COUNTS}
         FROM clients c ${whereSql}
        ORDER BY lower(c.company_name), c.created_at
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM clients c ${whereSql}`, params),
  ]);
  res.json({ clients, total, limit, offset });
});

// ---------------------------------------------------------------------------
// GET /api/clients/me  (client): own company only. No internal notes, no GSTIN.
// ---------------------------------------------------------------------------
clientsRouter.get('/me', ['client'], async (req, res) => {
  const [client] = await query(
    `SELECT c.id, c.company_name AS "companyName", c.contact_name AS "contactName",
            c.contact_email AS "contactEmail", c.contact_phone AS "contactPhone", c.address, c.status
       FROM clients c WHERE c.id = $1`,
    [clientScope(req)],
  );
  if (!client) throw new HttpError(404, 'Client not found', 'NOT_FOUND');
  res.json({ client });
});

// ---------------------------------------------------------------------------
// GET /api/clients/:id  (admin, manager): includes the portal users
// ---------------------------------------------------------------------------
clientsRouter.get('/:id', ['admin', 'manager'], async (req, res) => {
  const client = await getClient(parseId(req.params.id));
  if (!client) throw new HttpError(404, 'Client not found', 'NOT_FOUND');
  res.json({ client });
});

// ---------------------------------------------------------------------------
// POST /api/clients and PATCH /api/clients/:id  (admin, manager)
// ---------------------------------------------------------------------------
clientsRouter.post('/', ['admin', 'manager'], async (req, res) => {
  const body = parseBody(createSchema, req.body);
  const [{ id }] = await query<{ id: string }>(
    `INSERT INTO clients (company_name, contact_name, contact_email, contact_phone, address, gstin, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [body.companyName, body.contactName, body.contactEmail, body.contactPhone, body.address, body.gstin, body.notes],
  );
  await audit(req, {
    action: 'client.created',
    entityType: 'client',
    entityId: id,
    metadata: { companyName: body.companyName },
  });
  res.status(201).json({ client: await getClient(id) });
});

clientsRouter.patch('/:id', ['admin', 'manager'], async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(updateSchema, req.body);
  const fields = Object.keys(body) as (keyof typeof body)[];

  const sets = fields.map((field, i) => `${COLUMN[field]} = $${i + 2}`);
  const updated = await query(`UPDATE clients SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, [
    id,
    ...fields.map(field => body[field]),
  ]);
  if (updated.length === 0) throw new HttpError(404, 'Client not found', 'NOT_FOUND');

  await audit(req, { action: 'client.updated', entityType: 'client', entityId: id, metadata: { fields } });
  res.json({ client: await getClient(id) });
});

// ---------------------------------------------------------------------------
// POST /api/clients/:id/deactivate  (admin): company inactive, ALL its portal logins disabled and signed out
// ---------------------------------------------------------------------------
clientsRouter.post('/:id/deactivate', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);

  const disabledUserIds = await withTransaction(async client => {
    const company = (await client.query<{ status: string }>('SELECT status FROM clients WHERE id = $1 FOR UPDATE', [id]))
      .rows[0];
    if (!company) throw new HttpError(404, 'Client not found', 'NOT_FOUND');
    if (company.status === 'inactive') throw new HttpError(409, 'This client is already inactive', 'ALREADY_INACTIVE');

    await client.query(`UPDATE clients SET status = 'inactive' WHERE id = $1`, [id]);
    const disabled = await client.query<{ id: string }>(
      `UPDATE users SET status = 'disabled' WHERE client_id = $1 AND status = 'active' RETURNING id`,
      [id],
    );
    return disabled.rows.map(r => r.id);
  });

  // Every session of every portal user of this company ends now (including already-disabled ones, to be safe).
  const allUsers = await query<{ id: string }>('SELECT id FROM users WHERE client_id = $1', [id]);
  await Promise.all(allUsers.map(u => deleteUserSessions(u.id)));

  await audit(req, {
    action: 'client.deactivated',
    entityType: 'client',
    entityId: id,
    metadata: { loginsDisabled: disabledUserIds.length },
  });
  res.json({ client: await getClient(id) });
});

// ---------------------------------------------------------------------------
// POST /api/clients/:id/reactivate  (admin)  { restoreLogins?: boolean }
// ---------------------------------------------------------------------------
const reactivateSchema = z.object({ restoreLogins: z.boolean().default(false) });

clientsRouter.post('/:id/reactivate', ['admin'], async (req, res) => {
  const id = parseId(req.params.id);
  const { restoreLogins } = parseBody(reactivateSchema, req.body);

  const restored = await withTransaction(async client => {
    const company = (await client.query<{ status: string }>('SELECT status FROM clients WHERE id = $1 FOR UPDATE', [id]))
      .rows[0];
    if (!company) throw new HttpError(404, 'Client not found', 'NOT_FOUND');
    if (company.status === 'active') throw new HttpError(409, 'This client is already active', 'ALREADY_ACTIVE');

    await client.query(`UPDATE clients SET status = 'active' WHERE id = $1`, [id]);
    if (!restoreLogins) return 0;
    const result = await client.query(
      `UPDATE users SET status = 'active' WHERE client_id = $1 AND status = 'disabled'`,
      [id],
    );
    return result.rowCount ?? 0;
  });

  await audit(req, {
    action: 'client.reactivated',
    entityType: 'client',
    entityId: id,
    metadata: { restoreLogins, loginsRestored: restored },
  });
  res.json({ client: await getClient(id) });
});

