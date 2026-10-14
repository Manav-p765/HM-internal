// Leave requests: apply / edit / cancel (own, pending only), review by admin or manager (never your own),
// weekday counting, overlap, visibility of reasons. Clock injected: Wednesday 2026-10-14.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pool, query } from '../src/db.js';
import { resetClock, setClock } from '../src/services/clock.js';
import { employee, resetAll, signIn, user } from './fixtures.js';

let ids: { admin: string; managerEmp: string; empA: string; empB: string; managerUser: string };
let admin: request.Agent, manager: request.Agent, empA: request.Agent, empB: request.Agent;

// Mon 19 Oct - Fri 23 Oct 2026; Sat 24, Sun 25.
const week = { leaveType: 'casual', startDate: '2026-10-19', endDate: '2026-10-23', reason: 'Family visit (fake)' };

beforeEach(async () => {
  setClock('2026-10-14T05:00:00Z');
  await resetAll();
  const managerEmp = await employee('Morgan Manager');
  const empAId = await employee('Avery A');
  const empBId = await employee('Blake B');
  const adminId = await user('admin@example.test', 'admin');
  const managerUser = await user('manager@example.test', 'manager', { employeeId: managerEmp });
  await user('a@example.test', 'employee', { employeeId: empAId });
  await user('b@example.test', 'employee', { employeeId: empBId });
  ids = { admin: adminId, managerEmp, empA: empAId, empB: empBId, managerUser };
  admin = await signIn('admin@example.test');
  manager = await signIn('manager@example.test');
  empA = await signIn('a@example.test');
  empB = await signIn('b@example.test');
});

afterEach(() => resetClock());

afterAll(async () => {
  await pool.end();
});

const apply = (agent: request.Agent, body: object) => agent.post('/api/leaves').send(body);
async function applied(agent: request.Agent, body: object = week): Promise<string> {
  const res = await apply(agent, body).expect(201);
  return res.body.leave.id;
}
const auditActions = async () => (await query<{ action: string }>(`SELECT action FROM audit_logs WHERE action LIKE 'leave.%' ORDER BY created_at, id`)).map(r => r.action);

describe('applying', () => {
  it('creates a pending request with weekday-only total days and an audit row without the reason', async () => {
    const res = await apply(empA, week).expect(201);
    expect(res.body.leave).toMatchObject({
      employeeId: ids.empA,
      employeeName: 'Avery A',
      leaveType: 'casual',
      startDate: '2026-10-19',
      endDate: '2026-10-23',
      dayType: 'full',
      halfDayPeriod: null,
      totalDays: 5,
      status: 'pending',
      reason: 'Family visit (fake)',
      reviewedByName: null,
    });
    const [row] = await query(`SELECT metadata FROM audit_logs WHERE action = 'leave.requested'`);
    expect(row.metadata).toMatchObject({ employeeId: ids.empA, totalDays: 5, startDate: '2026-10-19' });
    expect(JSON.stringify(row.metadata)).not.toContain('Family visit');
  });

  it('counts weekdays across a weekend and refuses a weekend-only request', async () => {
    const span = await apply(empA, { ...week, startDate: '2026-10-23', endDate: '2026-10-26' }).expect(201); // Fri-Mon
    expect(span.body.leave.totalDays).toBe(2);
    const twoWeeks = await apply(empB, { ...week, startDate: '2026-10-19', endDate: '2026-11-01' }).expect(201); // Mon-Sun x2
    expect(twoWeeks.body.leave.totalDays).toBe(10);
    const weekend = await apply(empA, { ...week, startDate: '2026-10-31', endDate: '2026-11-01' }).expect(400);
    expect(weekend.body.code).toBe('VALIDATION_ERROR');
    expect((await apply(empA, { ...week, startDate: '2026-10-31', endDate: '2026-10-31', dayType: 'half', halfDayPeriod: 'first' })).status).toBe(400);
  });

  it('a half day is 0.5, needs a single date and a period', async () => {
    const half = { ...week, startDate: '2026-10-20', endDate: '2026-10-20', dayType: 'half', halfDayPeriod: 'second' };
    const res = await apply(empA, half).expect(201);
    expect(res.body.leave).toMatchObject({ dayType: 'half', halfDayPeriod: 'second', totalDays: 0.5 });
    const path = async (body: object) => (await apply(empB, body).expect(400)).body.details.map((d: { path: string }) => d.path);
    expect(await path({ ...half, endDate: '2026-10-21' })).toEqual(['endDate']);
    expect(await path({ ...half, halfDayPeriod: undefined })).toEqual(['halfDayPeriod']);
  });

  it('validates: reason required, end not before start, known leave type', async () => {
    const path = async (body: object) => (await apply(empA, body).expect(400)).body.details[0].path;
    expect(await path({ ...week, reason: '   ' })).toBe('reason');
    expect(await path({ ...week, reason: undefined })).toBe('reason');
    expect(await path({ ...week, endDate: '2026-10-18' })).toBe('endDate');
    expect(await path({ ...week, leaveType: 'vacation' })).toBe('leaveType');
    expect(await path({ ...week, startDate: '2026-02-30' })).toBe('startDate');
  });

  it('refuses an overlap with the same employee\'s pending or approved request, not with rejected/cancelled ones or other people', async () => {
    const first = await applied(empA);
    const overlap = await apply(empA, { ...week, startDate: '2026-10-23', endDate: '2026-10-27' }).expect(409);
    expect(overlap.body.code).toBe('LEAVE_OVERLAP');
    await apply(empB, week).expect(201); // someone else: fine

    await admin.post(`/api/leaves/${first}/approve`).send({}).expect(200);
    await apply(empA, { ...week, startDate: '2026-10-21', endDate: '2026-10-21', dayType: 'half', halfDayPeriod: 'first' }).expect(409);

    const other = await applied(empA, { ...week, startDate: '2026-11-02', endDate: '2026-11-03' });
    await empA.post(`/api/leaves/${other}/cancel`).expect(200);
    await apply(empA, { ...week, startDate: '2026-11-02', endDate: '2026-11-03' }).expect(201);
  });

  it('inactive employees cannot apply; managers can apply for their own leave', async () => {
    await query(`UPDATE employees SET status = 'inactive' WHERE id = $1`, [ids.empA]);
    expect((await apply(empA, week).expect(409)).body.code).toBe('EMPLOYEE_INACTIVE');
    await apply(manager, week).expect(201);
    // An admin without an employee record has nothing to apply for.
    expect((await apply(admin, week).expect(404)).body.code).toBe('NOT_LINKED');
  });
});

describe('editing and cancelling (own, pending only)', () => {
  it('edit recomputes total days, ignores its own dates for the overlap check and is audited', async () => {
    const id = await applied(empA);
    const res = await empA.patch(`/api/leaves/${id}`).send({ endDate: '2026-10-26', leaveType: 'earned' }).expect(200);
    expect(res.body.leave).toMatchObject({ endDate: '2026-10-26', leaveType: 'earned', totalDays: 6, status: 'pending' });
    const half = await empA.patch(`/api/leaves/${id}`).send({ endDate: '2026-10-19', dayType: 'half', halfDayPeriod: 'first' }).expect(200);
    expect(half.body.leave.totalDays).toBe(0.5);
    expect((await empA.patch(`/api/leaves/${id}`).send({ dayType: 'half', halfDayPeriod: null }).expect(400)).body.details[0].path).toBe('halfDayPeriod');
    expect(await auditActions()).toEqual(['leave.requested', 'leave.updated', 'leave.updated']);
  });

  it('edit cannot create an overlap with another of my requests', async () => {
    await applied(empA);
    const second = await applied(empA, { ...week, startDate: '2026-11-02', endDate: '2026-11-03' });
    expect((await empA.patch(`/api/leaves/${second}`).send({ startDate: '2026-10-22' }).expect(409)).body.code).toBe('LEAVE_OVERLAP');
  });

  it('only pending requests can be edited or cancelled', async () => {
    const id = await applied(empA);
    await manager.post(`/api/leaves/${id}/approve`).send({}).expect(200);
    expect((await empA.patch(`/api/leaves/${id}`).send({ reason: 'Changed (fake)' }).expect(409)).body.code).toBe('NOT_PENDING');
    expect((await empA.post(`/api/leaves/${id}/cancel`).expect(409)).body.code).toBe('NOT_PENDING');

    const other = await applied(empA, { ...week, startDate: '2026-11-02', endDate: '2026-11-03' });
    const cancelled = await empA.post(`/api/leaves/${other}/cancel`).expect(200);
    expect(cancelled.body.leave.status).toBe('cancelled');
    await empA.post(`/api/leaves/${other}/cancel`).expect(409);
    await empA.patch(`/api/leaves/${other}`).send({ reason: 'x' }).expect(409);
  });

  it('employee A cannot read, edit or cancel employee B\'s request (404, same as a missing id)', async () => {
    const bLeave = await applied(empB);
    const missing = await empA.get('/api/leaves/00000000-0000-4000-a000-00000000dead').expect(404);
    expect((await empA.get(`/api/leaves/${bLeave}`).expect(404)).body).toEqual(missing.body);
    await empA.patch(`/api/leaves/${bLeave}`).send({ reason: 'hijack' }).expect(404);
    await empA.post(`/api/leaves/${bLeave}/cancel`).expect(404);
    // Even an admin cannot edit or cancel someone else's request (only review it).
    await manager.patch(`/api/leaves/${bLeave}`).send({ reason: 'x' }).expect(404);
    await empA.get('/api/leaves/not-a-uuid').expect(404);
    // B still sees their own; admin and manager can read it (with the reason).
    expect((await empB.get(`/api/leaves/${bLeave}`).expect(200)).body.leave.reason).toBe('Family visit (fake)');
    expect((await admin.get(`/api/leaves/${bLeave}`).expect(200)).body.leave.reason).toBe('Family visit (fake)');
    // A's own list contains none of B's requests.
    const mine = await empA.get('/api/leaves/me').expect(200);
    expect(JSON.stringify(mine.body)).not.toContain(bLeave);
  });
});

describe('reviewing', () => {
  it('a manager approves an employee\'s request; the reviewer and time are recorded', async () => {
    const id = await applied(empA);
    const res = await manager.post(`/api/leaves/${id}/approve`).send({ comment: 'Covered (fake)' }).expect(200);
    expect(res.body.leave).toMatchObject({ status: 'approved', reviewedByName: 'Morgan Manager', reviewerComment: 'Covered (fake)', rejectionReason: null });
    expect(res.body.leave.reviewedAt).toBe('2026-10-14T05:00:00.000Z');
    // Reviewed once only.
    expect((await admin.post(`/api/leaves/${id}/reject`).send({ reason: 'Too late' }).expect(409)).body.code).toBe('NOT_PENDING');
    expect(await auditActions()).toEqual(['leave.requested', 'leave.approved']);
  });

  it('rejection needs a reason', async () => {
    const id = await applied(empA);
    expect((await admin.post(`/api/leaves/${id}/reject`).send({}).expect(400)).body.details[0].path).toBe('reason');
    expect((await admin.post(`/api/leaves/${id}/reject`).send({ reason: '  ' }).expect(400)).body.details[0].path).toBe('reason');
    const res = await admin.post(`/api/leaves/${id}/reject`).send({ reason: 'Release week (fake)' }).expect(200);
    expect(res.body.leave).toMatchObject({ status: 'rejected', rejectionReason: 'Release week (fake)', reviewedByName: 'Admin' });
  });

  it('nobody reviews their own request: the manager\'s leave needs someone else', async () => {
    const own = await applied(manager);
    const refused = await manager.post(`/api/leaves/${own}/approve`).send({}).expect(400);
    expect(refused.body.code).toBe('CANNOT_REVIEW_OWN');
    await manager.post(`/api/leaves/${own}/reject`).send({ reason: 'x' }).expect(400);
    expect((await query('SELECT status FROM leave_requests WHERE id = $1', [own]))[0].status).toBe('pending');
    await admin.post(`/api/leaves/${own}/approve`).send({}).expect(200);
  });

  it('the employee role cannot review at all (403), not even someone else\'s request', async () => {
    const id = await applied(empA);
    expect((await empB.post(`/api/leaves/${id}/approve`).send({}).expect(403)).body.code).toBe('FORBIDDEN');
    await empA.post(`/api/leaves/${id}/approve`).send({}).expect(403);
    await empA.post(`/api/leaves/${id}/reject`).send({ reason: 'x' }).expect(403);
  });

  it('cannot review a cancelled request; unknown ids are 404', async () => {
    const id = await applied(empA);
    await empA.post(`/api/leaves/${id}/cancel`).expect(200);
    await admin.post(`/api/leaves/${id}/approve`).send({}).expect(409);
    await admin.post('/api/leaves/00000000-0000-4000-a000-00000000dead/approve').send({}).expect(404);
  });
});

describe('listing', () => {
  it('admin/manager list with filters, pagination and summary; employees get their own via /me', async () => {
    const a1 = await applied(empA);
    await applied(empA, { ...week, startDate: '2026-11-02', endDate: '2026-11-03' });
    const b1 = await applied(empB, { ...week, startDate: '2026-10-14', endDate: '2026-10-14' });
    await admin.post(`/api/leaves/${b1}/approve`).send({}).expect(200);
    await admin.post(`/api/leaves/${a1}/reject`).send({ reason: 'No (fake)' }).expect(200);

    const all = await manager.get('/api/leaves').expect(200);
    expect(all.body.total).toBe(3);
    expect(all.body.summary).toEqual({ pending: 1, approved: 1, rejected: 1, cancelled: 0, onLeaveToday: 1 });
    expect((await manager.get('/api/leaves?status=pending').expect(200)).body.total).toBe(1);
    expect((await manager.get(`/api/leaves?employeeId=${ids.empB}`).expect(200)).body.leaves.map((l: { id: string }) => l.id)).toEqual([b1]);
    expect((await manager.get('/api/leaves?from=2026-10-20&to=2026-10-21').expect(200)).body.leaves.map((l: { id: string }) => l.id)).toEqual([a1]);
    expect((await manager.get('/api/leaves?search=blake').expect(200)).body.total).toBe(1);
    const page = await manager.get('/api/leaves?limit=2&offset=2').expect(200);
    expect(page.body).toMatchObject({ total: 3, limit: 2, offset: 2 });
    expect(page.body.leaves).toHaveLength(1);
    await manager.get('/api/leaves?status=maybe').expect(400);

    const mine = await empB.get('/api/leaves/me').expect(200);
    expect(mine.body.today).toBe('2026-10-14');
    expect(mine.body.leaves).toHaveLength(1);
    expect(mine.body.summary).toMatchObject({ pending: 0, approvedDaysThisYear: 1, onLeaveToday: true, upcoming: null });
  });
});
