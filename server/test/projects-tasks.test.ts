import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { comment, company, employee, member, project, resetAll, signIn, task, user } from './fixtures.js';

type Who = 'admin' | 'manager' | 'employee' | 'client' | 'anonymous';
let agents: Record<Who, request.Agent>;
let ids: {
  adminUser: string;
  managerUser: string;
  sam: string; // employee linked to the 'employee' login
  ola: string; // another employee
  gone: string; // inactive employee
  clientA: string;
  pA: string; // client A project, Sam is a member
  pInternal: string; // internal project, Sam is a member
  pOther: string; // project Sam is NOT on
  samTask: string;
  olaTask: string;
};

beforeEach(async () => {
  await resetAll();
  const sam = await employee('Sam Staff');
  const ola = await employee('Ola Other');
  const gone = await employee('Gone Person', 'inactive');
  const clientA = await company('Alpha Fake Ltd');
  const adminUser = await user('admin@example.test', 'admin');
  const managerUser = await user('manager@example.test', 'manager');
  await user('sam@example.test', 'employee', { employeeId: sam });
  await user('ola@example.test', 'employee', { employeeId: ola });
  await user('client@example.test', 'client', { clientId: clientA });

  const pA = await project('Alpha Website', adminUser, clientA);
  const pInternal = await project('Internal Tools', adminUser, null);
  const pOther = await project('Ola Only', adminUser, null);
  const samTask = await task(pA, adminUser, { title: 'Sam builds the header', assignee: sam });
  await member(pInternal, sam);
  const olaTask = await task(pOther, adminUser, { title: 'Ola writes copy', assignee: ola });

  ids = { adminUser, managerUser, sam, ola, gone, clientA, pA, pInternal, pOther, samTask, olaTask };
  agents = {
    admin: await signIn('admin@example.test'),
    manager: await signIn('manager@example.test'),
    employee: await signIn('sam@example.test'),
    client: await signIn('client@example.test'),
    anonymous: request.agent(app),
  };
});

afterAll(async () => {
  await pool.end();
});

const call = (agent: request.Agent, method: string, path: string, body?: unknown) => {
  const req = (agent as unknown as Record<string, (u: string) => request.Test>)[method](path);
  return body === undefined ? req : req.send(body as object);
};

describe('role matrix', () => {
  // Each row: method, path, body, expected status per caller. `setup` runs before every caller so
  // mutating routes start from the same state.
  type Row = {
    name: string;
    method: string;
    path: () => string;
    body?: () => unknown;
    setup?: () => Promise<void>;
    expect: Record<Who, number>;
  };
  let freshTask = '';
  let freshComment = '';
  const rows: Row[] = [
    { name: 'list projects', method: 'get', path: () => '/api/projects', expect: { admin: 200, manager: 200, employee: 200, client: 403, anonymous: 401 } },
    { name: 'get project', method: 'get', path: () => `/api/projects/${ids.pA}`, expect: { admin: 200, manager: 200, employee: 200, client: 403, anonymous: 401 } },
    { name: 'create project', method: 'post', path: () => '/api/projects', body: () => ({ name: 'New' }), expect: { admin: 201, manager: 201, employee: 403, client: 403, anonymous: 401 } },
    { name: 'edit project', method: 'patch', path: () => `/api/projects/${ids.pA}`, body: () => ({ description: 'x' }), expect: { admin: 200, manager: 200, employee: 403, client: 403, anonymous: 401 } },
    { name: 'set members', method: 'put', path: () => `/api/projects/${ids.pA}/members`, body: () => ({ employeeIds: [ids.sam] }), expect: { admin: 200, manager: 200, employee: 403, client: 403, anonymous: 401 } },
    {
      name: 'archive', method: 'post', path: () => `/api/projects/${ids.pInternal}/archive`, body: () => ({}),
      setup: async () => { await query(`UPDATE projects SET status = 'active' WHERE id = $1`, [ids.pInternal]); },
      expect: { admin: 200, manager: 200, employee: 403, client: 403, anonymous: 401 },
    },
    {
      name: 'unarchive', method: 'post', path: () => `/api/projects/${ids.pInternal}/unarchive`, body: () => ({}),
      setup: async () => { await query(`UPDATE projects SET status = 'archived' WHERE id = $1`, [ids.pInternal]); },
      expect: { admin: 200, manager: 200, employee: 403, client: 403, anonymous: 401 },
    },
    { name: 'list tasks', method: 'get', path: () => '/api/tasks', expect: { admin: 200, manager: 200, employee: 200, client: 403, anonymous: 401 } },
    { name: 'task summary', method: 'get', path: () => '/api/tasks/summary', expect: { admin: 200, manager: 200, employee: 200, client: 403, anonymous: 401 } },
    { name: 'get own task', method: 'get', path: () => `/api/tasks/${ids.samTask}`, expect: { admin: 200, manager: 200, employee: 200, client: 403, anonymous: 401 } },
    { name: 'create task', method: 'post', path: () => '/api/tasks', body: () => ({ projectId: ids.pA, title: 'T' }), expect: { admin: 201, manager: 201, employee: 403, client: 403, anonymous: 401 } },
    { name: 'edit task', method: 'patch', path: () => `/api/tasks/${ids.samTask}`, body: () => ({ title: 'Renamed' }), expect: { admin: 200, manager: 200, employee: 403, client: 403, anonymous: 401 } },
    {
      name: 'delete task', method: 'delete', path: () => `/api/tasks/${freshTask}`,
      setup: async () => { freshTask = await task(ids.pA, ids.adminUser, { assignee: ids.sam }); },
      expect: { admin: 200, manager: 200, employee: 403, client: 403, anonymous: 401 },
    },
    {
      name: 'change status', method: 'patch', path: () => `/api/tasks/${ids.samTask}/status`, body: () => ({ status: 'in_progress' }),
      setup: async () => { await query(`UPDATE tasks SET status = 'todo', completed_at = NULL WHERE id = $1`, [ids.samTask]); },
      expect: { admin: 200, manager: 200, employee: 200, client: 403, anonymous: 401 },
    },
    { name: 'list comments', method: 'get', path: () => `/api/tasks/${ids.samTask}/comments`, expect: { admin: 200, manager: 200, employee: 200, client: 403, anonymous: 401 } },
    { name: 'post comment', method: 'post', path: () => `/api/tasks/${ids.samTask}/comments`, body: () => ({ body: 'hi' }), expect: { admin: 201, manager: 201, employee: 201, client: 403, anonymous: 401 } },
    {
      // Authored by the admin: admin may delete, the manager (not the author) may not.
      name: 'delete comment', method: 'delete', path: () => `/api/comments/${freshComment}`,
      setup: async () => { freshComment = await comment(ids.samTask, ids.adminUser, 'internal_note', 'note'); },
      expect: { admin: 200, manager: 403, employee: 403, client: 403, anonymous: 401 },
    },
  ];

  for (const row of rows) {
    it(row.name, async () => {
      for (const who of ['client', 'anonymous', 'employee', 'manager', 'admin'] as Who[]) {
        await row.setup?.();
        const res = await call(agents[who], row.method, row.path(), row.body?.());
        expect({ who, status: res.status }).toEqual({ who, status: row.expect[who] });
      }
    });
  }
});

describe('employee scoping', () => {
  it("can't read or change another employee's task (404, same as a missing id)", async () => {
    for (const [method, path, body] of [
      ['get', `/api/tasks/${ids.olaTask}`, undefined],
      ['patch', `/api/tasks/${ids.olaTask}/status`, { status: 'in_progress' }],
      ['get', `/api/tasks/${ids.olaTask}/comments`, undefined],
      ['post', `/api/tasks/${ids.olaTask}/comments`, { body: 'sneaky' }],
    ] as const) {
      const res = await call(agents.employee, method, path, body);
      expect({ path, method, status: res.status, code: res.body.code }).toEqual({ path, method, status: 404, code: 'NOT_FOUND' });
    }
    const olaComment = await comment(ids.olaTask, ids.adminUser, 'internal_note', 'x');
    await agents.employee.delete(`/api/comments/${olaComment}`).expect(404);
    const [row] = await query<{ status: string }>('SELECT status FROM tasks WHERE id = $1', [ids.olaTask]);
    expect(row.status).toBe('todo');
  });

  it('lists only their own tasks, ignoring any assignee filter, and summarises only those', async () => {
    const list = await agents.employee.get('/api/tasks').query({ assigneeId: ids.ola }).expect(200);
    expect(list.body.tasks.map((t: { id: string }) => t.id)).toEqual([ids.samTask]);
    const summary = await agents.employee.get('/api/tasks/summary').expect(200);
    expect(summary.body.summary.total).toBe(1);
    const all = await agents.manager.get('/api/tasks/summary').expect(200);
    expect(all.body.summary.total).toBe(2);
  });

  it("sees only projects they're a member of; others are 404", async () => {
    const list = await agents.employee.get('/api/projects').expect(200);
    expect(list.body.projects.map((p: { name: string }) => p.name).sort()).toEqual(['Alpha Website', 'Internal Tools']);
    await agents.employee.get(`/api/projects/${ids.pOther}`).expect(404);
    const unrelated = await signIn('ola@example.test');
    const olaList = await unrelated.get('/api/projects').expect(200);
    expect(olaList.body.projects.map((p: { name: string }) => p.name)).toEqual(['Ola Only']);
    await unrelated.get(`/api/projects/${ids.pA}`).expect(404);
  });
});

describe('status transitions', () => {
  const cases: [string, string, number][] = [
    ['todo', 'in_progress', 200],
    ['in_progress', 'in_review', 200],
    ['in_progress', 'blocked', 200],
    ['blocked', 'in_progress', 200],
    ['todo', 'in_review', 403],
    ['todo', 'completed', 403],
    ['todo', 'blocked', 403],
    ['in_progress', 'completed', 403],
    ['in_progress', 'todo', 403],
    ['in_review', 'completed', 403],
    ['in_review', 'in_progress', 403],
    ['blocked', 'completed', 403],
    ['completed', 'in_progress', 403],
  ];
  it('employee: each transition allowed or denied as specified', async () => {
    for (const [from, to, expected] of cases) {
      await query(`UPDATE tasks SET status = $2, completed_at = CASE WHEN $2 = 'completed' THEN now() END WHERE id = $1`, [ids.samTask, from]);
      const res = await agents.employee.patch(`/api/tasks/${ids.samTask}/status`).send({ status: to });
      expect({ from, to, status: res.status }).toEqual({ from, to, status: expected });
      if (expected === 403) expect(res.body.code).toBe('TRANSITION_NOT_ALLOWED');
    }
  });

  it('keeps the hand-over comment when an employee sends a task to review', async () => {
    await query(`UPDATE tasks SET status = 'in_progress' WHERE id = $1`, [ids.samTask]);
    const res = await agents.employee
      .patch(`/api/tasks/${ids.samTask}/status`)
      .send({ status: 'in_review', comment: 'Ready, see PR 12' })
      .expect(200);
    expect(res.body.task).toMatchObject({ status: 'in_review', completionComment: 'Ready, see PR 12' });
  });

  it('manager: any transition; completed_at set on completed and cleared when leaving; updated_by set', async () => {
    const done = await agents.manager.patch(`/api/tasks/${ids.samTask}/status`).send({ status: 'completed' }).expect(200);
    expect(done.body.task.completedAt).not.toBeNull();
    expect(done.body.task.updatedBy).toBe(ids.managerUser);
    const reopened = await agents.admin.patch(`/api/tasks/${ids.samTask}/status`).send({ status: 'todo' }).expect(200);
    expect(reopened.body.task.completedAt).toBeNull();
    expect(reopened.body.task.updatedBy).toBe(ids.adminUser);
    const log = await query<{ metadata: unknown }>(`SELECT metadata FROM audit_logs WHERE action = 'task.status_changed' ORDER BY created_at`);
    expect(log.map(l => l.metadata)).toEqual([{ from: 'todo', to: 'completed' }, { from: 'completed', to: 'todo' }]);
  });
});

describe('creating and assigning tasks', () => {
  it('assigns server task codes and adds the assignee to the project team in the same transaction', async () => {
    const res = await agents.manager
      .post('/api/tasks')
      .send({ projectId: ids.pInternal, title: 'Ola helps', assigneeId: ids.ola, priority: 'high', clientVisible: true })
      .expect(201);
    expect(res.body.task).toMatchObject({ code: expect.stringMatching(/^TSK-\d{3}$/), assignee: { fullName: 'Ola Other' }, priority: 'high', clientVisible: true });
    const members = await query(`SELECT 1 FROM project_members WHERE project_id = $1 AND employee_id = $2`, [ids.pInternal, ids.ola]);
    expect(members).toHaveLength(1);

    // Reassigning via PATCH also adds membership.
    const other = await agents.manager.post('/api/tasks').send({ projectId: ids.pOther, title: 'Unassigned' }).expect(201);
    await agents.manager.patch(`/api/tasks/${other.body.task.id}`).send({ assigneeId: ids.sam }).expect(200);
    const samOnOther = await query(`SELECT 1 FROM project_members WHERE project_id = $1 AND employee_id = $2`, [ids.pOther, ids.sam]);
    expect(samOnOther).toHaveLength(1);
  });

  it('rejects inactive assignees, bad dates and other invalid input', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ projectId: ids.pA, title: 'x', assigneeId: ids.gone }, 'assigneeId'],
      [{ projectId: ids.pA, title: 'x', startDate: '2026-05-10', deadline: '2026-05-01' }, 'deadline'],
      [{ projectId: ids.pA, title: '  ' }, 'title'],
      [{ projectId: ids.pA, title: 'x', priority: 'asap' }, 'priority'],
      [{ projectId: ids.pA, title: 'x', deadline: '10/05/2026' }, 'deadline'],
      [{ projectId: '00000000-0000-4000-a000-000000000999', title: 'x' }, 'projectId'],
    ];
    for (const [body, field] of cases) {
      const res = await agents.manager.post('/api/tasks').send(body);
      expect({ field, status: res.status }).toEqual({ field, status: 400 });
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(field);
    }
    // A PATCH that would put the deadline before the existing start date
    await agents.manager.patch(`/api/tasks/${ids.samTask}`).send({ startDate: '2026-06-01' }).expect(200);
    const bad = await agents.manager.patch(`/api/tasks/${ids.samTask}`).send({ deadline: '2026-05-01' });
    expect(bad.status).toBe(400);
    await agents.manager.patch(`/api/tasks/${ids.samTask}/status`).send({ status: 'done' }).expect(400);
    await agents.manager.get('/api/tasks/not-a-uuid').expect(404);
    await agents.manager.post('/api/tasks/' + ids.samTask + '/comments').send({ body: 'x'.repeat(2001) }).expect(400);
  });

  it('project validation, members and archive behaviour', async () => {
    const bad = await agents.manager.post('/api/projects').send({ name: 'X', startDate: '2026-05-10', deadline: '2026-05-01' });
    expect(bad.status).toBe(400);
    await agents.manager.post('/api/projects').send({ name: 'X', clientId: '00000000-0000-4000-a000-000000000999' }).expect(400);
    await agents.manager.patch(`/api/projects/${ids.pA}`).send({ status: 'archived' }).expect(400); // archive via /archive only

    // Members: only active employees; an assignee can't be removed while they hold tasks.
    await agents.manager.put(`/api/projects/${ids.pA}/members`).send({ employeeIds: [ids.sam, ids.gone] }).expect(400);
    const holding = await agents.manager.put(`/api/projects/${ids.pA}/members`).send({ employeeIds: [ids.ola] });
    expect(holding.body.code).toBe('MEMBER_HAS_TASKS');
    const ok = await agents.manager.put(`/api/projects/${ids.pA}/members`).send({ employeeIds: [ids.sam, ids.ola] }).expect(200);
    expect(ok.body.project.members.map((m: { fullName: string }) => m.fullName)).toEqual(['Ola Other', 'Sam Staff']);

    // Archive hides the project by default but blocks nothing: tasks can still be changed.
    await agents.manager.post(`/api/projects/${ids.pA}/archive`).send({}).expect(200);
    const list = await agents.manager.get('/api/projects').expect(200);
    expect(list.body.projects.map((p: { name: string }) => p.name)).not.toContain('Alpha Website');
    const withArchived = await agents.manager.get('/api/projects').query({ includeArchived: 'true' }).expect(200);
    expect(withArchived.body.projects.map((p: { name: string }) => p.name)).toContain('Alpha Website');
    const archivedOnly = await agents.manager.get('/api/projects').query({ status: 'archived' }).expect(200);
    expect(archivedOnly.body.projects).toHaveLength(1);
    await agents.employee.patch(`/api/tasks/${ids.samTask}/status`).send({ status: 'in_progress' }).expect(200);
    await agents.manager.post(`/api/projects/${ids.pA}/archive`).send({}).expect(409);
    const back = await agents.manager.post(`/api/projects/${ids.pA}/unarchive`).send({}).expect(200);
    expect(back.body.project.status).toBe('active');
  });

  it('reports progress over all tasks for staff', async () => {
    await task(ids.pA, ids.adminUser, { status: 'completed' });
    const res = await agents.manager.get(`/api/projects/${ids.pA}`).expect(200);
    expect(res.body.project).toMatchObject({ taskCount: 2, completedTaskCount: 1, progress: 0.5, clientName: 'Alpha Fake Ltd' });
  });
});
