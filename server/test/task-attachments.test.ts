// Task attachments (files in the database, links) and shared task links (/task/TSK-…), staff and portal side.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type request from 'supertest';
import { pool, query } from '../src/db.js';
import { company, employee, member, project, resetAll, signIn, task, user } from './fixtures.js';

let ids: { admin: string; sam: string; ola: string; samUser: string; acme: string; pAcme: string; pInternal: string; taskId: string };
let agents: Record<'admin' | 'manager' | 'sam' | 'ola' | 'client', request.Agent>;

beforeEach(async () => {
  await resetAll();
  const sam = await employee('Sam Staff');
  const ola = await employee('Ola Other');
  const admin = await user('admin@example.test', 'admin');
  await user('manager@example.test', 'manager');
  const samUser = await user('sam@example.test', 'employee', { employeeId: sam });
  await user('ola@example.test', 'employee', { employeeId: ola });
  const acme = await company('Acme (Fake)');
  await user('client@example.test', 'client', { clientId: acme });
  const pAcme = await project('Acme Site', admin, acme);
  const pInternal = await project('Internal', admin, null);
  await member(pAcme, sam);
  const taskId = await task(pAcme, admin, { title: 'Write the brief', assignee: sam });
  ids = { admin, sam, ola, samUser, acme, pAcme, pInternal, taskId };
  agents = {
    admin: await signIn('admin@example.test'),
    manager: await signIn('manager@example.test'),
    sam: await signIn('sam@example.test'),
    ola: await signIn('ola@example.test'),
    client: await signIn('client@example.test'),
  };
});

afterAll(async () => {
  await pool.end();
});

const upload = (agent: request.Agent, taskId: string, name: string, data: Buffer, type = 'application/octet-stream') =>
  agent.post(`/api/tasks/${taskId}/attachments/file`).set('Content-Type', type).set('X-File-Name', encodeURIComponent(name)).send(data);

describe('attachments', () => {
  it('a file round-trips: upload, list (no file bytes), download as an attachment with the right type', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake report');
    const res = await upload(agents.sam, ids.taskId, 'Monthly report (Oct).pdf', pdf, 'application/pdf').expect(201);
    expect(res.body.attachment).toMatchObject({ kind: 'file', name: 'Monthly report (Oct).pdf', contentType: 'application/pdf', sizeBytes: pdf.length, url: null, uploadedByName: 'Sam Staff' });

    const list = await agents.ola.get(`/api/tasks/${ids.taskId}/attachments`).expect(200); // any staff can view
    expect(list.body.attachments).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('PDF-1.4');
    expect((await agents.ola.get(`/api/tasks/${ids.taskId}`).expect(200)).body.task.attachmentCount).toBe(1);

    const download = await agents.ola
      .get(`/api/tasks/${ids.taskId}/attachments/${res.body.attachment.id}/download`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(download.body as Buffer, pdf)).toBe(0);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['content-disposition']).toContain('attachment;');
    expect(download.headers['content-disposition']).toContain("filename*=UTF-8''Monthly%20report%20(Oct).pdf");

    const [audit] = await query(`SELECT metadata FROM audit_logs WHERE action = 'task.attachment_added'`);
    expect(audit.metadata).toMatchObject({ kind: 'file', sizeBytes: pdf.length });
  });

  it('a link is stored with its URL; only http(s) links are accepted; the name defaults to the host', async () => {
    const res = await agents.sam.post(`/api/tasks/${ids.taskId}/attachments/link`).send({ url: 'https://docs.example.test/brief' }).expect(201);
    expect(res.body.attachment).toMatchObject({ kind: 'link', name: 'docs.example.test', url: 'https://docs.example.test/brief', sizeBytes: null });
    for (const url of ['javascript:alert(1)', 'ftp://example.test/x', 'not a link', 'data:text/html,hi']) {
      await agents.sam.post(`/api/tasks/${ids.taskId}/attachments/link`).send({ url }).expect(400);
    }
  });

  it('refuses unknown or risky file types, empty files and files over 10 MB', async () => {
    for (const name of ['setup.exe', 'logo.svg', 'page.html', 'noextension']) {
      const res = await upload(agents.sam, ids.taskId, name, Buffer.from('x')).expect(400);
      expect(res.body.details[0].path).toBe('file');
    }
    await upload(agents.sam, ids.taskId, 'empty.txt', Buffer.alloc(0)).expect(400);
    const big = await upload(agents.sam, ids.taskId, 'big.zip', Buffer.alloc(10 * 1024 * 1024 + 1)).expect(413);
    expect(big.body.code).toBe('PAYLOAD_TOO_LARGE');
    await upload(agents.sam, ids.taskId, 'exactly-10mb.zip', Buffer.alloc(10 * 1024 * 1024)).expect(201);
    // A folder in the name is dropped.
    const res = await upload(agents.sam, ids.taskId, '../../etc/notes.txt', Buffer.from('hi')).expect(201);
    expect(res.body.attachment.name).toBe('notes.txt');
  });

  it('only the assignee, the assigner and managers add or remove; other staff only view; clients get 403', async () => {
    await upload(agents.ola, ids.taskId, 'mine.txt', Buffer.from('x')).expect(403);
    await agents.ola.post(`/api/tasks/${ids.taskId}/attachments/link`).send({ url: 'https://example.test' }).expect(403);
    const added = await upload(agents.manager, ids.taskId, 'brief.docx', Buffer.from('x')).expect(201);
    await agents.ola.delete(`/api/tasks/${ids.taskId}/attachments/${added.body.attachment.id}`).expect(403);
    await agents.client.get(`/api/tasks/${ids.taskId}/attachments`).expect(403);
    await upload(agents.client, ids.taskId, 'x.txt', Buffer.from('x')).expect(403);

    // An employee who assigned a task to a colleague manages its attachments too.
    const created = await agents.sam.post('/api/tasks').send({ projectId: ids.pAcme, title: 'For Ola', assigneeId: ids.ola }).expect(201);
    await upload(agents.sam, created.body.task.id, 'context.png', Buffer.from('x')).expect(201);
    await upload(agents.ola, created.body.task.id, 'reply.png', Buffer.from('x')).expect(201); // now the assignee

    await agents.sam.delete(`/api/tasks/${ids.taskId}/attachments/${added.body.attachment.id}`).expect(200);
    await agents.sam.delete(`/api/tasks/${ids.taskId}/attachments/${added.body.attachment.id}`).expect(404);
    expect(await query(`SELECT 1 FROM audit_logs WHERE action = 'task.attachment_removed'`)).toHaveLength(1);
  });

  it('at most 20 attachments per task; attachments go with their task', async () => {
    for (let i = 0; i < 20; i++) {
      await agents.sam.post(`/api/tasks/${ids.taskId}/attachments/link`).send({ url: `https://example.test/${i}` }).expect(201);
    }
    const res = await agents.sam.post(`/api/tasks/${ids.taskId}/attachments/link`).send({ url: 'https://example.test/21' }).expect(409);
    expect(res.body.code).toBe('TOO_MANY_ATTACHMENTS');
    await agents.admin.delete(`/api/tasks/${ids.taskId}`).expect(200);
    expect(await query('SELECT 1 FROM task_attachments')).toHaveLength(0);
  });

  it('a download from another task, or of a link, is a 404', async () => {
    const other = await task(ids.pInternal, ids.admin, { title: 'Other' });
    const file = await upload(agents.sam, ids.taskId, 'a.txt', Buffer.from('a')).expect(201);
    const link = await agents.sam.post(`/api/tasks/${ids.taskId}/attachments/link`).send({ url: 'https://example.test' }).expect(201);
    await agents.sam.get(`/api/tasks/${other}/attachments/${file.body.attachment.id}/download`).expect(404);
    await agents.sam.get(`/api/tasks/${ids.taskId}/attachments/${link.body.attachment.id}/download`).expect(404);
  });
});

describe('shared task links in the portal', () => {
  it("a client opens only their company's client-visible tasks by code; attachments never reach the portal", async () => {
    const shared = await task(ids.pAcme, ids.admin, { title: 'Shared with Acme', visible: true });
    const internal = await task(ids.pAcme, ids.admin, { title: 'Internal only' });
    const otherCompany = await task(await project('Globex Site', ids.admin, await company('Globex (Fake)')), ids.admin, { title: 'Globex', visible: true });
    const codeOf = async (id: string) => (await query<{ task_code: string }>('SELECT task_code FROM tasks WHERE id = $1', [id]))[0].task_code;
    await agents.admin.post(`/api/tasks/${shared}/attachments/link`).send({ url: 'https://internal.example.test/secret-report' }).expect(201);

    const res = await agents.client.get(`/api/portal/tasks/by-code/${await codeOf(shared)}`).expect(200);
    expect(res.body).toEqual({ taskId: shared, projectId: ids.pAcme });
    await agents.client.get(`/api/portal/tasks/by-code/${await codeOf(internal)}`).expect(404);
    await agents.client.get(`/api/portal/tasks/by-code/${await codeOf(otherCompany)}`).expect(404);
    await agents.client.get('/api/portal/tasks/by-code/TSK-999999').expect(404);
    await agents.sam.get(`/api/portal/tasks/by-code/${await codeOf(shared)}`).expect(403);

    const portalTasks = await agents.client.get(`/api/portal/projects/${ids.pAcme}/tasks`).expect(200);
    expect(JSON.stringify(portalTasks.body)).not.toMatch(/secret-report|attachment/i);
  });
});
