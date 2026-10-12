import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { sendCredentialsEmail } from '../services/mail.js';
import { generateTempPassword, hashPassword } from '../services/passwords.js';
import { deleteUserSessions, requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, parseBody } from '../middleware/errors.js';

// Admin-only user management. Passwords never appear in any response.
export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('admin'));

const USER_SELECT = `
  SELECT u.id, u.email, u.role, u.status,
         u.must_change_password AS "mustChangePassword",
         u.last_login_at AS "lastLoginAt",
         u.created_at AS "createdAt",
         CASE WHEN e.id IS NULL THEN NULL
              ELSE json_build_object('id', e.id, 'code', e.employee_code, 'name', e.full_name)
         END AS employee
    FROM users u
    LEFT JOIN employees e ON e.id = u.employee_id`;

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

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------
usersRouter.get('/', async (_req, res) => {
  res.json({ users: await query(`${USER_SELECT} ORDER BY u.created_at, u.email`) });
});

// ---------------------------------------------------------------------------
// GET /api/users/employee-options  (employees that don't have a login yet, for the "Add user" form)
// ---------------------------------------------------------------------------
usersRouter.get('/employee-options', async (_req, res) => {
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
// POST /api/users  { email, role, employeeId? }
// ---------------------------------------------------------------------------
const createSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address')),
  role: z.enum(['admin', 'manager', 'employee']),
  employeeId: z.uuid().nullish(),
});

usersRouter.post('/', async (req, res) => {
  const { email, role, employeeId } = parseBody(createSchema, req.body);

  const [emailTaken] = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (emailTaken) throw new HttpError(409, 'A user with this email already exists', 'EMAIL_TAKEN');

  if (employeeId) {
    const [employee] = await query<{ linked: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id) AS linked FROM employees e WHERE e.id = $1`,
      [employeeId],
    );
    if (!employee) throw new HttpError(400, 'Employee not found', 'VALIDATION_ERROR');
    if (employee.linked) throw new HttpError(409, 'That employee already has a user account', 'EMPLOYEE_LINKED');
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  // The email is sent inside the transaction: if it can't be sent, the account is not created.
  const userId = await withTransaction(async client => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, employee_id, must_change_password)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [email, passwordHash, role, employeeId ?? null],
    );
    await sendCredentialsEmail(email, tempPassword);
    return inserted.rows[0].id;
  });

  await audit(req, {
    action: 'user.created',
    entityType: 'user',
    entityId: userId,
    metadata: { email, role, employeeId: employeeId ?? null },
  });
  res.status(201).json({ user: await getUser(userId) });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/:id  { role?, status? }
// ---------------------------------------------------------------------------
const updateSchema = z
  .object({
    role: z.enum(['admin', 'manager', 'employee']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine(body => body.role !== undefined || body.status !== undefined, 'Nothing to update');

usersRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(updateSchema, req.body);

  const { before, after } = await withTransaction(async client => {
    // Lock the active admins first so two concurrent requests can't remove the last one between them.
    const admins = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id FOR UPDATE`,
    );
    const target = (
      await client.query<{ id: string; role: string; status: string }>(
        'SELECT id, role, status FROM users WHERE id = $1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!target) throw new HttpError(404, 'User not found', 'NOT_FOUND');

    const next = { role: body.role ?? target.role, status: body.status ?? target.status };
    const isActiveAdmin = target.role === 'admin' && target.status === 'active';
    const losesAdmin = isActiveAdmin && (next.role !== 'admin' || next.status !== 'active');

    if (losesAdmin && admins.rows.every(a => a.id === target.id)) {
      throw new HttpError(409, 'The last active admin cannot be disabled or demoted', 'LAST_ADMIN');
    }
    if (losesAdmin && target.id === req.user!.id) {
      throw new HttpError(400, 'You cannot disable or demote your own account', 'CANNOT_MODIFY_SELF');
    }

    await client.query('UPDATE users SET role = $1, status = $2 WHERE id = $3', [next.role, next.status, id]);
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
// POST /api/users/:id/resend-credentials
// ---------------------------------------------------------------------------
usersRouter.post('/:id/resend-credentials', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === req.user!.id) {
    throw new HttpError(400, 'Use "Change password" for your own account', 'CANNOT_MODIFY_SELF');
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  // As with create: if the email can't be sent, the old password keeps working.
  await withTransaction(async client => {
    const target = (
      await client.query<{ email: string; status: string }>('SELECT email, status FROM users WHERE id = $1 FOR UPDATE', [id])
    ).rows[0];
    if (!target) throw new HttpError(404, 'User not found', 'NOT_FOUND');
    if (target.status !== 'active') {
      throw new HttpError(400, 'Enable this user before sending new credentials', 'USER_DISABLED');
    }
    await client.query('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2', [passwordHash, id]);
    await client.query(`DELETE FROM auth_tokens WHERE user_id = $1 AND used_at IS NULL`, [id]);
    await sendCredentialsEmail(target.email, tempPassword, true);
  });

  await deleteUserSessions(id);
  await audit(req, { action: 'user.credentials_resent', entityType: 'user', entityId: id });
  res.json({ user: await getUser(id) });
});
