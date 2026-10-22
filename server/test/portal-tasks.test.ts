// Client task requests: a client user requests a task on their own company's project and assigns it to
// someone on that project's team. Scope (another company's project or task is a 404), who may be assigned,
// what may change and when, and that staff see and are notified of the request.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pool, query } from '../src/db.js';
import { resetClock, setClock } from '../src/services/clock.js';
import { company, employee, member, project, resetAll, signIn, task, user } from './fixtures.js';

// Wednesday 2026-10-14, 09:30 IST.
const TODAY = '2026-10-14';
const T0 = new Date('2026-10-14T04:00:00Z');

let a: request.Agent;
let b: request.Agent;
let manager: request.Agent;
let samAgent: request.Agent;
let ids: Record<string, string>;

beforeEach(async () => {
  setClock(T0);
  await resetAll();
  const sam = await employee('Sam Staff');
  const riya = await employee('Riya Dev');
  const outsider = await employee('Olu Outsider'); // not on the project
  const gone = await employee('Gina Gone', 'inactive');
  const lead = await employee('Lee Lead'); // a manager's employee record
  const companyA = await company('Alpha Fake Ltd');
  const companyB = await company('Beta Fake LLP');
  const admin = await user('admin@example.test', 'admin');
  await user('manager@example.test', 'manager', { employeeId: lead });
  await user('sam@example.test', 'employee', { employeeId: sam });
  await user('a@example.test', 'client', { clientId: companyA });
  await user('b@example.test', 'client', { clientId: companyB });

  const pA = await project('Alpha Website', admin, companyA);
  const pAdone = await project('Alpha Done', admin, companyA, 'completed');
  const pAarchived = await project('Alpha Old', admin, companyA, 'archived');
  const pB = await project('Beta Launch', admin, companyB);
  for (const e of [sam, riya, gone, lead]) await member(pA, e);
  await member(pB, outsider);
  const staffTask = await task(pA, admin, { title: 'Staff task', assignee: sam, status: 'todo', visible: true });
  const hiddenTask = await task(pA, admin, { title: 'Hidden task', assignee: sam, status: 'todo', visible: false });

  ids = { sam, riya, outsider, gone, lead, pA, pAdone, pAarchived, pB, staffTask, hiddenTask };
  a = await signIn('a@example.test');
  b = await signIn('b@example.test');
  manager = await signIn('manager@example.test');
  samAgent = await signIn('sam@example.test');
});

afterEach(() => resetClock());

afterAll(async () => {
  await pool.end();
});

const request_ = (agent: request.Agent, projectId: string, body: Record<string, unknown>) => agent.post(`/api/portal/projects/${projectId}/tasks`).send(body);

describe('assignees', () => {
  it("lists only the project's active team, without admin or manager logins", async () => {
    const res = await a.get(`/api/portal/projects/${ids.pA}/assignees`).expect(200);
    expect(res.body.assignees).toEqual([
      { id: ids.riya, name: 'Riya Dev', designation: expect.any(String) },
      { id: ids.sam, name: 'Sam Staff', designation: expect.any(String) },
    ]);
  });

  it("another company's, an archived or a missing project is the same 404", async () => {
    for (const id of [ids.pB, ids.pAarchived, '00000000-0000-4000-8000-000000000000', 'nope']) {
      const res = await a.get(`/api/portal/projects/${id}/assignees`).expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    }
  });
});

describe('creating a request', () => {
  it('creates a shared, flagged task assigned to the chosen team member, straight into their list', async () => {
    const res = await request_(a, ids.pA, { title: 'Add a FAQ page', description: 'Six questions (fake)', priority: 'high', deadline: '2026-10-30', assigneeId: ids.riya }).expect(201);
    expect(res.body.task).toMatchObject({
      code: expect.stringMatching(/^TSK-\d{3}$/),
      title: 'Add a FAQ page',
      status: 'todo',
      priority: 'high',
      deadline: '2026-10-30',
      assignee: { fullName: 'Riya Dev', designation: expect.any(String) },
      requestedByClient: true,
      editable: true,
    });
    for (const field of ['assigneeId', 'projectId', 'createdBy', 'clientVisible', 'completionComment']) expect(res.body.task).not.toHaveProperty(field);

    const [row] = await query<{ client_visible: boolean; requested_by_client: boolean; assignee_employee_id: string }>(
      'SELECT client_visible, requested_by_client, assignee_employee_id FROM tasks WHERE id = $1',
      [res.body.task.id],
    );
    expect(row).toEqual({ client_visible: true, requested_by_client: true, assignee_employee_id: ids.riya });

    // The client sees it on the project; the audit row says it came from the portal.
    const list = await a.get(`/api/portal/projects/${ids.pA}/tasks`).expect(200);
    expect(list.body.tasks.map((t: { title: string }) => t.title)).toContain('Add a FAQ page');
    const [audited] = await query<{ metadata: Record<string, unknown> }>(`SELECT metadata FROM audit_logs WHERE action = 'task.created'`);
    expect(audited.metadata).toMatchObject({ portal: true });
  });

  it('may be left unassigned for staff to pick up', async () => {
    const res = await request_(a, ids.pA, { title: 'Someone please look at this' }).expect(201);
    expect(res.body.task).toMatchObject({ assignee: null, priority: 'medium' });
  });

  it('refuses assignees outside the eligible team with the same 400', async () => {
    for (const assigneeId of [ids.outsider, ids.gone, ids.lead, '00000000-0000-4000-8000-000000000000']) {
      const res = await request_(a, ids.pA, { title: 'x', assigneeId }).expect(400);
      expect(res.body.details).toEqual([{ path: 'assigneeId', message: 'Choose someone from the project team' }]);
    }
    expect((await query('SELECT 1 FROM tasks WHERE requested_by_client')).length).toBe(0);
  });

  it('validates the fields and refuses anything else', async () => {
    await request_(a, ids.pA, { title: '  ' }).expect(400);
    await request_(a, ids.pA, { title: 'x', deadline: '2026-10-13' }).expect(400); // in the past (IST)
    expect((await request_(a, ids.pA, { title: 'x', deadline: TODAY }).expect(201)).body.task.deadline).toBe(TODAY);
    await request_(a, ids.pA, { title: 'x', priority: 'asap' }).expect(400);
    // No way to set staff-only fields.
    await request_(a, ids.pA, { title: 'x', clientVisible: false }).expect(400);
    await request_(a, ids.pA, { title: 'x', status: 'completed' }).expect(400);
  });

  it("another company's, an archived or a missing project is a 404; a completed one is closed", async () => {
    for (const id of [ids.pB, ids.pAarchived, '00000000-0000-4000-8000-000000000000']) await request_(a, id, { title: 'x' }).expect(404);
    await request_(b, ids.pA, { title: 'x', assigneeId: ids.sam }).expect(404);
    expect((await request_(a, ids.pAdone, { title: 'x' }).expect(409)).body.code).toBe('PROJECT_CLOSED');
  });
});

describe('changing a request', () => {
  async function created() {
    return (await request_(a, ids.pA, { title: 'Fix the footer', assigneeId: ids.sam }).expect(201)).body.task;
  }

  it('the company may reassign or edit its own request while it is still to do', async () => {
    const t = await created();
    const res = await a.patch(`/api/portal/tasks/${t.id}`).send({ assigneeId: ids.riya, priority: 'urgent' }).expect(200);
    expect(res.body.task).toMatchObject({ assignee: { fullName: 'Riya Dev' }, priority: 'urgent', editable: true });
    await a.patch(`/api/portal/tasks/${t.id}`).send({ assigneeId: ids.outsider }).expect(400);
    await a.patch(`/api/portal/tasks/${t.id}`).send({}).expect(400);
  });

  it('is locked once work starts, and staff tasks are never editable by the client', async () => {
    const t = await created();
    await samAgent.patch(`/api/tasks/${t.id}/status`).send({ status: 'in_progress' }).expect(200);
    expect((await a.patch(`/api/portal/tasks/${t.id}`).send({ assigneeId: ids.riya }).expect(409)).body.code).toBe('TASK_LOCKED');
    expect((await a.patch(`/api/portal/tasks/${ids.staffTask}`).send({ title: 'mine now' }).expect(409)).body.code).toBe('TASK_LOCKED');
    const list = await a.get(`/api/portal/projects/${ids.pA}/tasks`).expect(200);
    expect(list.body.tasks.find((x: { id: string }) => x.id === ids.staffTask)).toMatchObject({ requestedByClient: false, editable: false });
  });

  it("a hidden task, another company's request or a missing id is the same 404", async () => {
    const t = await created();
    for (const [agent, id] of [
      [a, ids.hiddenTask],
      [b, t.id],
      [a, '00000000-0000-4000-8000-000000000000'],
    ] as const) {
      const res = await agent.patch(`/api/portal/tasks/${id}`).send({ title: 'x' }).expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    }
  });
});

describe('staff side', () => {
  it('the assignee sees it, managers find open requests (the bell), and it stays shared with the client', async () => {
    const t = (await request_(a, ids.pA, { title: 'New banner', assigneeId: ids.sam }).expect(201)).body.task;
    const mine = await samAgent.get('/api/tasks').expect(200);
    expect(mine.body.tasks.find((x: { id: string }) => x.id === t.id)).toMatchObject({ requestedByClient: true });

    const bell = await manager.get('/api/tasks?requestedByClient=true&status=todo').expect(200);
    expect(bell.body.tasks.map((x: { id: string }) => x.id)).toEqual([t.id]);

    const res = await manager.patch(`/api/tasks/${t.id}`).send({ clientVisible: false }).expect(409);
    expect(res.body.code).toBe('CLIENT_REQUEST_VISIBLE');
    await manager.patch(`/api/tasks/${t.id}`).send({ assigneeId: ids.riya }).expect(200);

    await samAgent.patch(`/api/tasks/${t.id}/status`).send({ status: 'in_progress' }).expect(403); // reassigned away from Sam: view only
    await manager.patch(`/api/tasks/${t.id}/status`).send({ status: 'in_progress' }).expect(200);
    expect((await manager.get('/api/tasks?requestedByClient=true&status=todo').expect(200)).body.tasks).toEqual([]);
  });
});
