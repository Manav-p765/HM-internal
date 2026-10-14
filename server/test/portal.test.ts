import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pool, query } from '../src/db.js';
import { comment, company, employee, project, resetAll, signIn, task, user } from './fixtures.js';

// Text that must never reach a client: internal notes, completion comments, staff contact details.
const INTERNAL_NOTE = 'INTERNAL-NOTE-do-not-show-client';
const COMPLETION_NOTE = 'COMPLETION-COMMENT-internal';
const STAFF_EMAIL_FRAGMENT = 'sam.staff';

let a: request.Agent;
let b: request.Agent;
let manager: request.Agent;
let ids: Record<string, string>;

beforeEach(async () => {
  await resetAll();
  const sam = await employee('Sam Staff');
  const companyA = await company('Alpha Fake Ltd');
  const companyB = await company('Beta Fake LLP');
  const admin = await user('admin@example.test', 'admin');
  await user('manager@example.test', 'manager');
  await user('a@example.test', 'client', { clientId: companyA });
  await user('b@example.test', 'client', { clientId: companyB });

  const pA = await project('Alpha Website', admin, companyA);
  const pA2 = await project('Alpha App (nothing visible)', admin, companyA);
  const pAarchived = await project('Alpha Old', admin, companyA, 'archived');
  const pB = await project('Beta Launch', admin, companyB);
  const pInternal = await project('Internal Tools', admin, null);

  const aVisibleDone = await task(pA, admin, { title: 'Homepage', assignee: sam, status: 'completed', visible: true, completionComment: COMPLETION_NOTE });
  const aVisibleWip = await task(pA, admin, { title: 'Pricing page', assignee: sam, status: 'in_progress', visible: true, deadline: '2020-01-01' });
  const aHidden = await task(pA, admin, { title: 'Refactor internals', assignee: sam, status: 'completed', visible: false });
  await task(pA2, admin, { title: 'Hidden only', status: 'todo', visible: false });
  const bVisible = await task(pB, admin, { title: 'Beta landing', status: 'todo', visible: true });
  await task(pInternal, admin, { title: 'Internal thing', visible: true });

  await comment(aVisibleDone, admin, 'internal_note', INTERNAL_NOTE);
  await comment(aVisibleDone, admin, 'client_feedback', 'Shipped, please review');
  await comment(bVisible, admin, 'client_feedback', 'Beta-only feedback');

  ids = { pA, pA2, pAarchived, pB, pInternal, aVisibleDone, aVisibleWip, aHidden, bVisible };
  a = await signIn('a@example.test');
  b = await signIn('b@example.test');
  manager = await signIn('manager@example.test');
});

afterAll(async () => {
  await pool.end();
});

describe('portal projects', () => {
  it("lists only the company's non-archived projects, with progress over client-visible tasks only", async () => {
    const res = await a.get('/api/portal/projects').expect(200);
    const byName = Object.fromEntries(res.body.projects.map((p: { name: string }) => [p.name, p]));
    expect(Object.keys(byName).sort()).toEqual(['Alpha App (nothing visible)', 'Alpha Website']);
    // 2 visible tasks (1 completed); the hidden completed task does not count.
    expect(byName['Alpha Website']).toMatchObject({ progress: 0.5, taskCounts: { total: 2, completed: 1, inProgress: 1, overdue: 1 } });
    // No visible tasks: progress null and no counts at all.
    expect(byName['Alpha App (nothing visible)'].progress).toBeNull();
    expect(byName['Alpha App (nothing visible)']).not.toHaveProperty('taskCounts');
    expect(JSON.stringify(res.body)).not.toContain('Beta');
  });

  it('returns only visible tasks with no internal fields', async () => {
    const res = await a.get(`/api/portal/projects/${ids.pA}/tasks`).expect(200);
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Pricing page', 'Homepage']);
    for (const t of res.body.tasks) {
      for (const field of ['completionComment', 'createdBy', 'updatedBy', 'clientVisible', 'assigneeId', 'projectId']) {
        expect(t).not.toHaveProperty(field);
      }
      expect(Object.keys(t.assignee ?? {}).sort()).toEqual(t.assignee ? ['designation', 'fullName'] : []);
    }
    const text = JSON.stringify(res.body);
    for (const secret of [INTERNAL_NOTE, COMPLETION_NOTE, STAFF_EMAIL_FRAGMENT, 'Refactor internals', '+00 555']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('portal comments', () => {
  it('shows client feedback only (filtered in SQL) and never internal notes', async () => {
    const res = await a.get(`/api/portal/tasks/${ids.aVisibleDone}/comments`).expect(200);
    expect(res.body.comments.map((c: { body: string }) => c.body)).toEqual(['Shipped, please review']);
    expect(JSON.stringify(res.body)).not.toContain(INTERNAL_NOTE);
  });

  it('forces the type to client_feedback, limits the length, and staff see it', async () => {
    const posted = await a
      .post(`/api/portal/tasks/${ids.aVisibleWip}/comments`)
      .send({ body: 'Can we use our new logo?', type: 'internal_note' })
      .expect(201);
    const [row] = await query<{ comment_type: string }>('SELECT comment_type FROM task_comments WHERE id = $1', [posted.body.comment.id]);
    expect(row.comment_type).toBe('client_feedback');

    await a.post(`/api/portal/tasks/${ids.aVisibleWip}/comments`).send({ body: 'x'.repeat(2001) }).expect(400);
    await a.post(`/api/portal/tasks/${ids.aVisibleWip}/comments`).send({ body: '   ' }).expect(400);

    const staffView = await manager.get(`/api/tasks/${ids.aVisibleWip}/comments`).expect(200);
    expect(staffView.body.comments).toEqual([
      expect.objectContaining({ body: 'Can we use our new logo?', type: 'client_feedback', authorName: 'Alpha Fake Ltd', authorRole: 'client' }),
    ]);
  });

  it('a non-visible task is invisible and not commentable', async () => {
    await a.get(`/api/portal/tasks/${ids.aHidden}/comments`).expect(404);
    await a.post(`/api/portal/tasks/${ids.aHidden}/comments`).send({ body: 'hello?' }).expect(404);
    const [{ count }] = await query<{ count: string }>('SELECT count(*) FROM task_comments WHERE task_id = $1', [ids.aHidden]);
    expect(count).toBe('0');
  });
});

describe('cross-company isolation', () => {
  it('guessing another company\'s ids gives exactly the same 404 as a missing id', async () => {
    const missing = '00000000-0000-4000-a000-000000000999';
    const probes: [string, string, unknown][] = [
      ['get', `/api/portal/projects/${ids.pB}/tasks`, undefined],
      ['get', `/api/portal/projects/${ids.pInternal}/tasks`, undefined],
      ['get', `/api/portal/projects/${ids.pAarchived}/tasks`, undefined],
      ['get', `/api/portal/tasks/${ids.bVisible}/comments`, undefined],
      ['post', `/api/portal/tasks/${ids.bVisible}/comments`, { body: 'pwned' }],
    ];
    const missingProject = await a.get(`/api/portal/projects/${missing}/tasks`);
    const missingTask = await a.get(`/api/portal/tasks/${missing}/comments`);
    for (const [method, path, body] of probes) {
      const req = (a as unknown as Record<string, (u: string) => request.Test>)[method](path);
      const res = body === undefined ? await req : await req.send(body as object);
      const reference = path.includes('/projects/') ? missingProject : missingTask;
      expect({ path, status: res.status, body: res.body }).toEqual({ path, status: 404, body: reference.body });
    }
    expect(missingProject.status).toBe(404);
    const [{ count }] = await query<{ count: string }>(`SELECT count(*) FROM task_comments WHERE body = 'pwned'`);
    expect(count).toBe('0');
  });

  it('company B sees none of company A', async () => {
    const projects = await b.get('/api/portal/projects').expect(200);
    expect(projects.body.projects.map((p: { name: string }) => p.name)).toEqual(['Beta Launch']);
    await b.get(`/api/portal/projects/${ids.pA}/tasks`).expect(404);
    await b.get(`/api/portal/tasks/${ids.aVisibleDone}/comments`).expect(404);
    const text = JSON.stringify((await b.get(`/api/portal/projects/${ids.pB}/tasks`).expect(200)).body);
    expect(text).not.toContain('Alpha');
  });

  it('no portal response ever contains an internal note', async () => {
    const bodies: unknown[] = [];
    for (const agent of [a, b]) {
      const projects = (await agent.get('/api/portal/projects').expect(200)).body;
      bodies.push(projects);
      for (const p of projects.projects) {
        const tasks = (await agent.get(`/api/portal/projects/${p.id}/tasks`).expect(200)).body;
        bodies.push(tasks);
        for (const t of tasks.tasks) bodies.push((await agent.get(`/api/portal/tasks/${t.id}/comments`).expect(200)).body);
      }
    }
    expect(bodies.length).toBeGreaterThan(5);
    const all = JSON.stringify(bodies);
    expect(all).not.toContain(INTERNAL_NOTE);
    expect(all).not.toContain(COMPLETION_NOTE);
  });
});
