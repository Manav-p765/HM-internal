import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { testOutbox } from '../src/services/mail.js';
import { hashPassword } from '../src/services/passwords.js';

const PASSWORD = 'correct-horse-battery';

async function createCompany(name: string, status: 'active' | 'inactive' = 'active'): Promise<string> {
  const [row] = await query<{ id: string }>(
    `INSERT INTO clients (company_name, contact_name, contact_email, address, gstin, notes, status)
     VALUES ($1, 'Pat Contact', 'pat@example.test', '1 Fake Street', '00AAAAA0000A0Z0', 'internal: slow payer', $2)
     RETURNING id`,
    [name, status],
  );
  return row.id;
}

async function createUser(
  email: string,
  role: 'admin' | 'manager' | 'employee' | 'client',
  clientId: string | null = null,
): Promise<string> {
  const [row] = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, client_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, await hashPassword(PASSWORD), role, clientId],
  );
  return row.id;
}

async function signIn(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return agent;
}

const tempPasswordFor = (email: string) =>
  testOutbox
    .filter(m => m.to === email)
    .at(-1)!
    .text.match(/Temporary password: (\S+)/)![1];

let companyA: string;
let companyB: string;
let agents: Record<'admin' | 'manager' | 'employee' | 'clientA' | 'clientB' | 'anonymous', request.Agent>;

beforeEach(async () => {
  await query('TRUNCATE audit_logs, auth_tokens, sessions, users, employees, clients CASCADE');
  testOutbox.length = 0;
  companyA = await createCompany('Alpha Fake Ltd');
  companyB = await createCompany('Beta Fake LLP');
  await createUser('admin@example.test', 'admin');
  await createUser('manager@example.test', 'manager');
  await createUser('employee@example.test', 'employee');
  await createUser('a1@example.test', 'client', companyA);
  await createUser('b1@example.test', 'client', companyB);
  agents = {
    admin: await signIn('admin@example.test'),
    manager: await signIn('manager@example.test'),
    employee: await signIn('employee@example.test'),
    clientA: await signIn('a1@example.test'),
    clientB: await signIn('b1@example.test'),
    anonymous: request.agent(app),
  };
});

afterAll(async () => {
  await pool.end();
});

const NEW_CLIENT = { companyName: 'Gamma Fake Co', contactEmail: 'Ops@Gamma.Example.test', gstin: '29abcde1234f1z5' };

describe('client CRUD role matrix', () => {
  type Row = [string, string, (ids: { a: string }) => string, unknown, Record<keyof typeof agents, number>];
  const rows: Row[] = [
    ['list', 'get', () => '/api/clients', undefined, { admin: 200, manager: 200, employee: 403, clientA: 403, clientB: 403, anonymous: 401 }],
    ['get by id', 'get', i => `/api/clients/${i.a}`, undefined, { admin: 200, manager: 200, employee: 403, clientA: 403, clientB: 403, anonymous: 401 }],
    ['create', 'post', () => '/api/clients', NEW_CLIENT, { admin: 201, manager: 201, employee: 403, clientA: 403, clientB: 403, anonymous: 401 }],
    ['edit', 'patch', i => `/api/clients/${i.a}`, { contactName: 'New Contact' }, { admin: 200, manager: 200, employee: 403, clientA: 403, clientB: 403, anonymous: 401 }],
    ['deactivate', 'post', i => `/api/clients/${i.a}/deactivate`, {}, { admin: 200, manager: 403, employee: 403, clientA: 403, clientB: 403, anonymous: 401 }],
    ['own company', 'get', () => '/api/clients/me', undefined, { admin: 403, manager: 403, employee: 403, clientA: 200, clientB: 200, anonymous: 401 }],
  ];

  for (const [name, method, path, body, expected] of rows) {
    it(name, async () => {
      // Order: the client agents first, so 'deactivate' by admin (which signs them out) runs last.
      const order: (keyof typeof agents)[] = ['clientA', 'clientB', 'employee', 'anonymous', 'manager', 'admin'];
      for (const role of order) {
        const agent = agents[role] as unknown as Record<string, (url: string) => request.Test>;
        let req = agent[method](path({ a: companyA }));
        if (body !== undefined) req = req.send(body as object);
        const res = await req;
        expect({ role, status: res.status }).toEqual({ role, status: expected[role] });
      }
    });
  }

  it('reactivate is admin only', async () => {
    await query(`UPDATE clients SET status = 'inactive' WHERE id = $1`, [companyB]);
    await agents.manager.post(`/api/clients/${companyB}/reactivate`).send({}).expect(403);
    await agents.employee.post(`/api/clients/${companyB}/reactivate`).send({}).expect(403);
    await agents.clientA.post(`/api/clients/${companyB}/reactivate`).send({}).expect(403);
    await agents.anonymous.post(`/api/clients/${companyB}/reactivate`).send({}).expect(401);
    await agents.admin.post(`/api/clients/${companyB}/reactivate`).send({}).expect(200);
  });

  it('creates, lists with portal counts, edits and audits without notes', async () => {
    const created = await agents.manager.post('/api/clients').send({ ...NEW_CLIENT, notes: 'secret-ish internal note' }).expect(201);
    expect(created.body.client).toMatchObject({
      companyName: 'Gamma Fake Co',
      contactEmail: 'ops@gamma.example.test',
      gstin: '29ABCDE1234F1Z5',
      status: 'active',
      portalUsers: 0,
      users: [],
    });

    const list = await agents.admin.get('/api/clients').query({ search: 'alpha' }).expect(200);
    expect(list.body.clients.map((c: { companyName: string }) => c.companyName)).toEqual(['Alpha Fake Ltd']);
    expect(list.body.clients[0]).toMatchObject({ portalUsers: 1, activePortalUsers: 1 });

    const detail = await agents.manager.get(`/api/clients/${companyA}`).expect(200);
    expect(detail.body.client.users.map((u: { email: string }) => u.email)).toEqual(['a1@example.test']);
    expect(JSON.stringify(detail.body)).not.toContain('password');

    await agents.admin.patch(`/api/clients/${companyA}`).send({ contactPhone: '+00 1' }).expect(200);
    const logs = await query<{ action: string; metadata: unknown }>(`SELECT action, metadata FROM audit_logs WHERE entity_type = 'client' ORDER BY created_at`);
    expect(logs.map(l => l.action)).toEqual(['client.created', 'client.updated']);
    expect(JSON.stringify(logs)).not.toContain('secret-ish');
  });

  it('validates input', async () => {
    for (const [body, field] of [
      [{ companyName: ' ' }, 'companyName'],
      [{ companyName: 'X', contactEmail: 'nope' }, 'contactEmail'],
      [{ companyName: 'X', gstin: 'short' }, 'gstin'],
    ] as const) {
      const res = await agents.admin.post('/api/clients').send(body);
      expect(res.status).toBe(400);
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(field);
    }
    await agents.admin.patch(`/api/clients/${companyA}`).send({}).expect(400);
    await agents.admin.get('/api/clients/not-a-uuid').expect(404);
    // status can't be changed through PATCH (deactivate/reactivate only): unknown keys are ignored
    await agents.admin.patch(`/api/clients/${companyA}`).send({ status: 'inactive', contactName: 'x' }).expect(200);
    const [row] = await query<{ status: string }>('SELECT status FROM clients WHERE id = $1', [companyA]);
    expect(row.status).toBe('active');
  });
});

describe('isolation between companies', () => {
  it("a client sees only its own company, without notes or GSTIN, and can't reach another by id", async () => {
    const a = await agents.clientA.get('/api/clients/me').expect(200);
    expect(a.body.client).toMatchObject({ id: companyA, companyName: 'Alpha Fake Ltd', address: '1 Fake Street' });
    expect(a.body.client).not.toHaveProperty('notes');
    expect(a.body.client).not.toHaveProperty('gstin');

    const b = await agents.clientB.get('/api/clients/me').expect(200);
    expect(b.body.client.id).toBe(companyB);
    expect(JSON.stringify(b.body)).not.toContain('Alpha');

    // Guessing ids: every staff route refuses the client before looking anything up.
    await agents.clientB.get(`/api/clients/${companyA}`).expect(403);
    await agents.clientB.patch(`/api/clients/${companyA}`).send({ companyName: 'pwned' }).expect(403);
    await agents.clientB.get('/api/clients').expect(403);
    await agents.clientB.get('/api/clients/me').query({ id: companyA }).expect(200).expect(r => expect(r.body.client.id).toBe(companyB));
    const [row] = await query<{ company_name: string }>('SELECT company_name FROM clients WHERE id = $1', [companyA]);
    expect(row.company_name).toBe('Alpha Fake Ltd');
  });

  it('the session says which company a client belongs to', async () => {
    const me = await agents.clientA.get('/api/auth/me').expect(200);
    expect(me.body.user).toMatchObject({ role: 'client', clientId: companyA, clientName: 'Alpha Fake Ltd', employeeId: null });
  });
});

describe('creating portal users', () => {
  it('requires clientId for client users and rejects it for every other role', async () => {
    const missing = await agents.admin.post('/api/users').send({ email: 'c@example.test', role: 'client' });
    expect(missing.status).toBe(400);
    expect(missing.body.details.map((d: { path: string }) => d.path)).toContain('clientId');

    for (const role of ['admin', 'manager', 'employee']) {
      const res = await agents.admin.post('/api/users').send({ email: `${role}2@example.test`, role, clientId: companyA });
      expect({ role, status: res.status }).toEqual({ role, status: 400 });
    }

    const created = await agents.admin.post('/api/users').send({ email: 'a2@example.test', role: 'client', clientId: companyA }).expect(201);
    expect(created.body.user).toMatchObject({ role: 'client', clientId: companyA, client: { companyName: 'Alpha Fake Ltd' }, mustChangePassword: true });
    expect(JSON.stringify(created.body)).not.toContain(tempPasswordFor('a2@example.test'));

    // DB constraint backs this up even if a route forgets.
    await expect(query(`INSERT INTO users (email, role) VALUES ('raw@example.test', 'client')`)).rejects.toThrow(/users_client_link_check/);
  });

  it('refuses client users for an inactive company (create and enable)', async () => {
    await agents.admin.post(`/api/clients/${companyB}/deactivate`).send({}).expect(200);
    const res = await agents.admin.post('/api/users').send({ email: 'b2@example.test', role: 'client', clientId: companyB });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CLIENT_INACTIVE');

    const [b1] = await query<{ id: string }>(`SELECT id FROM users WHERE email = 'b1@example.test'`);
    const enable = await agents.admin.patch(`/api/users/${b1.id}`).send({ status: 'active' });
    expect(enable.body.code).toBe('CLIENT_INACTIVE');
  });

  it('lets managers create and manage client users only', async () => {
    for (const role of ['admin', 'manager', 'employee']) {
      const res = await agents.manager.post('/api/users').send({ email: `m-${role}@example.test`, role });
      expect({ role, status: res.status }).toEqual({ role, status: 403 });
    }
    const created = await agents.manager.post('/api/users').send({ email: 'a3@example.test', role: 'client', clientId: companyA }).expect(201);
    const clientUserId = created.body.user.id;

    // Manager may disable/enable and resend for client users...
    await agents.manager.patch(`/api/users/${clientUserId}`).send({ status: 'disabled' }).expect(200);
    await agents.manager.patch(`/api/users/${clientUserId}`).send({ status: 'active' }).expect(200);
    await agents.manager.post(`/api/users/${clientUserId}/resend-credentials`).send({}).expect(200);
    // ...but not change roles, and not touch staff accounts.
    await agents.manager.patch(`/api/users/${clientUserId}`).send({ role: 'admin' }).expect(403);
    const [emp] = await query<{ id: string }>(`SELECT id FROM users WHERE email = 'employee@example.test'`);
    await agents.manager.patch(`/api/users/${emp.id}`).send({ status: 'disabled' }).expect(403);
    await agents.manager.post(`/api/users/${emp.id}/resend-credentials`).send({}).expect(403);
    await agents.manager.get('/api/users').expect(403);

    // Admins can't turn a client user into staff either.
    const res = await agents.admin.patch(`/api/users/${clientUserId}`).send({ role: 'employee' });
    expect(res.body.code).toBe('ROLE_CHANGE_NOT_ALLOWED');
  });

  it('a new portal user must change the temporary password first', async () => {
    await agents.admin.post('/api/users').send({ email: 'a4@example.test', role: 'client', clientId: companyA }).expect(201);
    const temp = tempPasswordFor('a4@example.test');
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'a4@example.test', password: temp }).expect(200);
    const blocked = await agent.get('/api/clients/me');
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await agent.post('/api/auth/change-password').send({ currentPassword: temp, newPassword: 'portal-password-1' }).expect(200);
    await agent.get('/api/clients/me').expect(200);
  });
});

describe('deactivating and reactivating a company', () => {
  it('disables every portal login and ends their sessions immediately', async () => {
    await createUser('a2@example.test', 'client', companyA);
    const second = await signIn('a2@example.test');

    const res = await agents.admin.post(`/api/clients/${companyA}/deactivate`).send({}).expect(200);
    expect(res.body.client).toMatchObject({ status: 'inactive', activePortalUsers: 0 });

    await agents.clientA.get('/api/auth/me').expect(401);
    await second.get('/api/clients/me').expect(401);
    for (const email of ['a1@example.test', 'a2@example.test']) {
      await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(401);
    }
    // The other company is untouched.
    await agents.clientB.get('/api/clients/me').expect(200);

    const [log] = await query<{ metadata: { loginsDisabled: number } }>(`SELECT metadata FROM audit_logs WHERE action = 'client.deactivated'`);
    expect(log.metadata.loginsDisabled).toBe(2);
    await agents.admin.post(`/api/clients/${companyA}/deactivate`).send({}).expect(409);
  });

  it('even an active user row is refused while the company is inactive', async () => {
    await query(`UPDATE clients SET status = 'inactive' WHERE id = $1`, [companyA]); // user row left active
    await agents.clientA.get('/api/auth/me').expect(401);
    await request(app).post('/api/auth/login').send({ email: 'a1@example.test', password: PASSWORD }).expect(401);
  });

  it('reactivates without restoring logins unless asked', async () => {
    await agents.admin.post(`/api/clients/${companyA}/deactivate`).send({}).expect(200);
    const plain = await agents.admin.post(`/api/clients/${companyA}/reactivate`).send({}).expect(200);
    expect(plain.body.client).toMatchObject({ status: 'active', activePortalUsers: 0 });
    await request(app).post('/api/auth/login').send({ email: 'a1@example.test', password: PASSWORD }).expect(401);

    const [a1] = await query<{ id: string }>(`SELECT id FROM users WHERE email = 'a1@example.test'`);
    await agents.admin.patch(`/api/users/${a1.id}`).send({ status: 'active' }).expect(200);
    await agents.admin.post(`/api/clients/${companyA}/deactivate`).send({}).expect(200);
    const restored = await agents.admin.post(`/api/clients/${companyA}/reactivate`).send({ restoreLogins: true }).expect(200);
    expect(restored.body.client).toMatchObject({ status: 'active', activePortalUsers: 1 });
    await signIn('a1@example.test');
    await agents.admin.post(`/api/clients/${companyA}/reactivate`).send({}).expect(409);
  });

  it('restoreLogins re-enables only the logins the deactivation disabled', async () => {
    const a2 = await createUser('a2@example.test', 'client', companyA);
    await agents.admin.patch(`/api/users/${a2}`).send({ status: 'disabled' }).expect(200); // individually, before

    await agents.admin.post(`/api/clients/${companyA}/deactivate`).send({}).expect(200);
    const res = await agents.admin.post(`/api/clients/${companyA}/reactivate`).send({ restoreLogins: true }).expect(200);
    expect(res.body.client).toMatchObject({ status: 'active', activePortalUsers: 1 });

    await signIn('a1@example.test');
    await request(app).post('/api/auth/login').send({ email: 'a2@example.test', password: PASSWORD }).expect(401);
    const flags = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM users WHERE disabled_by_client_deactivation`,
    );
    expect(flags[0].n).toBe(0);
    const [log] = await query<{ metadata: { loginsRestored: number } }>(
      `SELECT metadata FROM audit_logs WHERE action = 'client.reactivated'`,
    );
    expect(log.metadata.loginsRestored).toBe(1);
  });

  it('a login disabled individually while the company is inactive stays disabled', async () => {
    const [a1] = await query<{ id: string }>(`SELECT id FROM users WHERE email = 'a1@example.test'`);
    await agents.admin.post(`/api/clients/${companyA}/deactivate`).send({}).expect(200);
    await agents.admin.patch(`/api/users/${a1.id}`).send({ status: 'disabled' }).expect(200);
    await agents.admin.post(`/api/clients/${companyA}/reactivate`).send({ restoreLogins: true }).expect(200);
    await request(app).post('/api/auth/login').send({ email: 'a1@example.test', password: PASSWORD }).expect(401);
  });

  it('a plain reactivation clears the flag, so a later cycle does not restore the login', async () => {
    await agents.admin.post(`/api/clients/${companyA}/deactivate`).send({}).expect(200);
    await agents.admin.post(`/api/clients/${companyA}/reactivate`).send({}).expect(200);
    await agents.admin.post(`/api/clients/${companyA}/deactivate`).send({}).expect(200);
    await agents.admin.post(`/api/clients/${companyA}/reactivate`).send({ restoreLogins: true }).expect(200);
    await request(app).post('/api/auth/login').send({ email: 'a1@example.test', password: PASSWORD }).expect(401);
  });

  it('disabling a single client user kills that session', async () => {
    const [a1] = await query<{ id: string }>(`SELECT id FROM users WHERE email = 'a1@example.test'`);
    await agents.manager.patch(`/api/users/${a1.id}`).send({ status: 'disabled' }).expect(200);
    await agents.clientA.get('/api/auth/me').expect(401);
  });
});
