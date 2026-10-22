// Employee <-> login links (users.employee_id): automatic by email on employee create/update and on user
// create, never for client users, never overwriting a link; admin link/unlink by hand; the repair plan used
// by `npm run link-by-email`. A linked employee login is punched in at sign-in like any employee.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query, withTransaction } from '../src/db.js';
import { linkPlan } from '../src/services/accountLinks.js';
import { resetClock, setClock } from '../src/services/clock.js';
import { company, employee, resetAll, signIn, user } from './fixtures.js';

let admin: request.Agent;
let adminId: string;

const newEmployee = (workEmail: string, fullName = 'Ajay Fake') => ({
  fullName,
  workEmail,
  department: 'Engineering',
  designation: 'Developer',
  joiningDate: '2026-01-05',
  monthlySalary: '50000',
  shiftStart: '10:00',
  shiftEnd: '19:00',
});

async function linkOf(email: string): Promise<string | null> {
  const [row] = await query<{ employee_id: string | null }>('SELECT employee_id FROM users WHERE email = $1', [email]);
  return row.employee_id;
}

async function linkAudits() {
  return query<{ entity_id: string; metadata: Record<string, unknown> }>(
    `SELECT entity_id, metadata FROM audit_logs WHERE action = 'user.employee_linked' ORDER BY created_at`,
  );
}

beforeEach(async () => {
  setClock(new Date('2026-10-14T04:00:00Z')); // 09:30 IST, a weekday
  await resetAll();
  adminId = await user('admin@example.test', 'admin', { employeeId: await employee('Ada Admin') });
  admin = await signIn('admin@example.test');
});

afterEach(() => resetClock());

afterAll(async () => {
  await pool.end();
});

describe('automatic link by email', () => {
  it('creating an employee links the unlinked staff login with the same email (case-insensitive) and audits it', async () => {
    const userId = await user('ajay@example.test', 'employee');
    const res = await admin.post('/api/employees').send(newEmployee('Ajay@Example.TEST')).expect(201);
    expect(await linkOf('ajay@example.test')).toBe(res.body.employee.id);
    expect(res.body.employee.login).toMatchObject({ userId, status: 'active', invited: false });
    expect((await linkAudits()).map(a => [a.entity_id, a.metadata])).toEqual([[userId, { employeeId: res.body.employee.id, how: 'email' }]]);
  });

  it('a linked employee login is punched in at sign-in (the "No login, no attendance" bug)', async () => {
    await user('ajay@example.test', 'employee');
    const res = await admin.post('/api/employees').send(newEmployee('ajay@example.test')).expect(201);
    await signIn('ajay@example.test');
    expect(await query('SELECT 1 FROM attendance_records WHERE employee_id = $1', [res.body.employee.id])).toHaveLength(1);
  });

  it('changing an employee\'s work email links the login with the new email', async () => {
    const created = await admin.post('/api/employees').send(newEmployee('old@example.test')).expect(201);
    await user('new@example.test', 'manager');
    await admin.patch(`/api/employees/${created.body.employee.id}`).send({ workEmail: 'new@example.test' }).expect(200);
    expect(await linkOf('new@example.test')).toBe(created.body.employee.id);
  });

  it('never links a client user, and never moves a login already linked to someone else', async () => {
    // Fixture employees first: the API numbers new codes after them (max + 1).
    const first = await employee('First Person');
    await user('taken@example.test', 'employee', { employeeId: first });

    const acme = await company('Acme (Fake)');
    await user('client@example.test', 'client', { clientId: acme });
    await admin.post('/api/employees').send(newEmployee('client@example.test', 'Client Namesake')).expect(201);
    expect(await linkOf('client@example.test')).toBeNull();

    await admin.post('/api/employees').send(newEmployee('taken@example.test', 'Second Person')).expect(201);
    expect(await linkOf('taken@example.test')).toBe(first);
    expect(await linkAudits()).toHaveLength(0);
  });

  it('creating a staff user links the free employee with the same email; a client user never', async () => {
    const created = await admin.post('/api/employees').send(newEmployee('later@example.test')).expect(201);
    const res = await admin.post('/api/users').send({ email: 'later@example.test', role: 'employee' }).expect(201);
    expect(res.body.user.employee).toMatchObject({ id: created.body.employee.id });
    const [audit] = await linkAudits();
    expect(audit.metadata).toEqual({ employeeId: created.body.employee.id, how: 'email' });

    // An explicit employeeId still wins; a client user is never linked.
    const acme = await company('Acme (Fake)');
    await admin.post('/api/employees').send(newEmployee('portal@example.test', 'Portal Namesake')).expect(201);
    const client = await admin.post('/api/users').send({ email: 'portal@example.test', role: 'client', clientId: acme }).expect(201);
    expect(client.body.user.employee).toBeNull();
  });
});

describe('PUT/DELETE /api/users/:id/employee (admin)', () => {
  it('role matrix: admin only', async () => {
    const target = await user('t@example.test', 'employee');
    const emp = await employee('Tee');
    await user('manager@example.test', 'manager');
    await user('staff@example.test', 'employee', { employeeId: await employee('Sam Staff') });
    const acme = await company('Acme (Fake)');
    await user('client@example.test', 'client', { clientId: acme });
    for (const email of ['manager@example.test', 'staff@example.test', 'client@example.test']) {
      const agent = await signIn(email);
      await agent.put(`/api/users/${target}/employee`).send({ employeeId: emp }).expect(403);
      await agent.delete(`/api/users/${target}/employee`).expect(403);
    }
    await request(app).put(`/api/users/${target}/employee`).send({ employeeId: emp }).expect(401);
    await request(app).delete(`/api/users/${target}/employee`).expect(401);
  });

  it('links, is idempotent, unlinks, and audits each change', async () => {
    const target = await user('t@example.test', 'employee');
    const emp = await employee('Tee');
    const linked = await admin.put(`/api/users/${target}/employee`).send({ employeeId: emp }).expect(200);
    expect(linked.body.user.employee).toMatchObject({ id: emp });
    await admin.put(`/api/users/${target}/employee`).send({ employeeId: emp }).expect(200); // no-op
    const unlinked = await admin.delete(`/api/users/${target}/employee`).expect(200);
    expect(unlinked.body.user.employee).toBeNull();
    expect((await admin.delete(`/api/users/${target}/employee`).expect(409)).body.code).toBe('NOT_LINKED');
    const rows = await query<{ action: string; metadata: Record<string, unknown> }>(
      `SELECT action, metadata FROM audit_logs WHERE action LIKE 'user.employee_%' ORDER BY created_at`,
    );
    expect(rows).toEqual([
      { action: 'user.employee_linked', metadata: { employeeId: emp, how: 'manual' } },
      { action: 'user.employee_unlinked', metadata: { employeeId: emp } },
    ]);
  });

  it('conflicts: employee already has a login (409), login linked elsewhere (409), inactive employee (409)', async () => {
    const empA = await employee('Has Login');
    await user('a@example.test', 'employee', { employeeId: empA });
    const target = await user('t@example.test', 'employee');
    expect((await admin.put(`/api/users/${target}/employee`).send({ employeeId: empA }).expect(409)).body.code).toBe('EMPLOYEE_LINKED');

    const empB = await employee('Other');
    const linkedTarget = await user('l@example.test', 'employee', { employeeId: await employee('Current') });
    expect((await admin.put(`/api/users/${linkedTarget}/employee`).send({ employeeId: empB }).expect(409)).body.code).toBe('USER_LINKED');

    const gone = await employee('Gone', 'inactive');
    expect((await admin.put(`/api/users/${target}/employee`).send({ employeeId: gone }).expect(409)).body.code).toBe('EMPLOYEE_INACTIVE');
  });

  it('refuses client users, the admin\'s own login, unknown users (404) and a missing employee (400)', async () => {
    const acme = await company('Acme (Fake)');
    const clientUser = await user('client@example.test', 'client', { clientId: acme });
    const emp = await employee('Free');
    expect((await admin.put(`/api/users/${clientUser}/employee`).send({ employeeId: emp }).expect(400)).body.code).toBe('CLIENT_USER');
    expect((await admin.delete(`/api/users/${adminId}/employee`).expect(400)).body.code).toBe('CANNOT_MODIFY_SELF');
    await admin.put('/api/users/00000000-0000-4000-a000-00000000dead/employee').send({ employeeId: emp }).expect(404);
    const target = await user('t@example.test', 'employee');
    await admin.put(`/api/users/${target}/employee`).send({}).expect(400);
    await admin.put(`/api/users/${target}/employee`).send({ employeeId: '00000000-0000-4000-a000-00000000dead' }).expect(400);
  });
});

describe('link-by-email plan', () => {
  it('lists every same-email pair that is not linked, with skip reasons; applying links only the free pairs', async () => {
    const free = await employee('Free Pair');
    await query(`UPDATE employees SET work_email = 'free@example.test' WHERE id = $1`, [free]);
    await user('free@example.test', 'employee');

    const gone = await employee('Gone Pair', 'inactive');
    await query(`UPDATE employees SET work_email = 'gone@example.test' WHERE id = $1`, [gone]);
    await user('gone@example.test', 'employee');

    const acme = await company('Acme (Fake)');
    const clientEmp = await employee('Client Namesake');
    await query(`UPDATE employees SET work_email = 'cl@example.test' WHERE id = $1`, [clientEmp]);
    await user('cl@example.test', 'client', { clientId: acme });

    const plan = await linkPlan(pool);
    expect(plan.map(p => [p.email, p.action, p.reason]).sort()).toEqual(
      [
        ['cl@example.test', 'skip', 'login is a client user'],
        ['free@example.test', 'link', null],
        ['gone@example.test', 'skip', 'employee is inactive'],
      ].sort(),
    );
    const { linkLoginByEmail } = await import('../src/services/accountLinks.js');
    for (const p of plan) await withTransaction(c => linkLoginByEmail(c, p.employeeId));
    expect(await linkOf('free@example.test')).toBe(free);
    expect(await linkOf('gone@example.test')).toBeNull();
    expect(await linkOf('cl@example.test')).toBeNull();
    expect((await linkPlan(pool)).map(p => p.email).sort()).toEqual(['cl@example.test', 'gone@example.test']);
  });
});
