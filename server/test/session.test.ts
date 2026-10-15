// Absolute session lifetime: 12 hours from login for every role, not extended by activity.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { resetClock, setClock } from '../src/services/clock.js';
import { company, employee, PASSWORD, resetAll, signIn, user } from './fixtures.js';

const LOGIN = new Date('2026-10-14T04:00:00Z'); // 09:30 IST
const after = (hours: number, minutes: number) => new Date(LOGIN.getTime() + (hours * 60 + minutes) * 60_000);

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

describe('absolute session lifetime (12 h from login)', () => {
  it('works at 11h59m and returns 401 at 12h01m, even with heartbeats in between', async () => {
    const agent = await signIn('a@example.test');
    for (const [h, m] of [[1, 0], [6, 0], [11, 0], [11, 59]]) {
      setClock(after(h, m));
      await agent.post('/api/presence/heartbeat').expect(200);
    }
    await agent.get('/api/auth/me').expect(200);
    await agent.get('/api/attendance/me/today').expect(200);

    setClock(after(12, 1));
    const me = await agent.get('/api/auth/me').expect(401);
    expect(me.body.code).toBe('UNAUTHENTICATED');
    await agent.post('/api/presence/heartbeat').expect(401);
    // The session is gone for good, even if the clock went back.
    setClock(after(11, 0));
    await agent.get('/api/auth/me').expect(401);
  });

  it.each(['admin@example.test', 'manager@example.test', 'client@example.test'])('applies to %s too', async email => {
    const agent = await signIn(email);
    setClock(after(11, 59));
    await agent.get('/api/auth/me').expect(200);
    setClock(after(12, 1));
    await agent.get('/api/auth/me').expect(401);
  });

  it('a password change keeps the original login time', async () => {
    const agent = await signIn('a@example.test');
    setClock(after(1, 0));
    await agent.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'another-long-passphrase-42' }).expect(200);
    setClock(after(11, 59));
    await agent.get('/api/auth/me').expect(200);
    setClock(after(12, 1));
    await agent.get('/api/auth/me').expect(401);
  });

  it('a new login starts a new 12 hours', async () => {
    await signIn('a@example.test');
    setClock(after(10, 0));
    const second = await signIn('a@example.test');
    setClock(after(21, 59));
    await second.get('/api/auth/me').expect(200);
  });
});
