import type { Request } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { audit } from '../services/audit.js';
import { now } from '../services/clock.js';
import { sendPasswordResetEmail } from '../services/mail.js';
import { claimToken, checkToken, dropAllTokens, issueToken } from '../services/passwordTokens.js';
import { DUMMY_HASH, hashPassword, newPasswordSchema, verifyPassword } from '../services/passwords.js';
import { deleteUserSessions, destroySession, loadSessionUser } from '../middleware/auth.js';
import { createRouter } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import {
  forgotPasswordLimiter,
  forgotPasswordPerEmailLimiter,
  loginLimiter,
  logoutLimiter,
  setPasswordCheckLimiter,
  setPasswordCheckPerTokenLimiter,
  setPasswordLimiter,
  setPasswordPerTokenLimiter,
} from '../middleware/security.js';

export const authRouter = createRouter();

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve())));
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
// The email is trimmed (and matched case-insensitively: citext); the password is compared exactly as typed,
// spaces included. Never trim or normalise a password.
const loginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

authRouter.post('/login', 'public', loginLimiter, async (req, res) => {
  const { email, password } = parseBody(loginSchema, req.body);

  // users.email is citext, so this match is case-insensitive.
  const [user] = await query<{ id: string; password_hash: string | null; status: string; client_status: string | null }>(
    `SELECT u.id, u.password_hash, u.status, c.status AS client_status
       FROM users u LEFT JOIN clients c ON c.id = u.client_id
      WHERE u.email = $1`,
    [email],
  );

  // Always run one bcrypt compare so a missing account takes as long as a wrong password.
  const passwordOk = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);

  let failure: string | null = null;
  if (!user) failure = 'unknown_email';
  else if (!user.password_hash || !passwordOk) failure = 'wrong_password';
  else if (user.status !== 'active') failure = 'disabled';
  else if (user.client_status !== null && user.client_status !== 'active') failure = 'client_inactive';

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
  req.session.loginAt = now().getTime(); // the 12-hour session lifetime starts here
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await audit(req, { action: 'auth.login_success', actorUserId: user.id, entityType: 'user', entityId: user.id });

  const sessionUser = await loadSessionUser(user.id);
  res.json({ user: sessionUser });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
authRouter.post('/logout', 'public', logoutLimiter, async (req, res) => {
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
// Read-only: no automatic punch-in here (state changes only on POST: login and presence heartbeat).
authRouter.get('/me', 'session', (req, res) => {
  res.json({ user: req.user });
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-password
// ---------------------------------------------------------------------------
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: newPasswordSchema,
});

authRouter.post('/change-password', 'session', async (req, res) => {
  const { currentPassword, newPassword } = parseBody(changePasswordSchema, req.body);
  const userId = req.user!.id;

  const [row] = await query<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!row?.password_hash || !(await verifyPassword(currentPassword, row.password_hash))) {
    throw new HttpError(400, 'Current password is incorrect', 'INVALID_CREDENTIALS');
  }
  if (currentPassword === newPassword) {
    throw new HttpError(400, 'New password must be different from the current password', 'VALIDATION_ERROR');
  }

  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async client => {
    await client.query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [passwordHash, userId]);
    // No link sent before the change (reset or invite) may undo it.
    await dropAllTokens(client, userId);
  });

  // Sign out every other device and give this one a fresh session id.
  await deleteUserSessions(userId);
  // A new session id, but the same sign-in: the 12-hour lifetime still counts from the original login.
  const loginAt = req.session.loginAt;
  await regenerateSession(req);
  req.session.userId = userId;
  req.session.loginAt = loginAt;

  await audit(req, { action: 'auth.password_changed', entityType: 'user', entityId: userId });
  res.json({ user: await loadSessionUser(userId) });
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------
const forgotPasswordSchema = z.object({ email: z.string().trim().min(1).max(254) });

authRouter.post('/forgot-password', 'public', forgotPasswordLimiter, forgotPasswordPerEmailLimiter, async (req, res) => {
  const { email } = parseBody(forgotPasswordSchema, req.body);

  const [user] = await query<{ id: string; email: string }>(
    `SELECT u.id, u.email FROM users u LEFT JOIN clients c ON c.id = u.client_id
      WHERE u.email = $1 AND u.status = 'active' AND (u.client_id IS NULL OR c.status = 'active')`,
    [email],
  );

  if (user) {
    const token = await withTransaction(async client => {
      // Only the newest link works (this also replaces an unused invite: the reset link sets the password too).
      await dropAllTokens(client, user.id);
      return (await issueToken(client, user.id, 'reset')).token;
    });
    // Not awaited: the response must not reveal (by timing or by error) whether the account exists.
    // A failure is logged by mail.ts (purpose, transport and code only).
    sendPasswordResetEmail(user.email, token).catch(() => {});
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
// GET /api/auth/set-password/check?token=...   (the emailed invite or reset link)
// POST /api/auth/set-password { token, password }
// Every bad token (unknown, expired, used, replaced by a newer one, or its account disabled) gets the same
// 400 LINK_INVALID, so the answer never says which. The token is never logged: the request log has the path
// only, and nothing here writes it anywhere.
// ---------------------------------------------------------------------------
const LINK_INVALID = () =>
  new HttpError(400, 'This link is invalid or has expired. Ask your administrator to send a new one.', 'LINK_INVALID');

// A token is 32 random bytes in base64url (43 characters); anything else can't be one.
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,128}$/);

authRouter.get('/set-password/check', 'public', setPasswordCheckLimiter, setPasswordCheckPerTokenLimiter, async (req, res) => {
  const parsed = tokenSchema.safeParse(req.query.token);
  const found = parsed.success ? await checkToken(parsed.data) : null;
  if (!found) throw LINK_INVALID();
  res.json({ valid: true, email: found.email, purpose: found.purpose });
});

const setPasswordSchema = z.object({ token: z.string().max(200), password: newPasswordSchema });

authRouter.post('/set-password', 'public', setPasswordLimiter, setPasswordPerTokenLimiter, async (req, res) => {
  const { token, password } = parseBody(setPasswordSchema, req.body);
  if (!tokenSchema.safeParse(token).success) throw LINK_INVALID();
  const passwordHash = await hashPassword(password);

  const claimed = await withTransaction(async client => {
    const found = await claimToken(client, token);
    if (!found) return null;
    await client.query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [passwordHash, found.userId]);
    // Every other link of this user dies with it (an older invite, a reset link).
    await dropAllTokens(client, found.userId);
    return found;
  });
  if (!claimed) throw LINK_INVALID();

  // Signed out everywhere else; this browser gets a fresh session as the user (session fixation: new id).
  await deleteUserSessions(claimed.userId);
  await regenerateSession(req);
  req.session.userId = claimed.userId;
  req.session.loginAt = now().getTime();
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [claimed.userId]);
  await audit(req, {
    action: 'auth.password_set',
    actorUserId: claimed.userId,
    entityType: 'user',
    entityId: claimed.userId,
    metadata: { purpose: claimed.purpose },
  });

  const sessionUser = await loadSessionUser(claimed.userId);
  res.json({ user: sessionUser });
});
