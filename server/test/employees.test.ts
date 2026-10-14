import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { hashPassword } from '../src/services/passwords.js';

const PASSWORD = 'correct-horse-battery';

type Role = 'admin' | 'manager' | 'employee';

async function createEmployee(overrides: Record<string, unknown> = {}): Promise<string> {
  const values = {
    code: `EMP-${String(Math.floor(Math.random() * 900) + 100)}`,
    fullName: 'Test Person',
    workEmail: `person${Math.random().toString(36).slice(2, 8)}@example.test`,
    phone: '+00 11111 11111',
    status: 'active',
    salary: '50000.00',
    ...overrides,
  };
  const [row] = await query<{ id: string }>(
    `INSERT INTO employees (employee_code, full_name, work_email, phone, department, designation, joining_date,
                            status, monthly_salary, payment_method, notes)
     VALUES ($1, $2, $3, $4, 'Engineering', 'Engineer', '2025-01-01', $5, $6, 'Bank Transfer', 'internal note')
     RETURNING id`,
    [values.code, values.fullName, values.workEmail, values.phone, values.status, values.salary],
  );
  return row.id;
}

async function createUser(email: string, role: Role, employeeId: string | null = null): Promise<string> {
  const [row] = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, employee_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, await hashPassword(PASSWORD), role, employeeId],
  );
  return row.id;
}

async function signIn(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return agent;
}

const VALID_EMPLOYEE = {
  fullName: 'New Hire',
  workEmail: 'New.Hire@Example.test',
  phone: '+00 22222 22222',
  department: 'Design',
  designation: 'Designer',
  joiningDate: '2026-10-01',
  monthlySalary: 65000.5,
  paymentMethod: 'UPI',
};

// Seeded fresh for every test: an employee record for each role plus one unlinked employee.
let ids: { adminEmp: string; managerEmp: string; staffEmp: string; otherEmp: string; staffUser: string };
let agents: { admin: request.Agent; manager: request.Agent; employee: request.Agent; anonymous: request.Agent };

beforeEach(async () => {
  await query('TRUNCATE audit_logs, auth_tokens, sessions, users, employees CASCADE');
  const adminEmp = await createEmployee({ code: 'EMP-001', fullName: 'Ada Admin', workEmail: 'ada@example.test' });
  const managerEmp = await createEmployee({ code: 'EMP-002', fullName: 'Max Manager', workEmail: 'max@example.test' });
  const staffEmp = await createEmployee({ code: 'EMP-003', fullName: 'Sam Staff', workEmail: 'sam@example.test' });
  const otherEmp = await createEmployee({ code: 'EMP-004', fullName: 'Olive Other', workEmail: 'olive@example.test' });
  await createUser('admin@example.test', 'admin', adminEmp);
  await createUser('manager@example.test', 'manager', managerEmp);
  const staffUser = await createUser('staff@example.test', 'employee', staffEmp);
  ids = { adminEmp, managerEmp, staffEmp, otherEmp, staffUser };
  agents = {
    admin: await signIn('admin@example.test'),
    manager: await signIn('manager@example.test'),
    employee: await signIn('staff@example.test'),
    anonymous: request.agent(app),
  };
});

afterAll(async () => {
  await pool.end();
});

describe('role matrix', () => {
  // [method, path(ids), body] -> expected status per role
  const routes: [string, (i: typeof ids) => string, unknown, Record<keyof typeof agents, number>][] = [
    ['get', () => '/api/employees', undefined, { admin: 200, manager: 200, employee: 403, anonymous: 401 }],
    ['get', i => `/api/employees/${i.otherEmp}`, undefined, { admin: 200, manager: 200, employee: 403, anonymous: 401 }],
    ['get', () => '/api/employees/directory', undefined, { admin: 200, manager: 200, employee: 200, anonymous: 401 }],
    ['get', () => '/api/employees/me', undefined, { admin: 200, manager: 200, employee: 200, anonymous: 401 }],
    ['post', () => '/api/employees', VALID_EMPLOYEE, { admin: 201, manager: 403, employee: 403, anonymous: 401 }],
    ['patch', i => `/api/employees/${i.otherEmp}`, { designation: 'Lead' }, { admin: 200, manager: 403, employee: 403, anonymous: 401 }],
    ['post', i => `/api/employees/${i.otherEmp}/deactivate`, {}, { admin: 200, manager: 403, employee: 403, anonymous: 401 }],
    ['delete', i => `/api/employees/${i.otherEmp}`, undefined, { admin: 404, manager: 404, employee: 404, anonymous: 401 }],
  ];

  for (const [method, path, body, expected] of routes) {
    it(`${method.toUpperCase()} ${path({ adminEmp: ':id', managerEmp: ':id', staffEmp: ':id', otherEmp: ':id', staffUser: ':id' })}`, async () => {
      for (const role of Object.keys(expected) as (keyof typeof agents)[]) {
        // Fresh state per role for the mutating routes, so e.g. the second deactivate isn't "already inactive".
        await query(`UPDATE employees SET status = 'active' WHERE id = $1`, [ids.otherEmp]);
        await query(`DELETE FROM employees WHERE work_email = 'new.hire@example.test'`);
        const agent = agents[role] as unknown as Record<string, (url: string) => request.Test>;
        let req = agent[method](path(ids));
        if (body !== undefined) req = req.send(body as object);
        const res = await req;
        expect({ role, status: res.status }).toEqual({ role, status: expected[role] });
      }
    });
  }

  it('reactivate is admin only', async () => {
    await query(`UPDATE employees SET status = 'inactive' WHERE id = $1`, [ids.otherEmp]);
    await agents.manager.post(`/api/employees/${ids.otherEmp}/reactivate`).send({}).expect(403);
    await agents.employee.post(`/api/employees/${ids.otherEmp}/reactivate`).send({}).expect(403);
    await agents.anonymous.post(`/api/employees/${ids.otherEmp}/reactivate`).send({}).expect(401);
    await agents.admin.post(`/api/employees/${ids.otherEmp}/reactivate`).send({}).expect(200);
  });
});

describe('salary visibility', () => {
  it('returns salary fields to admins and omits them entirely for managers', async () => {
    const adminView = await agents.admin.get(`/api/employees/${ids.otherEmp}`).expect(200);
    expect(adminView.body.employee).toMatchObject({ monthlySalary: '50000.00', paymentMethod: 'Bank Transfer' });

    const managerView = await agents.manager.get(`/api/employees/${ids.otherEmp}`).expect(200);
    expect(managerView.body.employee).not.toHaveProperty('monthlySalary');
    expect(managerView.body.employee).not.toHaveProperty('paymentMethod');
    expect(managerView.body.employee.fullName).toBe('Olive Other');

    const managerList = await agents.manager.get('/api/employees').expect(200);
    expect(managerList.body.employees.length).toBe(4);
    for (const employee of managerList.body.employees) expect(employee).not.toHaveProperty('monthlySalary');
    expect(managerList.body.summary).not.toHaveProperty('monthlyPayroll');
    expect(JSON.stringify(managerList.body)).not.toContain('50000');

    const adminList = await agents.admin.get('/api/employees').expect(200);
    expect(adminList.body.summary).toMatchObject({ total: 4, active: 4, monthlyPayroll: '200000.00' });
  });

  it('never sends salary, phone or notes in the directory, and no salary in /me', async () => {
    const directory = await agents.employee.get('/api/employees/directory').expect(200);
    expect(directory.body.employees).toHaveLength(4);
    for (const employee of directory.body.employees) {
      expect(Object.keys(employee).sort()).toEqual(
        ['avatarUrl', 'department', 'designation', 'fullName', 'id', 'status', 'workEmail'].sort(),
      );
    }

    const me = await agents.employee.get('/api/employees/me').expect(200);
    expect(me.body.employee).toMatchObject({ id: ids.staffEmp, fullName: 'Sam Staff', phone: '+00 11111 11111' });
    expect(me.body.employee).not.toHaveProperty('monthlySalary');
    expect(me.body.employee).not.toHaveProperty('paymentMethod');
    expect(me.body.employee).not.toHaveProperty('notes');
  });

  it('lists login status and supports search, status filter and pagination', async () => {
    const all = await agents.admin.get('/api/employees').expect(200);
    const sam = all.body.employees.find((e: { id: string }) => e.id === ids.staffEmp);
    expect(sam.login).toMatchObject({ userId: ids.staffUser, status: 'active', mustChangePassword: false });
    expect(sam.login.lastLoginAt).not.toBeNull();
    expect(all.body.employees.find((e: { id: string }) => e.id === ids.otherEmp).login).toBeNull();

    const search = await agents.admin.get('/api/employees').query({ search: 'olive' }).expect(200);
    expect(search.body.employees.map((e: { fullName: string }) => e.fullName)).toEqual(['Olive Other']);
    expect(search.body.total).toBe(1);

    await query(`UPDATE employees SET status = 'on_leave' WHERE id = $1`, [ids.otherEmp]);
    const onLeave = await agents.admin.get('/api/employees').query({ status: 'on_leave' }).expect(200);
    expect(onLeave.body.employees.map((e: { id: string }) => e.id)).toEqual([ids.otherEmp]);

    const page = await agents.admin.get('/api/employees').query({ limit: 2, offset: 2 }).expect(200);
    expect(page.body).toMatchObject({ total: 4, limit: 2, offset: 2 });
    expect(page.body.employees.map((e: { fullName: string }) => e.fullName)).toEqual(['Olive Other', 'Sam Staff']);

    await agents.admin.get('/api/employees').query({ limit: 0 }).expect(400);
    await agents.admin.get('/api/employees').query({ status: 'retired' }).expect(400);
  });
});

describe('create and edit', () => {
  it('assigns the next employee code, lower-cases the email and audits field names without values', async () => {
    const created = await agents.admin.post('/api/employees').send(VALID_EMPLOYEE).expect(201);
    expect(created.body.employee).toMatchObject({
      code: 'EMP-005',
      workEmail: 'new.hire@example.test',
      monthlySalary: '65000.50',
      status: 'active',
      login: null,
    });

    // A client-supplied code is not accepted as input: zod strips unknown keys, the server assigns.
    const second = await agents.admin
      .post('/api/employees')
      .send({ ...VALID_EMPLOYEE, workEmail: 'second@example.test', code: 'EMP-999' })
      .expect(201);
    expect(second.body.employee.code).toBe('EMP-006');

    const [log] = await query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_logs WHERE action = 'employee.created' AND entity_id = $1`,
      [created.body.employee.id],
    );
    expect(log.metadata.fields).toContain('monthlySalary');
    expect(JSON.stringify(log.metadata)).not.toContain('65000');
  });

  it('rejects a duplicate work email (case-insensitive) on create and on edit', async () => {
    const dupCreate = await agents.admin.post('/api/employees').send({ ...VALID_EMPLOYEE, workEmail: 'OLIVE@example.test' });
    expect(dupCreate.status).toBe(409);
    expect(dupCreate.body.code).toBe('EMAIL_TAKEN');

    const dupEdit = await agents.admin.patch(`/api/employees/${ids.otherEmp}`).send({ workEmail: 'sam@example.test' });
    expect(dupEdit.status).toBe(409);
    expect(dupEdit.body.code).toBe('EMAIL_TAKEN');
  });

  it('returns validation errors for bad input', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ ...VALID_EMPLOYEE, fullName: '  ' }, 'fullName'],
      [{ ...VALID_EMPLOYEE, workEmail: 'not-an-email' }, 'workEmail'],
      [{ ...VALID_EMPLOYEE, joiningDate: '01/10/2026' }, 'joiningDate'],
      [{ ...VALID_EMPLOYEE, monthlySalary: -5 }, 'monthlySalary'],
      [{ ...VALID_EMPLOYEE, monthlySalary: '12.345' }, 'monthlySalary'],
      [{ ...VALID_EMPLOYEE, status: 'inactive' }, 'status'],
      [{ ...VALID_EMPLOYEE, avatarUrl: 'javascript:alert(1)' }, 'avatarUrl'],
    ];
    for (const [body, field] of cases) {
      const res = await agents.admin.post('/api/employees').send(body);
      expect({ field, status: res.status, code: res.body.code }).toEqual({ field, status: 400, code: 'VALIDATION_ERROR' });
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(field);
    }
    await agents.admin.patch(`/api/employees/${ids.otherEmp}`).send({}).expect(400);
    await agents.admin.get('/api/employees/not-a-uuid').expect(404);
  });

  it('edits only the fields sent', async () => {
    const res = await agents.admin.patch(`/api/employees/${ids.otherEmp}`).send({ designation: 'Lead Engineer' }).expect(200);
    expect(res.body.employee).toMatchObject({
      designation: 'Lead Engineer',
      fullName: 'Olive Other',
      phone: '+00 11111 11111',
      notes: 'internal note',
      monthlySalary: '50000.00',
    });
  });

  it('lets staff edit only their own phone and avatar', async () => {
    const ok = await agents.employee
      .patch('/api/employees/me')
      .send({ phone: '+00 99999 99999', avatarUrl: '/avatars/avatar-1.jpg' })
      .expect(200);
    expect(ok.body.employee).toMatchObject({ phone: '+00 99999 99999', avatarUrl: '/avatars/avatar-1.jpg', designation: 'Engineer' });

    for (const forbidden of [{ designation: 'CEO' }, { monthlySalary: 999999 }, { phone: '1', status: 'inactive' }]) {
      const res = await agents.employee.patch('/api/employees/me').send(forbidden);
      expect(res.status).toBe(400);
    }
    const [row] = await query<{ designation: string; monthly_salary: string }>(
      'SELECT designation, monthly_salary FROM employees WHERE id = $1',
      [ids.staffEmp],
    );
    expect(row).toEqual({ designation: 'Engineer', monthly_salary: '50000.00' });

    // Someone else's record is not reachable through /me or /:id.
    await agents.employee.patch(`/api/employees/${ids.otherEmp}`).send({ phone: '1' }).expect(403);

    const unlinkedAdmin = await createUser('unlinked@example.test', 'admin');
    expect(unlinkedAdmin).toBeTruthy();
    const unlinked = await signIn('unlinked@example.test');
    const res = await unlinked.get('/api/employees/me');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_LINKED');
  });
});

describe('deactivate and reactivate', () => {
  it('deactivating disables the linked login and ends its session', async () => {
    await agents.employee.get('/api/auth/me').expect(200);

    const res = await agents.admin.post(`/api/employees/${ids.staffEmp}/deactivate`).send({}).expect(200);
    expect(res.body.employee).toMatchObject({ status: 'inactive', login: { status: 'disabled' } });

    await agents.employee.get('/api/auth/me').expect(401);
    await request(app).post('/api/auth/login').send({ email: 'staff@example.test', password: PASSWORD }).expect(401);

    const again = await agents.admin.post(`/api/employees/${ids.staffEmp}/deactivate`).send({});
    expect(again.status).toBe(409);

    // Inactive people drop out of the directory; status changes go through reactivate.
    const directory = await agents.admin.get('/api/employees/directory').expect(200);
    expect(directory.body.employees.map((e: { id: string }) => e.id)).not.toContain(ids.staffEmp);
    await agents.admin.patch(`/api/employees/${ids.staffEmp}`).send({ status: 'active' }).expect(400);

    const [log] = await query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_logs WHERE action = 'employee.deactivated' AND entity_id = $1`,
      [ids.staffEmp],
    );
    expect(log.metadata).toMatchObject({ loginDisabled: true, userId: ids.staffUser });
  });

  it('reactivates the employee but restores the login only when asked', async () => {
    await agents.admin.post(`/api/employees/${ids.staffEmp}/deactivate`).send({}).expect(200);

    const plain = await agents.admin.post(`/api/employees/${ids.staffEmp}/reactivate`).send({}).expect(200);
    expect(plain.body.employee).toMatchObject({ status: 'active', login: { status: 'disabled' } });
    await request(app).post('/api/auth/login').send({ email: 'staff@example.test', password: PASSWORD }).expect(401);

    await agents.admin.post(`/api/employees/${ids.staffEmp}/deactivate`).send({}).expect(200);
    const restored = await agents.admin
      .post(`/api/employees/${ids.staffEmp}/reactivate`)
      .send({ restoreLogin: true })
      .expect(200);
    expect(restored.body.employee).toMatchObject({ status: 'active', login: { status: 'active' } });
    await signIn('staff@example.test');

    await agents.admin.post(`/api/employees/${ids.staffEmp}/reactivate`).send({}).expect(409);
    await agents.admin.post(`/api/employees/${ids.staffEmp}/reactivate`).send({ restoreLogin: 'yes' }).expect(400);
  });

  it("refuses to deactivate the admin's own record or the last active admin's", async () => {
    const self = await agents.admin.post(`/api/employees/${ids.adminEmp}/deactivate`).send({});
    expect(self.status).toBe(409); // the only admin: last-admin wins over self
    expect(self.body.code).toBe('LAST_ADMIN');

    // With a second admin, deactivating your own record is still refused...
    const secondEmp = await createEmployee({ code: 'EMP-010', workEmail: 'second@example.test' });
    await createUser('second-admin@example.test', 'admin', secondEmp);
    const ownRecord = await agents.admin.post(`/api/employees/${ids.adminEmp}/deactivate`).send({});
    expect(ownRecord.body.code).toBe('CANNOT_MODIFY_SELF');

    // ...but the other admin's record can be deactivated (and their login goes with it).
    await agents.admin.post(`/api/employees/${secondEmp}/deactivate`).send({}).expect(200);
    const [row] = await query<{ status: string }>(`SELECT status FROM users WHERE email = 'second-admin@example.test'`);
    expect(row.status).toBe('disabled');
  });
});
