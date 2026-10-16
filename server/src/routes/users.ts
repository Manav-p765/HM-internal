import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { sendCredentialsEmail } from '../services/mail.js';
import { generateTempPassword, hashPassword } from '../services/passwords.js';
import { deleteUserSessions } from '../middleware/auth.js';
import { createRouter } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { credentialsMailLimiter } from '../middleware/security.js';

// User management. Admins manage every account; managers may only create and manage client
// (portal) users. Passwords never appear in any response: credentials go out by email.
export const usersRouter = createRouter();

const USER_SELECT = `
  SELECT u.id, u.email, u.role, u.status,
         u.must_change_password AS "mustChangePassword",
         u.last_login_at AS "lastLoginAt",
         u.created_at AS "createdAt",
         CASE WHEN e.id IS NULL THEN NULL
              ELSE json_build_object('id', e.id, 'code', e.employee_code, 'name', e.full_name)
         END AS employee,
         u.client_id AS "clientId",
         CASE WHEN c.id IS NULL THEN NULL
              ELSE json_build_object('id', c.id, 'companyName', c.company_name, 'status', c.status)
         END AS client
    FROM users u
    LEFT JOIN employees e ON e.id = u.employee_id
    LEFT JOIN clients c ON c.id = u.client_id`;

async function getUser(id: string) {
  const [user] = await query(`${USER_SELECT} WHERE u.id = $1`, [id]);
  return user;
}

const idSchema = z.uuid();
function parseId(raw: unknown): string {
  const result = idSchema.safeParse(raw);
  if (!result.success) throw new HttpError(404, 'User not found', 'NOT_FOUND');
  return result.data;
}

const FORBIDDEN = () => new HttpError(403, 'You do not have permission to do this', 'FORBIDDEN');

// Managers may act on client users only.
function assertMayManage(req: Request, targetRole: string): void {
  if (req.user!.role === 'manager' && targetRole !== 'client') throw FORBIDDEN();
}

// A client user can only be created or (re)enabled while their company is active.
async function assertClientActive(client: PoolClient, clientId: string): Promise<void> {
  const company = (
    await client.query<{ status: string }>('SELECT status FROM clients WHERE id = $1 FOR SHARE', [clientId])
  ).rows[0];
  if (!company) throw new HttpError(400, 'Client company not found', 'VALIDATION_ERROR', [{ path: 'clientId', message: 'Client company not found' }]);
  if (company.status !== 'active') {
    throw new HttpError(409, 'This client company is inactive. Reactivate it first.', 'CLIENT_INACTIVE');
  }
}

// A login can only be created for an existing, not inactive employee who has none yet. The row is locked
// (FOR SHARE) so a concurrent deactivation waits for this transaction.
async function assertEmployeeLinkable(client: PoolClient, employeeId: string): Promise<void> {
  const employee = (
    await client.query<{ status: string; linked: boolean }>(
      `SELECT e.status, EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id) AS linked
         FROM employees e WHERE e.id = $1 FOR SHARE OF e`,
      [employeeId],
    )
  ).rows[0];
  if (!employee) throw new HttpError(400, 'Employee not found', 'VALIDATION_ERROR');
  if (employee.linked) throw new HttpError(409, 'That employee already has a user account', 'EMPLOYEE_LINKED');
  if (employee.status === 'inactive') {
    throw new HttpError(409, 'This employee is inactive. Reactivate them first.', 'EMPLOYEE_INACTIVE');
  }
}

// ---------------------------------------------------------------------------
// GET /api/users  (admin)
// ---------------------------------------------------------------------------
usersRouter.get('/', ['admin'], async (_req, res) => {
  res.json({ users: await query(`${USER_SELECT} ORDER BY u.created_at, u.email`) });
});

// ---------------------------------------------------------------------------
// GET /api/users/employee-options  (admin): employees without a login, for the "Add user" form
// ---------------------------------------------------------------------------
usersRouter.get('/employee-options', ['admin'], async (_req, res) => {
  const employees = await query(
    `SELECT e.id, e.employee_code AS code, e.full_name AS name, e.work_email AS "workEmail"
       FROM employees e
      WHERE e.status <> 'inactive'
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id)
      ORDER BY e.full_name`,
  );
  res.json({ employees });
});

// ---------------------------------------------------------------------------
// POST /api/users  (admin: any role; manager: client only)  { email, role, employeeId?, clientId? }
// ---------------------------------------------------------------------------
const createSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address')),
    role: z.enum(['admin', 'manager', 'employee', 'client']),
    employeeId: z.uuid().nullish(),
    clientId: z.uuid().nullish(),
  })
  .superRefine((body, ctx) => {
    if (body.role === 'client') {
      if (!body.clientId) ctx.addIssue({ code: 'custom', path: ['clientId'], message: 'Choose the client company' });
      if (body.employeeId) ctx.addIssue({ code: 'custom', path: ['employeeId'], message: 'Client users cannot be linked to an employee' });
    } else if (body.clientId) {
      ctx.addIssue({ code: 'custom', path: ['clientId'], message: 'Only client users belong to a client company' });
    }
  });

usersRouter.post('/', ['admin', 'manager'], credentialsMailLimiter, async (req, res) => {
  const { email, role, employeeId, clientId } = parseBody(createSchema, req.body);
  assertMayManage(req, role);

  const [emailTaken] = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (emailTaken) throw new HttpError(409, 'A user with this email already exists', 'EMAIL_TAKEN');

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  // The email is sent inside the transaction: if it can't be sent, the account is not created.
  const userId = await withTransaction(async client => {
    if (role === 'client') await assertClientActive(client, clientId!);
    if (employeeId) await assertEmployeeLinkable(client, employeeId);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, employee_id, client_id, must_change_password)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
      [email, passwordHash, role, employeeId ?? null, role === 'client' ? clientId : null],
    );
    await sendCredentialsEmail(email, tempPassword);
    return inserted.rows[0].id;
  });

  await audit(req, {
    action: 'user.created',
    entityType: 'user',
    entityId: userId,
    metadata: { email, role, employeeId: employeeId ?? null, clientId: clientId ?? null },
  });
  res.status(201).json({ user: await getUser(userId) });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/:id  { role?, status? }  (admin; manager: status of client users only)
// ---------------------------------------------------------------------------
const STAFF_ROLES = ['admin', 'manager', 'employee'] as const;
const updateSchema = z
  .object({
    role: z.enum(STAFF_ROLES).optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine(body => body.role !== undefined || body.status !== undefined, 'Nothing to update');

usersRouter.patch('/:id', ['admin', 'manager'], async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(updateSchema, req.body);

  const { before, after } = await withTransaction(async client => {
    // Lock the active admins first so two concurrent requests can't remove the last one between them.
    const admins = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id FOR UPDATE`,
    );
    const target = (
      await client.query<{ id: string; role: string; status: string; client_id: string | null }>(
        'SELECT id, role, status, client_id FROM users WHERE id = $1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!target) throw new HttpError(404, 'User not found', 'NOT_FOUND');
    assertMayManage(req, target.role);
    if (body.role !== undefined && req.user!.role !== 'admin') throw FORBIDDEN();
    // A client user's company link can't be expressed by a role change (and staff can't become clients).
    if (body.role !== undefined && target.role === 'client') {
      throw new HttpError(400, 'A client user cannot be changed to a staff role', 'ROLE_CHANGE_NOT_ALLOWED');
    }

    const next = { role: body.role ?? target.role, status: body.status ?? target.status };
    const isActiveAdmin = target.role === 'admin' && target.status === 'active';
    const losesAdmin = isActiveAdmin && (next.role !== 'admin' || next.status !== 'active');

    if (losesAdmin && admins.rows.every(a => a.id === target.id)) {
      throw new HttpError(409, 'The last active admin cannot be disabled or demoted', 'LAST_ADMIN');
    }
    if (losesAdmin && target.id === req.user!.id) {
      throw new HttpError(400, 'You cannot disable or demote your own account', 'CANNOT_MODIFY_SELF');
    }
    if (target.client_id && next.status === 'active' && target.status !== 'active') {
      await assertClientActive(client, target.client_id);
    }

    // Any explicit status change is an individual decision, so a company reactivation no longer restores it.
    await client.query(
      `UPDATE users SET role = $1, status = $2,
              disabled_by_client_deactivation = disabled_by_client_deactivation AND $4::boolean
        WHERE id = $3`,
      [next.role, next.status, id, body.status === undefined],
    );
    return { before: target, after: next };
  });

  if (before.status !== after.status) {
    if (after.status === 'disabled') await deleteUserSessions(id);
    await audit(req, {
      action: after.status === 'disabled' ? 'user.disabled' : 'user.enabled',
      entityType: 'user',
      entityId: id,
    });
  }
  if (before.role !== after.role) {
    await audit(req, {
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      metadata: { role: { from: before.role, to: after.role } },
    });
  }

  res.json({ user: await getUser(id) });
});

// ---------------------------------------------------------------------------
// POST /api/users/:id/resend-credentials  (admin; manager: client users only)
// ---------------------------------------------------------------------------
usersRouter.post('/:id/resend-credentials', ['admin', 'manager'], credentialsMailLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === req.user!.id) {
    throw new HttpError(400, 'Use "Change password" for your own account', 'CANNOT_MODIFY_SELF');
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  // As with create: if the email can't be sent, the old password keeps working.
  await withTransaction(async client => {
    const target = (
      await client.query<{ email: string; status: string; role: string; client_id: string | null }>(
        'SELECT email, status, role, client_id FROM users WHERE id = $1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!target) throw new HttpError(404, 'User not found', 'NOT_FOUND');
    assertMayManage(req, target.role);
    if (target.status !== 'active') {
      throw new HttpError(400, 'Enable this user before sending new credentials', 'USER_DISABLED');
    }
    if (target.client_id) await assertClientActive(client, target.client_id);
    await client.query('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2', [passwordHash, id]);
    await client.query(`DELETE FROM auth_tokens WHERE user_id = $1 AND used_at IS NULL`, [id]);
    await sendCredentialsEmail(target.email, tempPassword, true);
  });

  await deleteUserSessions(id);
  await audit(req, { action: 'user.credentials_resent', entityType: 'user', entityId: id });
  res.json({ user: await getUser(id) });
});
