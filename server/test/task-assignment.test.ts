// Employees assigning tasks to colleagues, "assigned to you" notifications, and the derived due-soon / overdue
// reminders in GET /api/notifications.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type request from 'supertest';
import { pool, query } from '../src/db.js';
import { company, employee, member, project, resetAll, signIn, task, user } from './fixtures.js';

let ids: { admin: string; manager: string; seo: string; dev: string; seoUser: string; devUser: string; pA: string; pOther: string };
let seo: request.Agent;
let dev: request.Agent;
let manager: request.Agent;
let today: string;

const dayOffset = async (days: number) =>
  (await query<{ d: string }>(`SELECT ((now() AT TIME ZONE 'Asia/Kolkata')::date + $1::int)::text AS d`, [days]))[0].d;

beforeEach(async () => {
  await resetAll();
  const seoEmp = await employee('Sia Seo');
  const devEmp = await employee('Dev Developer');
  const admin = await user('admin@example.test', 'admin');
  const manager_ = await user('manager@example.test', 'manager');
  const seoUser = await user('seo@example.test', 'employee', { employeeId: seoEmp });
  const devUser = await user('dev@example.test', 'employee', { employeeId: devEmp });
  const pA = await project('Alpha Website', admin, await company('Alpha Fake Ltd'));
  const pOther = await project('Not Sia', admin, null);
  await member(pA, seoEmp);
  ids = { admin, manager: manager_, seo: seoEmp, dev: devEmp, seoUser, devUser, pA, pOther };
  seo = await signIn('seo@example.test');
  dev = await signIn('dev@example.test');
  manager = await signIn('manager@example.test');
  today = await dayOffset(0);
});

afterAll(async () => {
  await pool.end();
});

const assignToDev = (extra: Record<string, unknown> = {}) =>
  seo.post('/api/tasks').send({ projectId: ids.pA, title: 'Fix meta tags', assigneeId: ids.dev, deadline: today, ...extra });

describe('employees assign tasks to colleagues', () => {
  it('creates the task on a project they are on, puts the assignee on the team and shows who assigned it', async () => {
    const res = await assignToDev().expect(201);
    expect(res.body.task).toMatchObject({ assigneeId: ids.dev, createdBy: ids.seoUser, createdByName: 'Sia Seo', clientVisible: false });
    const team = await query('SELECT 1 FROM project_members WHERE project_id = $1 AND employee_id = $2', [ids.pA, ids.dev]);
    expect(team).toHaveLength(1);
  });

  it('refuses projects they are not on (as missing) and sharing with the client', async () => {
    const other = await seo.post('/api/tasks').send({ projectId: ids.pOther, title: 'X', assigneeId: ids.dev }).expect(400);
    expect(other.body.details[0].path).toBe('projectId');
    await assignToDev({ clientVisible: true }).expect(403);
  });

  it('the assigner sees it under assigned_by_me, the assignee under their own tasks', async () => {
    const id = (await assignToDev().expect(201)).body.task.id;
    const mine = await seo.get('/api/tasks').expect(200);
    expect(mine.body.tasks).toHaveLength(0);
    const byMe = await seo.get('/api/tasks?view=assigned_by_me').expect(200);
    expect(byMe.body.tasks.map((t: { id: string }) => t.id)).toEqual([id]);
    const devList = await dev.get('/api/tasks').expect(200);
    expect(devList.body.tasks.map((t: { id: string }) => t.id)).toEqual([id]);
    await seo.get(`/api/tasks/${id}`).expect(200);
    await seo.post(`/api/tasks/${id}/comments`).send({ body: 'Thanks!' }).expect(201);
  });

  it('the assigner edits or deletes only while to do; the assignee cannot edit; others get 404', async () => {
    const id = (await assignToDev().expect(201)).body.task.id;
    await seo.patch(`/api/tasks/${id}`).send({ title: 'Fix all meta tags' }).expect(200);
    await seo.patch(`/api/tasks/${id}`).send({ clientVisible: true }).expect(403);
    await dev.patch(`/api/tasks/${id}`).send({ title: 'Nope' }).expect(403);
    await dev.delete(`/api/tasks/${id}`).expect(403);

    await dev.patch(`/api/tasks/${id}/status`).send({ status: 'in_progress' }).expect(200);
    const locked = await seo.patch(`/api/tasks/${id}`).send({ title: 'Later' }).expect(409);
    expect(locked.body.code).toBe('TASK_LOCKED');
    await seo.delete(`/api/tasks/${id}`).expect(409);

    await user('ola@example.test', 'employee', { employeeId: await employee('Ola Other') });
    const ola = await signIn('ola@example.test');
    await ola.get(`/api/tasks/${id}`).expect(404);
    await ola.patch(`/api/tasks/${id}`).send({ title: 'x' }).expect(404);
  });

  it('the assigner reviews the hand-over; the assignee cannot complete it themselves', async () => {
    const id = (await assignToDev().expect(201)).body.task.id;
    await seo.patch(`/api/tasks/${id}/status`).send({ status: 'in_progress' }).expect(403);
    await dev.patch(`/api/tasks/${id}/status`).send({ status: 'in_progress' }).expect(200);
    await dev.patch(`/api/tasks/${id}/status`).send({ status: 'in_review' }).expect(200);
    await dev.patch(`/api/tasks/${id}/status`).send({ status: 'completed' }).expect(403);
    await seo.patch(`/api/tasks/${id}/status`).send({ status: 'in_progress' }).expect(200);
    await dev.patch(`/api/tasks/${id}/status`).send({ status: 'in_review' }).expect(200);
    const done = await seo.patch(`/api/tasks/${id}/status`).send({ status: 'completed' }).expect(200);
    expect(done.body.task.status).toBe('completed');
  });
});

describe('assignment notifications', () => {
  it('notifies the assignee with the deadline, not the assigner; read and read-all', async () => {
    const id = (await assignToDev().expect(201)).body.task.id;
    const bell = await dev.get('/api/notifications').expect(200);
    expect(bell.body.unread).toBe(1);
    expect(bell.body.assigned[0]).toMatchObject({
      kind: 'task_assigned',
      readAt: null,
      assignedBy: 'Sia Seo',
      task: { id, title: 'Fix meta tags', deadline: today, projectName: 'Alpha Website' },
    });
    expect((await seo.get('/api/notifications').expect(200)).body.assigned).toHaveLength(0);

    // Someone else's notification is a 404.
    await seo.post(`/api/notifications/${bell.body.assigned[0].id}/read`).expect(404);
    await dev.post(`/api/notifications/${bell.body.assigned[0].id}/read`).expect(200);
    expect((await dev.get('/api/notifications').expect(200)).body.unread).toBe(0);
    await dev.post('/api/notifications/read-all').expect(200);
  });

  it('reassigning moves the notification; a manager assigning notifies too; a client request notifies', async () => {
    const id = (await seo.post('/api/tasks').send({ projectId: ids.pA, title: 'Unassigned' }).expect(201)).body.task.id;
    expect((await dev.get('/api/notifications')).body.unread).toBe(0);
    await manager.patch(`/api/tasks/${id}`).send({ assigneeId: ids.dev }).expect(200);
    expect((await dev.get('/api/notifications')).body.unread).toBe(1);
    await manager.patch(`/api/tasks/${id}`).send({ assigneeId: ids.seo }).expect(200);
    expect((await dev.get('/api/notifications')).body.assigned).toHaveLength(0);
    expect((await seo.get('/api/notifications')).body.assigned[0].assignedBy).toBe('Hybrid Monks');

    const [{ client_id }] = await query<{ client_id: string }>('SELECT client_id FROM projects WHERE id = $1', [ids.pA]);
    await user('client@example.test', 'client', { clientId: client_id });
    const client = await signIn('client@example.test');
    await client.post(`/api/portal/projects/${ids.pA}/tasks`).send({ title: 'Please add a FAQ', assigneeId: ids.seo }).expect(201);
    const seoBell = (await seo.get('/api/notifications')).body;
    expect(seoBell.unread).toBe(2);
    expect(seoBell.assigned[0]).toMatchObject({ assignedBy: 'Alpha Fake Ltd', task: { title: 'Please add a FAQ' } });
  });
});

describe('reminders', () => {
  it('the assignee is reminded of tasks due today, tomorrow and overdue; managers and the assigner see overdue ones', async () => {
    const yesterday = await dayOffset(-1);
    const overdue = await task(ids.pA, ids.seoUser, { title: 'Late', assignee: ids.dev, deadline: yesterday });
    const dueToday = await task(ids.pA, ids.admin, { title: 'Today', assignee: ids.dev, deadline: today });
    await task(ids.pA, ids.admin, { title: 'Tomorrow', assignee: ids.dev, deadline: await dayOffset(1) });
    await task(ids.pA, ids.admin, { title: 'Later', assignee: ids.dev, deadline: await dayOffset(5) });
    await task(ids.pA, ids.admin, { title: 'Done late', assignee: ids.dev, deadline: yesterday, status: 'completed' });

    const devBell = (await dev.get('/api/notifications').expect(200)).body;
    expect(devBell.dueSoon.total).toBe(3);
    expect(devBell.dueSoon.tasks.map((t: { title: string }) => t.title)).toEqual(['Late', 'Today', 'Tomorrow']);
    expect(devBell.dueSoon.tasks[0]).toMatchObject({ id: overdue, overdue: true, dueToday: false });
    expect(devBell.dueSoon.tasks[1]).toMatchObject({ id: dueToday, overdue: false, dueToday: true });
    expect(devBell.overdueTeam.total).toBe(0); // their own overdue task is under dueSoon

    const managerBell = (await manager.get('/api/notifications').expect(200)).body;
    expect(managerBell.overdueTeam).toMatchObject({ total: 1, tasks: [{ id: overdue, assigneeName: 'Dev Developer' }] });

    // The SEO employee assigned the late task, so they see it too; tasks others assigned stay hidden.
    await task(ids.pA, ids.admin, { title: 'Admin late', assignee: ids.dev, deadline: yesterday });
    const seoBell = (await seo.get('/api/notifications').expect(200)).body;
    expect(seoBell.overdueTeam.tasks.map((t: { id: string }) => t.id)).toEqual([overdue]);
  });
});
