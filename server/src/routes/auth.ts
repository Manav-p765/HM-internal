import { Router, type Request } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { sendPasswordResetEmail } from '../services/mail.js';
import {
  DUMMY_HASH,
  generateToken,
  hashPassword,
  hashToken,
  newPasswordSchema,
  verifyPassword,
} from '../services/passwords.js';
import { deleteUserSessions, destroySession, loadSessionUser, requireSession } from '../middleware/auth.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { forgotPasswordLimiter, loginLimiter, resetPasswordLimiter } from '../middleware/security.js';

export const authRouter = Router();

const RESET_TOKEN_TTL_MINUTES = 60;

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve())));
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
const loginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parseBody(loginSchema, req.body);

  // users.email is citext, so this match is case-insensitive.
  const [user] = await query<{ id: string; password_hash: string | null; status: string }>(
    'SELECT id, password_hash, status FROM users WHERE email = $1',
    [email],
  );

  // Always run one bcrypt compare so a missing account takes as long as a wrong password.
  const passwordOk = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);

  let failure: string | null = null;
  if (!user) failure = 'unknown_email';
  else if (!user.password_hash || !passwordOk) failure = 'wrong_password';
  else if (user.status !== 'active') failure = 'disabled';

  if (!user || failure) {
    await audit(req, {
      action: 'auth.login_failure',
      entityType: 'user',
      entityId: user?.id,
      metadata: { email, reason: failure },
    });
    // Same response whatever the reason.
    throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  await regenerateSession(req); // new session id on privilege change (session fixation)
  req.session.userId = user.id;
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await audit(req, { action: 'auth.login_success', actorUserId: user.id, entityType: 'user', entityId: user.id });

  res.json({ user: await loadSessionUser(user.id) });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
authRouter.post('/logout', async (req, res) => {
  const userId = req.session.userId;
  if (userId) {
    await audit(req, { action: 'auth.logout', actorUserId: userId, entityType: 'user', entityId: userId });
  }
  await destroySession(req);
  res.clearCookie('hm.sid');
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
authRouter.get('/me', requireSession, (req, res) => {
  res.json({ user: req.user });
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-password
// ---------------------------------------------------------------------------
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: newPasswordSchema,
});

authRouter.post('/change-password', requireSession, async (req, res) => {
  const { currentPassword, newPassword } = parseBody(changePasswordSchema, req.body);
  const userId = req.user!.id;

  const [row] = await query<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!row?.password_hash || !(await verifyPassword(currentPassword, row.password_hash))) {
    throw new HttpError(400, 'Current password is incorrect', 'INVALID_CREDENTIALS');
  }
  if (currentPassword === newPassword) {
    throw new HttpError(400, 'New password must be different from the current password', 'VALIDATION_ERROR');
  }

  await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [
    await hashPassword(newPassword),
    userId,
  ]);

  // Sign out every other device and give this one a fresh session id.
  await deleteUserSessions(userId);
  await regenerateSession(req);
  req.session.userId = userId;

  await audit(req, { action: 'auth.password_changed', entityType: 'user', entityId: userId });
  res.json({ user: await loadSessionUser(userId) });
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------
const forgotPasswordSchema = z.object({ email: z.string().trim().min(1).max(254) });

authRouter.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = parseBody(forgotPasswordSchema, req.body);

  const [user] = await query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE email = $1 AND status = 'active'`,
    [email],
  );

  if (user) {
    const { token, tokenHash } = generateToken();
    await withTransaction(async client => {
      // Only the newest link works.
      await client.query(`DELETE FROM auth_tokens WHERE user_id = $1 AND purpose = 'reset' AND used_at IS NULL`, [user.id]);
      await client.query(
        `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'reset', now() + make_interval(mins => $3))`,
        [user.id, tokenHash, RESET_TOKEN_TTL_MINUTES],
      );
    });
    // Not awaited: the response must not reveal (by timing or by error) whether the account exists.
    sendPasswordResetEmail(user.email, token).catch(err => console.error('Failed to send password reset email', err));
  }

  await audit(req, {
    action: 'auth.password_reset_requested',
    actorUserId: null,
    entityType: 'user',
    entityId: user?.id,
    metadata: { email, matched: Boolean(user) },
  });

  // Same answer whether or not the account exists.
  res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------
const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  newPassword: newPasswordSchema,
});

authRouter.post('/reset-password', resetPasswordLimiter, async (req, res) => {
  const { token, newPassword } = parseBody(resetPasswordSchema, req.body);
  const passwordHash = await hashPassword(newPassword);

  const userId = await withTransaction(async client => {
    // Claiming the token and checking it in one statement makes it single-use even under a race.
    const claimed = await client.query<{ user_id: string }>(
      `UPDATE auth_tokens t
          SET used_at = now()
         FROM users u
        WHERE t.token_hash = $1 AND t.purpose = 'reset' AND t.used_at IS NULL AND t.expires_at > now()
          AND u.id = t.user_id AND u.status = 'active'
        RETURNING t.user_id`,
      [hashToken(token)],
    );
    const id = claimed.rows[0]?.user_id;
    if (!id) return null;
    await client.query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [passwordHash, id]);
    return id;
  });

  if (!userId) {
    throw new HttpError(400, 'This reset link is invalid or has expired. Please request a new one.', 'INVALID_TOKEN');
  }

  // Sign the user out everywhere, including whoever is making this request.
  await deleteUserSessions(userId);
  await destroySession(req);
  res.clearCookie('hm.sid');

  await audit(req, { action: 'auth.password_reset_completed', actorUserId: userId, entityType: 'user', entityId: userId });
  res.json({ ok: true, message: 'Your password has been reset. You can now sign in.' });
});
