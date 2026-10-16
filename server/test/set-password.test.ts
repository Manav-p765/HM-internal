// Invite and reset links (/set-password) and the rule that a password is used exactly as typed.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { testOutbox } from '../src/services/mail.js';
import { hashToken } from '../src/services/passwords.js';
import { PASSWORD, resetAll, signIn, user } from './fixtures.js';

const LINK_INVALID = {
  error: 'This link is invalid or has expired. Ask your administrator to send a new one.',
  code: 'LINK_INVALID',
};

const linkTokenFor = (email: string) =>
  decodeURIComponent(
    testOutbox
      .filter(m => m.to === email)
      .at(-1)!
      .text.match(/\/set-password\?token=(\S+)/)![1],
  );

const check = (token: string) => request(app).get('/api/auth/set-password/check').query({ token });
const setPassword = (token: string, password: string, agent: request.Agent | request.SuperTest<request.Test> = request(app)) =>
  agent.post('/api/auth/set-password').send({ token, password });

let admin: request.Agent;

async function invite(email: string, role = 'employee'): Promise<{ id: string; token: string }> {
  const res = await admin.post('/api/users').send({ email, role }).expect(201);
  return { id: res.body.user.id, token: linkTokenFor(email.trim().toLowerCase()) };
}

beforeEach(async () => {
  await resetAll();
  testOutbox.length = 0;
  await user('admin@example.test', 'admin');
  admin = await signIn('admin@example.test');
});

afterAll(async () => {
  await pool.end();
});

describe('creating a user sends an invite link, never a password', () => {
  it('stores no password and only the hash of a 72-hour invite token that the emailed link verifies', async () => {
    const res = await admin.post('/api/users').send({ email: 'Invitee@Example.test', role: 'employee' }).expect(201);
    const mail = testOutbox.at(-1)!;
    expect(mail.to).toBe('invitee@example.test');
    expect(mail.subject).toBe('Set your password for Monks Internal Management');
    expect(mail.text).toContain('http://localhost:3000/set-password?token=');
    expect(mail.text).toMatch(/expires in 72 hours/);
    expect(mail.text).not.toMatch(/temporary password/i);

    const token = linkTokenFor('invitee@example.test');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url

    const [row] = await query<{ password_hash: string | null; must_change_password: boolean }>(
      'SELECT password_hash, must_change_password FROM users WHERE id = $1',
      [res.body.user.id],
    );
    expect(row).toEqual({ password_hash: null, must_change_password: false });

    const [stored] = await query<{ token_hash: string; purpose: string; hours: string }>(
      `SELECT token_hash, purpose, round(extract(epoch FROM expires_at - created_at) / 3600) AS hours
         FROM password_tokens WHERE user_id = $1`,
      [res.body.user.id],
    );
    expect(stored).toEqual({ token_hash: hashToken(token), purpose: 'invite', hours: '72' });

    expect(res.text).not.toContain(token);
    expect(res.text).not.toContain(stored.token_hash);
    expect((await check(token).expect(200)).body).toEqual({ valid: true, email: 'invitee@example.test', purpose: 'invite' });
  });
});

describe('every bad link gets exactly the same answer', () => {
  it('valid works; expired, used, unknown, replaced, malformed, missing and disabled-user links are indistinguishable', async () => {
    const valid = await invite('valid@example.test');

    const expired = await invite('expired@example.test');
    await query(`UPDATE password_tokens SET created_at = now() - interval '4 days', expires_at = now() - interval '1 second' WHERE user_id = $1`, [expired.id]);

    const used = await invite('used@example.test');
    await setPassword(used.token, 'first-password-1').expect(200);

    const replaced = await invite('replaced@example.test');
    await admin.post(`/api/users/${replaced.id}/resend-invite`).expect(200);

    const disabled = await invite('disabled@example.test');
    await admin.patch(`/api/users/${disabled.id}`).send({ status: 'disabled' }).expect(200);

    const unknown = 'A'.repeat(43);
    const bad = { expired: expired.token, used: used.token, unknown, replaced: replaced.token, disabled: disabled.token, malformed: 'not a token!' };

    await check(valid.token).expect(200);
    for (const [name, token] of Object.entries(bad)) {
      const checked = await check(token);
      expect({ name, status: checked.status, body: checked.body }).toEqual({ name, status: 400, body: LINK_INVALID });
      const set = await setPassword(token, 'some-new-password-1');
      expect({ name, status: set.status, body: set.body }).toEqual({ name, status: 400, body: LINK_INVALID });
    }
    const missing = await request(app).get('/api/auth/set-password/check');
    expect({ status: missing.status, body: missing.body }).toEqual({ status: 400, body: LINK_INVALID });
    // None of those attempts changed anything.
    expect(await query(`SELECT 1 FROM users WHERE email = 'expired@example.test' AND password_hash IS NULL`)).toHaveLength(1);
  });

  it('two parallel submits of the same link set the password exactly once', async () => {
    const { token } = await invite('race@example.test');
    const results = await Promise.all([setPassword(token, 'racer-one-password'), setPassword(token, 'racer-two-password')]);
    expect(results.map(r => r.status).sort()).toEqual([200, 400]);
    const winner = results[0].status === 200 ? 'racer-one-password' : 'racer-two-password';
    const loser = winner === 'racer-one-password' ? 'racer-two-password' : 'racer-one-password';
    await request(app).post('/api/auth/login').send({ email: 'race@example.test', password: winner }).expect(200);
    await request(app).post('/api/auth/login').send({ email: 'race@example.test', password: loser }).expect(401);
    expect(await query(`SELECT 1 FROM audit_logs WHERE action = 'auth.password_set'`)).toHaveLength(1);
  });
});

describe('setting a password', () => {
  it('signs the user in, ends their other sessions and kills every other outstanding link', async () => {
    const id = await user('member@example.test', 'employee');
    const otherDevice = await signIn('member@example.test');

    await admin.post(`/api/users/${id}/send-reset-link`).expect(200);
    const token = linkTokenFor('member@example.test');
    // A second outstanding link (e.g. an older invite row) must die too.
    await query(
      `INSERT INTO password_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, 'invite', now() + interval '1 day')`,
      [id, hashToken('B'.repeat(43))],
    );

    const browser = request.agent(app);
    const res = await setPassword(token, 'brand-new-password-1', browser).expect(200);
    expect(res.body.user).toMatchObject({ email: 'member@example.test', mustChangePassword: false });
    await browser.get('/api/auth/me').expect(200);
    await otherDevice.get('/api/auth/me').expect(401);
    await check('B'.repeat(43)).expect(400);
    expect(await query('SELECT 1 FROM password_tokens WHERE user_id = $1 AND used_at IS NULL', [id])).toHaveLength(0);

    const [log] = await query<{ action: string; metadata: unknown }>(`SELECT action, metadata FROM audit_logs WHERE action = 'auth.password_set'`);
    expect(log.metadata).toEqual({ purpose: 'reset' });
  });

  it('a reset link cannot be used after the password was changed another way', async () => {
    const id = await user('changer@example.test', 'employee');
    await admin.post(`/api/users/${id}/send-reset-link`).expect(200);
    const token = linkTokenFor('changer@example.test');
    const agent = await signIn('changer@example.test');
    await agent.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'changed-password-1' }).expect(200);
    expect((await setPassword(token, 'attacker-password-1')).body).toEqual(LINK_INVALID);
  });

  it('only admins and managers can send links; a manager only to client users; never to yourself', async () => {
    const staffId = await user('staff@example.test', 'employee');
    await user('manager@example.test', 'manager');
    const manager = await signIn('manager@example.test');
    const employee = await signIn('staff@example.test');
    await employee.post(`/api/users/${staffId}/send-reset-link`).expect(403);
    await manager.post(`/api/users/${staffId}/send-reset-link`).expect(403);
    const [me] = await query<{ id: string }>(`SELECT id FROM users WHERE email = 'admin@example.test'`);
    expect((await admin.post(`/api/users/${me.id}/send-reset-link`)).body.code).toBe('CANNOT_MODIFY_SELF');
    await admin.post('/api/users/00000000-0000-4000-8000-000000000000/resend-invite').expect(404);
  });
});

describe('passwords are used exactly as typed (spaces included)', () => {
  const SPACED = '  my pass word 42  ';

  it('a password with leading, inner and trailing spaces works only exactly; the email is trimmed and case-insensitive', async () => {
    const { token } = await invite('spaces@example.test');
    await setPassword(token, SPACED).expect(200);

    const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });
    await login('spaces@example.test', SPACED).expect(200);
    await login('  Spaces@Example.TEST  ', SPACED).expect(200);
    for (const altered of [SPACED.trim(), SPACED.trimStart(), SPACED.trimEnd(), SPACED.replace(/ /g, ''), 'my pass word 42']) {
      const res = await login('spaces@example.test', altered);
      expect({ altered, status: res.status, body: res.body }).toEqual({
        altered,
        status: 401,
        body: { error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
      });
    }
  });

  it('change-password keeps spaces too, and checks the current one exactly', async () => {
    const { token } = await invite('changer2@example.test');
    const agent = request.agent(app);
    await setPassword(token, ' old secret phrase ', agent).expect(200);
    await agent.post('/api/auth/change-password').send({ currentPassword: 'old secret phrase', newPassword: 'new secret phrase' }).expect(400);
    await agent.post('/api/auth/change-password').send({ currentPassword: ' old secret phrase ', newPassword: '\tnew secret phrase ' }).expect(200);
    await request(app).post('/api/auth/login').send({ email: 'changer2@example.test', password: '\tnew secret phrase ' }).expect(200);
    await request(app).post('/api/auth/login').send({ email: 'changer2@example.test', password: 'new secret phrase' }).expect(401);
  });

  it('length counts spaces; a password of only spaces is refused with a clear message', async () => {
    const { token } = await invite('policy@example.test');
    const onlySpaces = await setPassword(token, '            ');
    expect(onlySpaces.status).toBe(400);
    expect(onlySpaces.body.details).toContainEqual({ path: 'password', message: 'Password cannot be only spaces' });
    const short = await setPassword(token, 'abc def');
    expect(short.body.details).toContainEqual({ path: 'password', message: 'Password must be at least 10 characters' });
    // Exactly 10 characters, two of them spaces: accepted. The refused attempts didn't use up the link.
    await setPassword(token, 'ab cd ef12').expect(200);
    await request(app).post('/api/auth/login').send({ email: 'policy@example.test', password: 'ab cd ef12' }).expect(200);
  });
});
