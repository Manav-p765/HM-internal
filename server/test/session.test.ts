// Absolute session lifetime: 7 days from login for every role, not extended by activity.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/db.js';
import { resetClock, setClock } from '../src/services/clock.js';
import { company, employee, PASSWORD, resetAll, signIn, user } from './fixtures.js';

const LOGIN = new Date('2026-10-14T04:00:00Z'); // 09:30 IST
const after = (days: number, minutes: number) => new Date(LOGIN.getTime() + (days * 24 * 60 + minutes) * 60_000);
const JUST_BEFORE = after(7, -1);
const JUST_AFTER = after(7, 1);

beforeEach(async () => {
  setClock(LOGIN);
  await resetAll();
  await user('admin@example.test', 'admin');
  await user('manager@example.test', 'manager');
  await user('a@example.test', 'employee', { employeeId: await employee('Avery A') });
  await user('client@example.test', 'client', { clientId: await company('Acme (Fake)') });
});

afterEach(() => resetClock());

afterAll(async () => {
  await pool.end();
});

describe('absolute session lifetime (7 days from login)', () => {
  it('works for 7 days (closing the browser does not matter) and returns 401 just after, even with heartbeats in between', async () => {
    const agent = await signIn('a@example.test');
    for (const [d, m] of [[0, 720], [1, 0], [3, 0], [6, 0], [7, -1]]) {
      setClock(after(d, m));
      await agent.post('/api/presence/heartbeat').expect(200);
    }
    await agent.get('/api/auth/me').expect(200);
    await agent.get('/api/attendance/me/today').expect(200);

    setClock(JUST_AFTER);
    const me = await agent.get('/api/auth/me').expect(401);
    expect(me.body.code).toBe('UNAUTHENTICATED');
    await agent.post('/api/presence/heartbeat').expect(401);
    // The session is gone for good, even if the clock went back.
    setClock(after(6, 0));
    await agent.get('/api/auth/me').expect(401);
  });

  it('the cookie lasts 7 days, so it survives closing the browser', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@example.test', password: PASSWORD })
      .expect(200);
    const cookie = String(res.headers['set-cookie']);
    const expires = Date.parse(/Expires=([^;]+)/.exec(cookie)![1]);
    expect(expires - Date.now()).toBeGreaterThan(7 * 24 * 60 * 60 * 1000 - 60_000);
  });

  it.each(['admin@example.test', 'manager@example.test', 'client@example.test'])('applies to %s too', async email => {
    const agent = await signIn(email);
    setClock(JUST_BEFORE);
    await agent.get('/api/auth/me').expect(200);
    setClock(JUST_AFTER);
    await agent.get('/api/auth/me').expect(401);
  });

  it('a password change keeps the original login time', async () => {
    const agent = await signIn('a@example.test');
    setClock(after(1, 0));
    await agent.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'another-long-passphrase-42' }).expect(200);
    setClock(JUST_BEFORE);
    await agent.get('/api/auth/me').expect(200);
    setClock(JUST_AFTER);
    await agent.get('/api/auth/me').expect(401);
  });

  it('a new login starts a new 7 days', async () => {
    await signIn('a@example.test');
    setClock(after(5, 0));
    const second = await signIn('a@example.test');
    setClock(after(11, 23 * 60));
    await second.get('/api/auth/me').expect(200);
  });
});
