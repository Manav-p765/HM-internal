import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { testOutbox } from '../src/services/mail.js';
import { hashPassword } from '../src/services/passwords.js';

const PASSWORD = 'correct-horse-battery';
const GENERIC_LOGIN_ERROR = { error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' };

type Role = 'admin' | 'manager' | 'employee';

async function createUser(
  email: string,
  role: Role,
  opts: { status?: 'active' | 'disabled'; mustChangePassword?: boolean } = {},
): Promise<string> {
  const [row] = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, status, must_change_password)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [email, await hashPassword(PASSWORD), role, opts.status ?? 'active', opts.mustChangePassword ?? false],
  );
  return row.id;
}

// A supertest agent keeps the session cookie between requests, like a browser.
async function signIn(email: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

function lastMailTo(email: string) {
  const mail = testOutbox.filter(m => m.to === email).at(-1);
  if (!mail) throw new Error(`No mail sent to ${email}`);
  return mail;
}

const resetTokenFrom = (text: string) => decodeURIComponent(text.match(/reset-password\?token=(\S+)/)![1]);
const tempPasswordFrom = (text: string) => text.match(/Temporary password: (\S+)/)![1];

beforeEach(async () => {
  await query('TRUNCATE audit_logs, auth_tokens, sessions, users, employees CASCADE');
  testOutbox.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe('login', () => {
  it('signs in (email is case-insensitive), sets last_login_at and exposes /me', async () => {
    const id = await createUser('admin@example.test', 'admin');
    const agent = request.agent(app);

    const login = await agent.post('/api/auth/login').send({ email: 'ADMIN@Example.Test', password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user).toEqual({
      id,
      email: 'admin@example.test',
      role: 'admin',
      employeeId: null,
      mustChangePassword: false,
      name: null,
    });
    expect(JSON.stringify(login.body)).not.toContain('password_hash');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(id);

    const [row] = await query<{ last_login_at: Date | null }>('SELECT last_login_at FROM users WHERE id = $1', [id]);
    expect(row.last_login_at).not.toBeNull();
    const audits = await query(`SELECT 1 FROM audit_logs WHERE action = 'auth.login_success' AND entity_id = $1`, [id]);
    expect(audits).toHaveLength(1);

    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('gives the same generic error for a wrong password, an unknown email and a disabled user', async () => {
    await createUser('user@example.test', 'employee');
    await createUser('disabled@example.test', 'employee', { status: 'disabled' });

    const attempts = [
      { email: 'user@example.test', password: 'wrong-password-123' },
      { email: 'nobody@example.test', password: PASSWORD },
      { email: 'disabled@example.test', password: PASSWORD }, // correct password, disabled account
    ];
    for (const attempt of attempts) {
      const res = await request(app).post('/api/auth/login').send(attempt);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(GENERIC_LOGIN_ERROR);
      expect(res.headers['set-cookie']).toBeUndefined();
    }

    const failures = await query(`SELECT metadata->>'reason' AS reason FROM audit_logs WHERE action = 'auth.login_failure' ORDER BY created_at`);
    expect(failures.map(f => f.reason)).toEqual(['wrong_password', 'unknown_email', 'disabled']);
  });

  it('ends an existing session as soon as the user is disabled', async () => {
    const id = await createUser('user@example.test', 'employee');
    const agent = await signIn('user@example.test');
    await query(`UPDATE users SET status = 'disabled' WHERE id = $1`, [id]);
    await agent.get('/api/auth/me').expect(401);
  });
});

describe('forced password change', () => {
  it('blocks everything except /me, /logout and /change-password until the password is changed', async () => {
    await createUser('new-admin@example.test', 'admin', { mustChangePassword: true });
    const agent = await signIn('new-admin@example.test');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.mustChangePassword).toBe(true);

    for (const res of [
      await agent.get('/api/users'),
      await agent.post('/api/users').send({ email: 'x@example.test', role: 'employee' }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }

    // Policy: wrong current password, too-short new password, unchanged password are all refused.
    await agent.post('/api/auth/change-password').send({ currentPassword: 'nope-nope-nope', newPassword: 'a-brand-new-password' }).expect(400);
    await agent.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'short' }).expect(400);
    await agent.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: PASSWORD }).expect(400);

    const changed = await agent.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'a-brand-new-password' });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);

    await agent.get('/api/users').expect(200);

    // The old password is dead, the new one works.
    await request(app).post('/api/auth/login').send({ email: 'new-admin@example.test', password: PASSWORD }).expect(401);
    await signIn('new-admin@example.test', 'a-brand-new-password');
  });

  it('signs out the other sessions of a user who changes their password', async () => {
    await createUser('user@example.test', 'employee');
    const laptop = await signIn('user@example.test');
    const phone = await signIn('user@example.test');

    await laptop.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'a-brand-new-password' }).expect(200);

    await laptop.get('/api/auth/me').expect(200);
    await phone.get('/api/auth/me').expect(401);
  });
});

describe('forgot / reset password', () => {
  it('answers identically for unknown emails and sends nothing', async () => {
    await createUser('user@example.test', 'employee');
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'user@example.test' });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.test' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(testOutbox.map(m => m.to)).toEqual(['user@example.test']);
  });

  it('resets the password once, invalidates sessions, and refuses to reuse the token', async () => {
    const id = await createUser('user@example.test', 'employee', { mustChangePassword: true });
    const oldSession = await signIn('user@example.test');

    await request(app).post('/api/auth/forgot-password').send({ email: 'User@Example.test' }).expect(200);
    const token = resetTokenFrom(lastMailTo('user@example.test').text);

    // Only a hash of the token is stored.
    const [stored] = await query<{ token_hash: string }>('SELECT token_hash FROM auth_tokens WHERE user_id = $1', [id]);
    expect(stored.token_hash).not.toBe(token);

    await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'short' }).expect(400);
    await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'reset-password-123' }).expect(200);

    await oldSession.get('/api/auth/me').expect(401);

    const reuse = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'another-password-456' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe('INVALID_TOKEN');

    await request(app).post('/api/auth/login').send({ email: 'user@example.test', password: PASSWORD }).expect(401);
    const agent = await signIn('user@example.test', 'reset-password-123');
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.mustChangePassword).toBe(false);
  });

  it('refuses an expired token and a made-up token', async () => {
    const id = await createUser('user@example.test', 'employee');
    await request(app).post('/api/auth/forgot-password').send({ email: 'user@example.test' }).expect(200);
    const token = resetTokenFrom(lastMailTo('user@example.test').text);

    const [row] = await query<{ minutes: string }>(
      `SELECT round(extract(epoch FROM expires_at - now()) / 60) AS minutes FROM auth_tokens WHERE user_id = $1`,
      [id],
    );
    expect(Number(row.minutes)).toBe(60);

    await query(`UPDATE auth_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1`, [id]);

    for (const candidate of [token, 'not-a-real-token']) {
      const res = await request(app).post('/api/auth/reset-password').send({ token: candidate, newPassword: 'reset-password-123' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_TOKEN');
    }
    await signIn('user@example.test'); // original password still works
  });
});

describe('/api/users (admin only)', () => {
  it('rejects anonymous users, employees and managers', async () => {
    await createUser('employee@example.test', 'employee');
    await createUser('manager@example.test', 'manager');

    await request(app).get('/api/users').expect(401);
    for (const email of ['employee@example.test', 'manager@example.test']) {
      const agent = await signIn(email);
      const list = await agent.get('/api/users');
      expect(list.status).toBe(403);
      expect(list.body.code).toBe('FORBIDDEN');
      await agent.post('/api/users').send({ email: 'x@example.test', role: 'admin' }).expect(403);
    }
    expect(await query(`SELECT 1 FROM users WHERE email = 'x@example.test'`)).toHaveLength(0);
  });

  it('creates a user with an emailed temporary password that must be changed', async () => {
    await createUser('admin@example.test', 'admin');
    const admin = await signIn('admin@example.test');

    const created = await admin.post('/api/users').send({ email: 'New.User@Example.test', role: 'manager' });
    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({ email: 'new.user@example.test', role: 'manager', status: 'active', mustChangePassword: true });

    const mail = lastMailTo('new.user@example.test');
    const tempPassword = tempPasswordFrom(mail.text);
    expect(tempPassword).toHaveLength(16);
    expect(JSON.stringify(created.body)).not.toContain(tempPassword);

    await admin.post('/api/users').send({ email: 'new.user@example.test', role: 'employee' }).expect(409);

    const newUser = await signIn('new.user@example.test', tempPassword);
    const me = await newUser.get('/api/auth/me');
    expect(me.body.user.mustChangePassword).toBe(true);

    // Resending credentials replaces the password and signs the user out.
    const id = created.body.user.id;
    await admin.post(`/api/users/${id}/resend-credentials`).expect(200);
    await newUser.get('/api/auth/me').expect(401);
    await request(app).post('/api/auth/login').send({ email: 'new.user@example.test', password: tempPassword }).expect(401);
    await signIn('new.user@example.test', tempPasswordFrom(lastMailTo('new.user@example.test').text));

    const actions = (await query<{ action: string }>(`SELECT action FROM audit_logs WHERE entity_id = $1 AND action LIKE 'user.%' ORDER BY created_at`, [id])).map(a => a.action);
    expect(actions).toEqual(['user.created', 'user.credentials_resent']);
  });

  it('protects the last active admin and stops admins disabling or demoting themselves', async () => {
    const adminId = await createUser('admin@example.test', 'admin');
    const admin = await signIn('admin@example.test');

    // Only admin: cannot be demoted or disabled at all.
    for (const change of [{ role: 'manager' }, { status: 'disabled' }]) {
      const res = await admin.patch(`/api/users/${adminId}`).send(change);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LAST_ADMIN');
    }

    // With a second admin around, changing yourself is still refused...
    const secondId = await createUser('second@example.test', 'admin');
    const self = await admin.patch(`/api/users/${adminId}`).send({ status: 'disabled' });
    expect(self.status).toBe(400);
    expect(self.body.code).toBe('CANNOT_MODIFY_SELF');

    // ...but the other admin can be demoted and disabled, which ends their sessions.
    const second = await signIn('second@example.test');
    const demoted = await admin.patch(`/api/users/${secondId}`).send({ role: 'employee', status: 'disabled' });
    expect(demoted.status).toBe(200);
    expect(demoted.body.user).toMatchObject({ role: 'employee', status: 'disabled' });
    await second.get('/api/auth/me').expect(401);

    const [row] = await query<{ role: string; status: string }>('SELECT role, status FROM users WHERE id = $1', [adminId]);
    expect(row).toEqual({ role: 'admin', status: 'active' });
  });
});

describe('origin check', () => {
  it('rejects mutating requests from another origin', async () => {
    await createUser('admin@example.test', 'admin');
    const evil = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'admin@example.test', password: PASSWORD });
    expect(evil.status).toBe(403);
    expect(evil.body.code).toBe('BAD_ORIGIN');

    await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'admin@example.test', password: PASSWORD })
      .expect(200);
  });
});
