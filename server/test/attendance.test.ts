// Attendance (automatic punch-in, punch-out, roster, manual correction), presence heartbeats, staff team
// availability and the client portal team view. The clock is injected (services/clock.ts).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { resetClock, setClock } from '../src/services/clock.js';
import { company, employee, member, PASSWORD, project, resetAll, signIn, user } from './fixtures.js';

// Wednesday 2026-10-14, 09:30 IST.
const DAY = '2026-10-14';
const T0 = new Date('2026-10-14T04:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

let ids: {
  admin: string;
  managerEmp: string;
  empA: string;
  empB: string;
  inactiveEmp: string;
  acme: string;
  globex: string;
  acmeProject: string;
};
let agents: Record<'admin' | 'manager' | 'employee' | 'employeeB' | 'client' | 'clientB', request.Agent>;

async function records(employeeId: string) {
  return query<{ work_date: string; punch_in: Date; punch_out: Date | null; source: string }>(
    'SELECT work_date, punch_in, punch_out, source FROM attendance_records WHERE employee_id = $1 ORDER BY work_date',
    [employeeId],
  );
}

beforeEach(async () => {
  setClock(T0);
  await resetAll();
  const managerEmp = await employee('Morgan Manager');
  const empA = await employee('Avery A');
  const empB = await employee('Blake B');
  const inactiveEmp = await employee('Ina Inactive', 'inactive');
  const admin = await user('admin@example.test', 'admin');
  await user('manager@example.test', 'manager', { employeeId: managerEmp });
  await user('a@example.test', 'employee', { employeeId: empA });
  await user('b@example.test', 'employee', { employeeId: empB });
  const acme = await company('Acme (Fake)');
  const globex = await company('Globex (Fake)');
  await user('client@acme.example.test', 'client', { clientId: acme });
  await user('client@globex.example.test', 'client', { clientId: globex });
  const acmeProject = await project('Acme Site', admin, acme);
  ids = { admin, managerEmp, empA, empB, inactiveEmp, acme, globex, acmeProject };

  agents = {
    admin: await signIn('admin@example.test'),
    manager: await signIn('manager@example.test'),
    employee: await signIn('a@example.test'),
    employeeB: await signIn('b@example.test'),
    client: await signIn('client@acme.example.test'),
    clientB: await signIn('client@globex.example.test'),
  };
});

afterEach(() => {
  resetClock();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Role matrix: every new route, every role. Allowed roles must never get 401/403; everyone else gets 403
// (signed in) or 401 (anonymous). Exact business statuses are covered by the behaviour tests below.
// ---------------------------------------------------------------------------
describe('role matrix', () => {
  type Role = 'admin' | 'manager' | 'employee' | 'client';
  const STAFF: Role[] = ['admin', 'manager', 'employee'];
  const someId = '00000000-0000-4000-a000-00000000dead';
  const routes: { name: string; method: 'get' | 'post' | 'put' | 'patch'; path: () => string; allowed: Role[]; body?: object }[] = [
    { name: 'GET /attendance/me/today', method: 'get', path: () => '/api/attendance/me/today', allowed: ['employee'] },
    { name: 'GET /attendance/me', method: 'get', path: () => '/api/attendance/me', allowed: ['employee'] },
    { name: 'POST /attendance/me/punch-out', method: 'post', path: () => '/api/attendance/me/punch-out', allowed: ['employee'] },
    { name: 'GET /attendance', method: 'get', path: () => `/api/attendance?date=${DAY}`, allowed: ['admin', 'manager'] },
    { name: 'GET /attendance/:employeeId/:date', method: 'get', path: () => `/api/attendance/${ids.empA}/${DAY}`, allowed: STAFF },
    { name: 'PUT /attendance/:employeeId/:date', method: 'put', path: () => `/api/attendance/${ids.empB}/${DAY}`, allowed: ['admin', 'manager'], body: {} },
    { name: 'POST /presence/heartbeat', method: 'post', path: () => '/api/presence/heartbeat', allowed: ['employee'] },
    { name: 'GET /team/availability', method: 'get', path: () => '/api/team/availability', allowed: STAFF },
    { name: 'GET /leaves/me', method: 'get', path: () => '/api/leaves/me', allowed: STAFF },
    { name: 'GET /leaves', method: 'get', path: () => '/api/leaves', allowed: ['admin', 'manager'] },
    { name: 'POST /leaves', method: 'post', path: () => '/api/leaves', allowed: STAFF, body: {} },
    { name: 'GET /leaves/:id', method: 'get', path: () => `/api/leaves/${someId}`, allowed: STAFF },
    { name: 'PATCH /leaves/:id', method: 'patch', path: () => `/api/leaves/${someId}`, allowed: STAFF, body: { reason: 'x' } },
    { name: 'POST /leaves/:id/cancel', method: 'post', path: () => `/api/leaves/${someId}/cancel`, allowed: STAFF },
    { name: 'POST /leaves/:id/approve', method: 'post', path: () => `/api/leaves/${someId}/approve`, allowed: ['admin', 'manager'] },
    { name: 'POST /leaves/:id/reject', method: 'post', path: () => `/api/leaves/${someId}/reject`, allowed: ['admin', 'manager'], body: { reason: 'x' } },
    { name: 'GET /portal/team', method: 'get', path: () => '/api/portal/team', allowed: ['client'] },
  ];

  it.each(routes.map(r => [r.name, r] as const))('%s', async (_name, route) => {
    const results: Record<string, number> = {};
    for (const role of ['admin', 'manager', 'employee', 'client'] as Role[]) {
      const res = await agents[role][route.method](route.path()).send(route.body ?? {});
      results[role] = res.status;
    }
    results.anonymous = (await request(app)[route.method](route.path()).send(route.body ?? {})).status;

    // An allowed role may get any business answer (200, 400, 404, 409) but never 401/403.
    const actual: Record<string, number | 'allowed'> = {};
    const expected: Record<string, number | 'allowed'> = {};
    for (const role of ['admin', 'manager', 'employee', 'client'] as Role[]) {
      const allowed = route.allowed.includes(role);
      actual[role] = allowed && ![401, 403].includes(results[role]) ? 'allowed' : results[role];
      expected[role] = allowed ? 'allowed' : 403;
    }
    actual.anonymous = results.anonymous;
    expected.anonymous = 401;
    expect(actual).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Automatic punch-in
// ---------------------------------------------------------------------------
describe('automatic punch-in', () => {
  it('creates today\'s record at login (employee role only), with the server clock and an audit row', async () => {
    const rows = await records(ids.empA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ work_date: DAY, source: 'login', punch_out: null });
    expect(rows[0].punch_in.toISOString()).toBe(T0.toISOString());
    // The manager is linked to an employee but is not an employee-role user: no automatic punch-in.
    expect(await records(ids.managerEmp)).toHaveLength(0);
    const [audit] = await query(`SELECT metadata FROM audit_logs WHERE action = 'attendance.punched_in' AND metadata->>'employeeId' = $1`, [ids.empA]);
    expect(audit.metadata).toMatchObject({ workDate: DAY, source: 'login' });
  });

  it('a second login the same day does not duplicate or move the punch-in', async () => {
    setClock(at(120));
    await signIn('a@example.test');
    await agents.employee.get('/api/auth/me').expect(200);
    const rows = await records(ids.empA);
    expect(rows).toHaveLength(1);
    expect(rows[0].punch_in.toISOString()).toBe(T0.toISOString());
  });

  it('the first /auth/me of the next IST day creates a new record on the same session', async () => {
    setClock(new Date('2026-10-15T03:45:00Z'));
    await agents.employee.get('/api/auth/me').expect(200);
    expect((await records(ids.empA)).map(r => r.work_date)).toEqual([DAY, '2026-10-15']);
  });

  it('the first heartbeat of a new IST day also punches in', async () => {
    setClock(new Date('2026-10-15T03:45:00Z'));
    await agents.employee.post('/api/presence/heartbeat').expect(200);
    expect((await records(ids.empA)).map(r => r.work_date)).toEqual([DAY, '2026-10-15']);
  });

  it('IST midnight edge: 23:59:59 IST belongs to the old day, 00:00:00 IST to the new one', async () => {
    await query('DELETE FROM attendance_records');
    setClock(new Date('2026-10-14T18:29:59Z')); // 23:59:59 IST on the 14th
    const agent = await signIn('b@example.test');
    expect((await records(ids.empB)).map(r => r.work_date)).toEqual([DAY]);
    setClock(new Date('2026-10-14T18:30:00Z')); // 00:00:00 IST on the 15th
    await agent.get('/api/auth/me').expect(200);
    expect((await records(ids.empB)).map(r => r.work_date)).toEqual([DAY, '2026-10-15']);
  });

  it('a failing insert is logged without secrets and never fails the login', async () => {
    await query('DELETE FROM attendance_records');
    await query(`CREATE OR REPLACE FUNCTION fail_attendance_insert() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced failure'; END $$ LANGUAGE plpgsql`);
    await query('CREATE TRIGGER fail_attendance_insert BEFORE INSERT ON attendance_records FOR EACH ROW EXECUTE FUNCTION fail_attendance_insert()');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await request(app).post('/api/auth/login').send({ email: 'a@example.test', password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('a@example.test');
      expect(await records(ids.empA)).toHaveLength(0);
      const logged = errors.mock.calls.flat().map(String).join('\n');
      expect(logged).toContain('Automatic punch-in failed');
      expect(logged).not.toContain(PASSWORD);
      expect(logged).not.toMatch(/hm\.sid|cookie/i);
    } finally {
      await query('DROP TRIGGER fail_attendance_insert ON attendance_records');
      await query('DROP FUNCTION fail_attendance_insert()');
    }
  });

  it('an inactive employee is never punched in', async () => {
    await user('inactive@example.test', 'employee', { employeeId: ids.inactiveEmp });
    await signIn('inactive@example.test');
    expect(await records(ids.inactiveEmp)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Employee: today, month, punch-out
// ---------------------------------------------------------------------------
describe('employee attendance', () => {
  it('GET /me/today shows the automatic punch-in with server-computed worked minutes', async () => {
    setClock(at(95));
    const res = await agents.employee.get('/api/attendance/me/today').expect(200);
    expect(res.body).toMatchObject({ date: DAY, serverTime: at(95).toISOString(), leave: null });
    expect(res.body.record).toMatchObject({ workDate: DAY, punchIn: T0.toISOString(), punchOut: null, workedMinutes: 95, corrected: false });
  });

  it('punch-out closes today\'s record once; a second punch-out is a 409', async () => {
    setClock(at(8 * 60));
    const res = await agents.employee.post('/api/attendance/me/punch-out').expect(200);
    expect(res.body.record).toMatchObject({ punchOut: at(480).toISOString(), workedMinutes: 480, corrected: false });
    const again = await agents.employee.post('/api/attendance/me/punch-out').expect(409);
    expect(again.body.code).toBe('ALREADY_PUNCHED_OUT');
    expect(await query(`SELECT 1 FROM audit_logs WHERE action = 'attendance.punched_out'`)).toHaveLength(1);
  });

  it('punch-out without a punch-in today is a 409', async () => {
    await query('DELETE FROM attendance_records');
    const res = await agents.employee.post('/api/attendance/me/punch-out').expect(409);
    expect(res.body.code).toBe('NOT_PUNCHED_IN');
    // Yesterday's open record doesn't count either.
    await query(`INSERT INTO attendance_records (employee_id, work_date, punch_in) VALUES ($1, '2026-10-13', '2026-10-13T04:00:00Z')`, [ids.empA]);
    expect((await agents.employee.post('/api/attendance/me/punch-out').expect(409)).body.code).toBe('NOT_PUNCHED_IN');
  });

  it('GET /me?month lists only the caller\'s records for that month', async () => {
    await query(
      `INSERT INTO attendance_records (employee_id, work_date, punch_in, punch_out) VALUES
         ($1, '2026-10-13', '2026-10-13T04:00:00Z', '2026-10-13T12:00:00Z'),
         ($1, '2026-09-30', '2026-09-30T04:00:00Z', '2026-09-30T12:00:00Z'),
         ($2, '2026-10-13', '2026-10-13T04:00:00Z', NULL)`,
      [ids.empA, ids.empB],
    );
    setClock(at(60));
    const res = await agents.employee.get('/api/attendance/me?month=2026-10').expect(200);
    expect(res.body.records.map((r: { workDate: string }) => r.workDate)).toEqual([DAY, '2026-10-13']);
    expect(res.body.summary).toEqual({ daysPresent: 2, totalMinutes: 480 + 60, incomplete: 0 });
    await agents.employee.get('/api/attendance/me?month=2026-13').expect(400);
  });

  it('employee A cannot read employee B\'s attendance (404, same as a missing employee)', async () => {
    await agents.employee.get(`/api/attendance/${ids.empA}/${DAY}`).expect(200);
    const other = await agents.employee.get(`/api/attendance/${ids.empB}/${DAY}`).expect(404);
    const missing = await agents.employee.get(`/api/attendance/00000000-0000-4000-a000-00000000dead/${DAY}`).expect(404);
    expect(other.body).toEqual(missing.body);
  });
});

// ---------------------------------------------------------------------------
// Admin / manager roster and manual correction
// ---------------------------------------------------------------------------
describe('roster and corrections', () => {
  async function approvedLeave(employeeId: string, start: string, end: string, dayType: 'full' | 'half' = 'full') {
    await query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, day_type, half_day_period, total_days, reason, status, reviewed_by, reviewed_at)
       VALUES ($1, 'sick', $2, $3, $4, $5, 1, 'Private reason (fake)', 'approved', $6, now())`,
      [employeeId, start, end, dayType, dayType === 'half' ? 'second' : null, ids.admin],
    );
  }

  it('GET / gives every active employee a status for the selected date with correct counts', async () => {
    await approvedLeave(ids.managerEmp, DAY, DAY);
    setClock(at(30));
    const res = await agents.manager.get(`/api/attendance?date=${DAY}`).expect(200);
    const byName = Object.fromEntries(res.body.employees.map((e: { fullName: string; status: string }) => [e.fullName, e.status]));
    // A and B were punched in by their logins; the inactive employee is not listed.
    expect(byName).toEqual({ 'Avery A': 'present', 'Blake B': 'present', 'Morgan Manager': 'on_leave' });
    expect(res.body.summary).toEqual({ total: 3, present: 2, absent: 0, onApprovedLeave: 1, halfDayLeave: 0, currentlyWorking: 2, incomplete: 0 });
    expect(JSON.stringify(res.body)).not.toContain('Private reason');

    // Another date: nobody punched in, a half-day leave is still "absent" (not on leave).
    await approvedLeave(ids.empA, '2026-10-13', '2026-10-13', 'half');
    const yesterday = await agents.admin.get('/api/attendance?date=2026-10-13').expect(200);
    expect(yesterday.body.summary).toMatchObject({ total: 3, present: 0, absent: 3, onApprovedLeave: 0, halfDayLeave: 1, currentlyWorking: 0 });
  });

  it('defaults to today (IST) and validates the date', async () => {
    setClock(new Date('2026-10-14T19:00:00Z')); // already the 15th in IST
    expect((await agents.admin.get('/api/attendance').expect(200)).body.date).toBe('2026-10-15');
    await agents.admin.get('/api/attendance?date=2026-02-30x').expect(400);
  });

  it('PUT corrects a record, keeps before/after in the audit log and returns the history', async () => {
    setClock(at(10 * 60));
    const res = await agents.manager
      .put(`/api/attendance/${ids.empA}/${DAY}`)
      .send({ punchIn: `${DAY}T09:15:00+05:30`, punchOut: `${DAY}T18:00:00+05:30`, note: 'Forgot to punch out (fake)' })
      .expect(200);
    expect(res.body.record).toMatchObject({ punchIn: '2026-10-14T03:45:00.000Z', punchOut: '2026-10-14T12:30:00.000Z', corrected: true, workedMinutes: 525, source: 'login' });
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0]).toMatchObject({ actorName: 'Morgan Manager', before: { punchIn: T0.toISOString(), punchOut: null } });

    const [row] = await query(`SELECT actor_user_id, metadata FROM audit_logs WHERE action = 'attendance.corrected'`);
    expect(row.metadata).toMatchObject({
      employeeId: ids.empA,
      workDate: DAY,
      created: false,
      before: { punchIn: T0.toISOString(), punchOut: null, note: null },
      after: { punchIn: '2026-10-14T03:45:00.000Z', punchOut: '2026-10-14T12:30:00.000Z', note: 'Forgot to punch out (fake)' },
    });

    // The employee sees the correction on their own record.
    const mine = await agents.employee.get(`/api/attendance/${ids.empA}/${DAY}`).expect(200);
    expect(mine.body.record.corrected).toBe(true);
  });

  it('PUT creates a manual record for someone with none', async () => {
    setClock(at(10 * 60));
    await agents.admin
      .put(`/api/attendance/${ids.managerEmp}/${DAY}`)
      .send({ punchIn: `${DAY}T10:00:00+05:30`, punchOut: null, note: 'Was in the office, laptop broken (fake)' })
      .expect(200);
    const [row] = await query('SELECT source, created_by, updated_by FROM attendance_records WHERE employee_id = $1', [ids.managerEmp]);
    expect(row).toEqual({ source: 'manual', created_by: ids.admin, updated_by: ids.admin });
  });

  it('PUT validates: reason required, punch out after punch in, on the selected date, not in the future', async () => {
    setClock(at(10 * 60)); // 19:30 IST
    const put = (body: object) => agents.admin.put(`/api/attendance/${ids.empA}/${DAY}`).send(body);
    const base = { punchIn: `${DAY}T09:00:00+05:30`, punchOut: `${DAY}T17:00:00+05:30`, note: 'Fix (fake)' };
    const field = async (body: object) => {
      const res = await put(body).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      return res.body.details[0].path;
    };
    expect(await field({ ...base, note: '  ' })).toBe('note');
    expect(await field({ ...base, punchOut: `${DAY}T08:00:00+05:30` })).toBe('punchOut');
    expect(await field({ ...base, punchOut: `${DAY}T09:00:00+05:30` })).toBe('punchOut');
    expect(await field({ ...base, punchIn: '2026-10-13T09:00:00+05:30' })).toBe('punchIn');
    expect(await field({ ...base, punchOut: `${DAY}T23:00:00+05:30` })).toBe('punchOut');
    expect(await field({ ...base, punchIn: 'yesterday' })).toBe('punchIn');
    await agents.admin.put(`/api/attendance/${ids.empA}/not-a-date`).send(base).expect(404);
    await agents.admin.put('/api/attendance/00000000-0000-4000-a000-00000000dead/2026-10-14').send(base).expect(404);
    expect(await query(`SELECT 1 FROM audit_logs WHERE action = 'attendance.corrected'`)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Presence, staff availability and the client team view
// ---------------------------------------------------------------------------
describe('presence and availability', () => {
  const statusOf = async (agent: request.Agent, employeeId: string) => {
    const res = await agent.get('/api/team/availability').expect(200);
    return res.body.availability.find((a: { employeeId: string }) => a.employeeId === employeeId)?.status;
  };

  it('heartbeat makes a punched-in employee online; 5 minutes of silence makes them available', async () => {
    expect(await statusOf(agents.manager, ids.empA)).toBe('available');
    await agents.employee.post('/api/presence/heartbeat').expect(200);
    expect(await statusOf(agents.manager, ids.empA)).toBe('online');
    setClock(at(5));
    expect(await statusOf(agents.employeeB, ids.empA)).toBe('online');
    setClock(new Date(at(5).getTime() + 1));
    expect(await statusOf(agents.admin, ids.empA)).toBe('available');
    expect(await statusOf(agents.admin, ids.managerEmp)).toBe('not_in_today');
  });

  it('heartbeat writes at most once per 30 seconds and never touches employees.updated_at', async () => {
    const seen = async () => (await query('SELECT last_seen_at, updated_at FROM employees WHERE id = $1', [ids.empA]))[0];
    const before = await seen();
    await agents.employee.post('/api/presence/heartbeat').expect(200);
    expect((await seen()).last_seen_at.toISOString()).toBe(T0.toISOString());
    setClock(at(0.25)); // +15 s: not written
    await agents.employee.post('/api/presence/heartbeat').expect(200);
    expect((await seen()).last_seen_at.toISOString()).toBe(T0.toISOString());
    setClock(at(0.5)); // +30 s: written
    await agents.employee.post('/api/presence/heartbeat').expect(200);
    expect((await seen()).last_seen_at.toISOString()).toBe(at(0.5).toISOString());
    expect((await seen()).updated_at).toEqual(before.updated_at);
  });

  it('team availability is status only', async () => {
    const res = await agents.employee.get('/api/team/availability').expect(200);
    for (const entry of res.body.availability) expect(Object.keys(entry).sort()).toEqual(['employeeId', 'status']);
    expect(res.body.availability.map((a: { employeeId: string }) => a.employeeId)).not.toContain(ids.inactiveEmp);
  });

  describe('client portal team', () => {
    beforeEach(async () => {
      await member(ids.acmeProject, ids.empA);
      await member(ids.acmeProject, ids.managerEmp);
      await member(ids.acmeProject, ids.inactiveEmp);
      await member(await project('Acme Archived', ids.admin, ids.acme, 'archived'), ids.empB);
      await member(await project('Globex App', ids.admin, ids.globex), ids.empB);
      await member(await project('Internal', ids.admin, null), ids.empA);
    });

    it('lists only this company\'s non-archived project members, with exactly the allowed fields', async () => {
      await agents.employee.post('/api/presence/heartbeat').expect(200);
      const res = await agents.client.get('/api/portal/team').expect(200);
      expect(res.body.team).toEqual([
        { name: 'Avery A', designation: 'Engineer', avatarUrl: null, status: 'online', projects: ['Acme Site'] },
        { name: 'Morgan Manager', designation: 'Engineer', avatarUrl: null, status: 'not_in_today', projects: ['Acme Site'] },
      ]);
      for (const person of res.body.team) expect(Object.keys(person).sort()).toEqual(['avatarUrl', 'designation', 'name', 'projects', 'status']);
      const raw = JSON.stringify(res.body);
      for (const leak of [ids.empA, ids.managerEmp, 'punch', 'lastSeen', 'email', 'Internal', 'Blake', 'Globex', 'Archived']) {
        expect(raw).not.toContain(leak);
      }
    });

    it('another company never sees this company\'s people', async () => {
      const res = await agents.clientB.get('/api/portal/team').expect(200);
      expect(res.body.team.map((p: { name: string }) => p.name)).toEqual(['Blake B']);
      expect(res.body.team[0].projects).toEqual(['Globex App']);
    });

    it('approved full-day leave shows as on_leave to the client, half-day leave does not', async () => {
      await query(
        `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, day_type, half_day_period, total_days, reason, status, reviewed_by, reviewed_at)
         VALUES ($1, 'casual', $3, $3, 'full', NULL, 1, 'Fake', 'approved', $4, now()),
                ($2, 'casual', $3, $3, 'half', 'first', 0.5, 'Fake', 'approved', $4, now())`,
        [ids.managerEmp, ids.empA, DAY, ids.admin],
      );
      const res = await agents.client.get('/api/portal/team').expect(200);
      expect(res.body.team.map((p: { status: string }) => p.status)).toEqual(['available', 'on_leave']);
    });
  });
});
