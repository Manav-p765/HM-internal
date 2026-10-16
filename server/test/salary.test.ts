// Salaries and payslips (/api/salary). The clock is injected (services/clock.ts).
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { resetClock, setClock } from '../src/services/clock.js';
import { company, employee, resetAll, signIn, user } from './fixtures.js';

// Wednesday 2026-10-14, 09:30 IST.
const TODAY = '2026-10-14';
const T0 = new Date('2026-10-14T04:00:00Z');
const MONTH = '2026-10';

type Role = 'admin' | 'manager' | 'employee' | 'client' | 'anonymous';
let agents: Record<Role, request.Agent>;
let ids: { adminUser: string; erin: string; eli: string; morgan: string };
let eliAgent: request.Agent;

const MONEY = /^-?\d+\.\d{2}$/;

async function setEmployee(id: string, fields: { salary?: number; joining?: string; status?: string }) {
  if (fields.salary !== undefined) await query('UPDATE employees SET monthly_salary = $2 WHERE id = $1', [id, fields.salary]);
  if (fields.joining) await query('UPDATE employees SET joining_date = $2 WHERE id = $1', [id, fields.joining]);
  if (fields.status) await query('UPDATE employees SET status = $2 WHERE id = $1', [id, fields.status]);
}

// A salary row written directly (for the matrix and slip tests); months count up so rows never collide.
let monthCounter = 0;
function freshMonth(): string {
  monthCounter++;
  return `${1950 + Math.floor(monthCounter / 12)}-${String((monthCounter % 12) + 1).padStart(2, '0')}`;
}

async function salaryRow(employeeId: string, opts: { month?: string; base?: string; status?: 'pending' | 'paid'; published?: boolean } = {}) {
  const month = opts.month ?? freshMonth();
  const paid = opts.status === 'paid';
  const [row] = await query<{ id: string }>(
    `INSERT INTO salaries (employee_id, salary_month, base_salary, status, paid_on, payment_method, slip_published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      employeeId,
      `${month}-01`,
      opts.base ?? '50000.00',
      paid ? 'paid' : 'pending',
      paid ? `${month}-28` : null,
      paid ? 'Bank Transfer' : null,
      paid && opts.published ? new Date('2026-10-01T04:30:00Z') : null,
    ],
  );
  if (paid) {
    await query(
      `INSERT INTO transactions (txn_date, type, category, description, amount, payment_method, salary_id, created_by)
       VALUES ($1, 'expense', 'Salary', 'Salary (fake)', $2, 'Bank Transfer', $3, $4)`,
      [`${month}-28`, opts.base ?? '50000.00', row.id, ids.adminUser],
    );
  }
  return row.id;
}

async function lineRow(salaryId: string, kind: 'earning' | 'deduction' = 'earning', amount = '1000.00') {
  const [row] = await query<{ id: string }>(
    `INSERT INTO salary_adjustment_lines (salary_id, label, kind, amount, created_by) VALUES ($1, 'Bonus (fake)', $2, $3, $4) RETURNING id`,
    [salaryId, kind, amount, ids.adminUser],
  );
  await query(
    `UPDATE salaries SET adjustments = adjustments + CASE WHEN $2 = 'earning' THEN $3::numeric ELSE -$3::numeric END WHERE id = $1`,
    [salaryId, kind, amount],
  );
  return row.id;
}

function generate(month = MONTH) {
  return agents.admin.post('/api/salary/generate').send({ month });
}

async function erinRow(month = MONTH) {
  expect([200, 201]).toContain((await generate(month)).status);
  const [row] = await query<{ id: string }>('SELECT id FROM salaries WHERE employee_id = $1 AND salary_month = $2', [ids.erin, `${month}-01`]);
  return row.id;
}

const pay = (id: string, body: Record<string, unknown> = {}, agent: request.Agent = agents.admin) =>
  agent.post(`/api/salary/${id}/pay`).send({ paidOn: TODAY, paymentMethod: 'Bank Transfer', referenceNumber: 'UTR-FAKE-9', ...body });

const addLine = (id: string, kind: 'earning' | 'deduction', amount: string | number, label = 'Line (fake)') =>
  agents.admin.post(`/api/salary/${id}/adjustments`).send({ label, kind, amount });

async function auditRows(action: string) {
  return query<{ entity_id: string; metadata: Record<string, unknown> }>(
    'SELECT entity_id, metadata FROM audit_logs WHERE action = $1 ORDER BY created_at',
    [action],
  );
}

beforeEach(async () => {
  setClock(T0);
  await resetAll();
  await query(`UPDATE company_settings SET company_name = 'Example Studio (Fake)', company_address = '1 Fake Street'`);
  const adminUser = await user('admin@example.test', 'admin'); // not linked to an employee
  const morgan = await employee('Morgan Manager');
  const erin = await employee('Erin Employee');
  const eli = await employee('Eli Employee');
  await user('manager@example.test', 'manager', { employeeId: morgan });
  await user('erin@example.test', 'employee', { employeeId: erin });
  await user('eli@example.test', 'employee', { employeeId: eli });
  const acme = await company('Acme (Fake)');
  await user('client@acme.example.test', 'client', { clientId: acme });
  ids = { adminUser, erin, eli, morgan };
  agents = {
    admin: await signIn('admin@example.test'),
    manager: await signIn('manager@example.test'),
    employee: await signIn('erin@example.test'),
    client: await signIn('client@acme.example.test'),
    anonymous: request.agent(app),
  };
  eliAgent = await signIn('eli@example.test');
});

afterEach(() => resetClock());

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Role matrix: every route, every role. Allowed roles never get 401/403; other signed-in roles get 403,
// anonymous callers 401. Each call gets fresh rows so one role's mutation can't affect the next.
// ---------------------------------------------------------------------------
describe('role matrix', () => {
  interface Fresh {
    pending: string;
    paid: string;
    line: string;
    erinSlip: string; // Erin's paid + published slip
    morganSlip: string; // the manager's own published slip
  }
  async function fresh(): Promise<Fresh> {
    const pending = await salaryRow(ids.eli);
    const line = await lineRow(pending);
    return {
      pending,
      line,
      paid: await salaryRow(ids.eli, { status: 'paid' }),
      erinSlip: await salaryRow(ids.erin, { status: 'paid', published: true }),
      morganSlip: await salaryRow(ids.morgan, { status: 'paid', published: true }),
    };
  }
  const ADMIN: Role[] = ['admin'];
  // The admin's login is not linked to an employee, so it has no slips of its own (403 NOT_LINKED).
  const routes: { name: string; method: 'get' | 'post' | 'patch' | 'delete'; path: (f: Fresh, role: Role) => string; allowed: Role[]; body?: object }[] = [
    { name: 'GET /salary', method: 'get', path: () => `/api/salary?month=${MONTH}`, allowed: ADMIN },
    { name: 'POST /salary/generate', method: 'post', path: () => '/api/salary/generate', allowed: ADMIN, body: { month: MONTH } },
    { name: 'GET /salary/:id', method: 'get', path: f => `/api/salary/${f.pending}`, allowed: ADMIN },
    { name: 'PATCH /salary/:id', method: 'patch', path: f => `/api/salary/${f.pending}`, allowed: ADMIN, body: { notes: 'x' } },
    { name: 'POST /salary/:id/adjustments', method: 'post', path: f => `/api/salary/${f.pending}/adjustments`, allowed: ADMIN, body: { label: 'Bonus', kind: 'earning', amount: '10' } },
    { name: 'DELETE /salary/:id/adjustments/:lineId', method: 'delete', path: f => `/api/salary/${f.pending}/adjustments/${f.line}`, allowed: ADMIN },
    { name: 'POST /salary/:id/pay', method: 'post', path: f => `/api/salary/${f.pending}/pay`, allowed: ADMIN, body: { paidOn: TODAY, paymentMethod: 'UPI' } },
    { name: 'POST /salary/:id/unpay', method: 'post', path: f => `/api/salary/${f.paid}/unpay`, allowed: ADMIN, body: { reason: 'Wrong account (fake)' } },
    { name: 'POST /salary/:id/publish-slip', method: 'post', path: f => `/api/salary/${f.paid}/publish-slip`, allowed: ADMIN },
    { name: 'POST /salary/:id/unpublish-slip', method: 'post', path: f => `/api/salary/${f.paid}/unpublish-slip`, allowed: ADMIN },
    { name: 'GET /salary/slips/me', method: 'get', path: () => '/api/salary/slips/me', allowed: ['employee', 'manager'] },
    {
      name: 'GET /salary/slips/me/:id',
      method: 'get',
      path: (f, role) => `/api/salary/slips/me/${role === 'manager' ? f.morganSlip : f.erinSlip}`,
      allowed: ['employee', 'manager'],
    },
  ];
  const roles: Role[] = ['admin', 'manager', 'employee', 'client', 'anonymous'];

  for (const route of routes) {
    it(route.name, async () => {
      for (const role of roles) {
        const f = await fresh();
        const res = await agents[role][route.method](route.path(f, role)).send(route.body ?? {});
        const label = `${route.name} as ${role} -> ${res.status} ${JSON.stringify(res.body)}`;
        if (route.allowed.includes(role)) {
          expect([401, 403], label).not.toContain(res.status);
          expect(res.status, label).toBeLessThan(500);
        } else {
          expect(res.status, label).toBe(role === 'anonymous' ? 401 : 403);
        }
      }
    });
  }

  it('the allowed calls actually succeed', async () => {
    const f = await fresh();
    await agents.admin.get(`/api/salary?month=${MONTH}`).expect(200);
    await agents.admin.get(`/api/salary/${f.pending}`).expect(200);
    await agents.admin.patch(`/api/salary/${f.pending}`).send({ notes: 'ok' }).expect(200);
    await addLine(f.pending, 'earning', '10').expect(201);
    await agents.admin.delete(`/api/salary/${f.pending}/adjustments/${f.line}`).expect(200);
    await pay(f.pending).expect(200);
    await agents.admin.post(`/api/salary/${f.paid}/publish-slip`).expect(200);
    await agents.admin.post(`/api/salary/${f.paid}/unpublish-slip`).expect(200);
    await agents.admin.post(`/api/salary/${f.paid}/unpay`).send({ reason: 'x' }).expect(200);
    await agents.employee.get('/api/salary/slips/me').expect(200);
    await agents.employee.get(`/api/salary/slips/me/${f.erinSlip}`).expect(200);
    await agents.manager.get(`/api/salary/slips/me/${f.morganSlip}`).expect(200);
    // An admin without an employee record has no slips: 403, not someone else's data.
    expect((await agents.admin.get('/api/salary/slips/me').expect(403)).body.code).toBe('NOT_LINKED');
  });
});

// ---------------------------------------------------------------------------
// Generating a run
// ---------------------------------------------------------------------------
describe('generate', () => {
  it('creates rows for eligible employees only, snapshotting the salary; a second run is a no-op', async () => {
    await setEmployee(ids.eli, { salary: 70000.5 });
    const inactive = await employee('Ina Inactive', 'inactive');
    const unpaid = await employee('Zero Salary');
    await setEmployee(unpaid, { salary: 0 });
    const future = await employee('Future Joiner');
    await setEmployee(future, { joining: '2026-11-01' });
    const lastDay = await employee('Joins Last Day');
    await setEmployee(lastDay, { joining: '2026-10-31' });
    const onLeave = await employee('On Leave', 'on_leave');

    const first = await generate().expect(201);
    expect(first.body).toEqual({ month: MONTH, created: 5, skipped: 0 });
    const rows = await query<{ employee_id: string; base: string; adjustments: string; status: string }>(
      `SELECT employee_id, base_salary::text AS base, adjustments::text AS adjustments, status FROM salaries WHERE salary_month = '2026-10-01'`,
    );
    expect(rows.map(r => r.employee_id).sort()).toEqual([ids.morgan, ids.erin, ids.eli, lastDay, onLeave].sort());
    expect(rows.map(r => r.employee_id)).not.toContain(inactive);
    expect(rows.map(r => r.employee_id)).not.toContain(unpaid);
    expect(rows.map(r => r.employee_id)).not.toContain(future);
    expect(rows.find(r => r.employee_id === ids.eli)).toMatchObject({ base: '70000.50', adjustments: '0.00', status: 'pending' });

    // Idempotent: nothing new, existing rows (and their edits) untouched.
    const erinId = (await query<{ id: string }>('SELECT id FROM salaries WHERE employee_id = $1', [ids.erin]))[0].id;
    await addLine(erinId, 'earning', '500').expect(201);
    const second = await generate().expect(200);
    expect(second.body).toEqual({ month: MONTH, created: 0, skipped: 5 });
    expect((await query('SELECT 1 FROM salaries')).length).toBe(5);
    expect((await agents.admin.get(`/api/salary/${erinId}`)).body.salary.adjustments).toBe('500.00');

    // A new joiner later in the month is picked up by the next run; nothing else changes.
    const late = await employee('Late Hire');
    await setEmployee(late, { joining: '2026-10-20' });
    expect((await generate().expect(201)).body).toEqual({ month: MONTH, created: 1, skipped: 5 });

    expect((await auditRows('salary.generated')).map(r => r.metadata)).toEqual([
      { month: MONTH, created: 5, skipped: 0 },
      { month: MONTH, created: 0, skipped: 5 },
      { month: MONTH, created: 1, skipped: 5 },
    ]);
  });

  it('the snapshot does not change when the employee salary is edited later', async () => {
    const id = await erinRow();
    await agents.admin.patch(`/api/employees/${ids.erin}`).send({ monthlySalary: 99999 }).expect(200);
    const res = await agents.admin.get(`/api/salary/${id}`).expect(200);
    expect(res.body.salary).toMatchObject({ baseSalary: '50000.00', netPayable: '50000.00' });
    // The next month uses the new salary.
    await generate('2026-11').expect(201);
    const [nov] = await query<{ base: string }>(`SELECT base_salary::text AS base FROM salaries WHERE employee_id = $1 AND salary_month = '2026-11-01'`, [ids.erin]);
    expect(nov.base).toBe('99999.00');
  });

  it('refuses months more than one month ahead and validates the month', async () => {
    await generate('2026-11').expect(201); // next month: allowed
    const tooFar = await generate('2026-12').expect(400);
    expect(tooFar.body.details[0].path).toBe('month');
    for (const month of ['2026-13', '2026-1', 'October', '', undefined]) {
      const res = await agents.admin.post('/api/salary/generate').send({ month }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    await agents.admin.post('/api/salary/generate').send({ month: MONTH, extra: 1 }).expect(400);
  });
});

// ---------------------------------------------------------------------------
// The month list
// ---------------------------------------------------------------------------
describe('list', () => {
  it('lists the month with employee details, amounts as 2-decimal strings, unpaid leave days and a summary', async () => {
    await generate().expect(201);
    const [erin] = await query<{ id: string }>(`SELECT id FROM salaries WHERE employee_id = $1`, [ids.erin]);
    await addLine(erin.id, 'deduction', '1500.25').expect(201);
    const [eli] = await query<{ id: string }>(`SELECT id FROM salaries WHERE employee_id = $1`, [ids.eli]);
    await pay(eli.id).expect(200);
    // Approved unpaid leave: Tue 2026-09-29 .. Fri 2026-10-02 (2 weekdays in October), a half day on Mon
    // 2026-10-05, and pending / sick leave which don't count.
    const leave = (employeeId: string, type: string, start: string, end: string, status: string, day = 'full') =>
      query(
        `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, day_type, half_day_period, total_days, reason, status, reviewed_by, reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, 1, 'Fake reason', $7, $8, $9)`,
        [employeeId, type, start, end, day, day === 'half' ? 'first' : null, status, status === 'approved' ? ids.adminUser : null, status === 'approved' ? T0 : null],
      );
    await leave(ids.erin, 'unpaid', '2026-09-29', '2026-10-02', 'approved');
    await leave(ids.erin, 'unpaid', '2026-10-05', '2026-10-05', 'approved', 'half');
    await leave(ids.erin, 'unpaid', '2026-10-06', '2026-10-06', 'pending');
    await leave(ids.erin, 'sick', '2026-10-07', '2026-10-07', 'approved');

    const res = await agents.admin.get(`/api/salary?month=${MONTH}`).expect(200);
    expect(res.body).toMatchObject({ today: TODAY, month: MONTH, canGenerate: true });
    expect(res.body.salaries).toHaveLength(3);
    const erinRowRes = res.body.salaries.find((s: { employeeId: string }) => s.employeeId === ids.erin);
    expect(erinRowRes).toMatchObject({
      employeeName: 'Erin Employee',
      department: 'Engineering',
      month: MONTH,
      baseSalary: '50000.00',
      adjustments: '-1500.25',
      netPayable: '48499.75',
      status: 'pending',
      paidOn: null,
      slipPublished: false,
      unpaidLeaveDays: 2.5,
      lineCount: 1,
    });
    expect(erinRowRes.employeeCode).toMatch(/^EMP-/);
    for (const row of res.body.salaries) {
      for (const key of ['baseSalary', 'adjustments', 'netPayable']) expect(row[key]).toMatch(MONEY);
    }
    expect(res.body.summary).toEqual({
      totalPayable: '148499.75',
      totalPaid: '50000.00',
      totalPending: '98499.75',
      headcount: 3,
      paidCount: 1,
    });
    // Another month is empty; the default month is the current one (IST).
    expect((await agents.admin.get('/api/salary?month=2026-09').expect(200)).body.salaries).toEqual([]);
    expect((await agents.admin.get('/api/salary').expect(200)).body.month).toBe(MONTH);
    expect((await agents.admin.get('/api/salary?month=2027-01').expect(200)).body.canGenerate).toBe(false);
    await agents.admin.get('/api/salary?month=2026-1').expect(400);
  });
});

// ---------------------------------------------------------------------------
// Adjustments and edits
// ---------------------------------------------------------------------------
describe('adjustments and edits', () => {
  it('lines recalculate adjustments and net; a negative net is rejected and writes nothing', async () => {
    const id = await erinRow();
    const bonus = await addLine(id, 'earning', '2500', 'Festival bonus (fake)').expect(201);
    expect(bonus.body.salary).toMatchObject({ baseSalary: '50000.00', adjustments: '2500.00', netPayable: '52500.00' });
    const ded = await addLine(id, 'deduction', '0.10', 'Rounding (fake)').expect(201);
    expect(ded.body.salary).toMatchObject({ adjustments: '2499.90', netPayable: '52499.90' });
    expect(ded.body.salary.lines.map((l: { label: string; kind: string; amount: string }) => [l.label, l.kind, l.amount])).toEqual([
      ['Festival bonus (fake)', 'earning', '2500.00'],
      ['Rounding (fake)', 'deduction', '0.10'],
    ]);

    // A deduction larger than base + earnings: 409, nothing written.
    const tooBig = await addLine(id, 'deduction', '52500.00').expect(409);
    expect(tooBig.body.code).toBe('NEGATIVE_NET');
    expect((await query('SELECT 1 FROM salary_adjustment_lines WHERE salary_id = $1', [id])).length).toBe(2);
    // Exactly zero is allowed.
    const zero = await addLine(id, 'deduction', '52499.90').expect(201);
    expect(zero.body.salary.netPayable).toBe('0.00');
    // ...and now removing the bonus would go negative.
    const bonusLine = zero.body.salary.lines.find((l: { label: string }) => l.label === 'Festival bonus (fake)');
    expect((await agents.admin.delete(`/api/salary/${id}/adjustments/${bonusLine.id}`).expect(409)).body.code).toBe('NEGATIVE_NET');
    const zeroLine = zero.body.salary.lines.find((l: { amount: string }) => l.amount === '52499.90');
    const removed = await agents.admin.delete(`/api/salary/${id}/adjustments/${zeroLine.id}`).expect(200);
    expect(removed.body.salary).toMatchObject({ adjustments: '2499.90', netPayable: '52499.90' });

    // A base override below the deductions is rejected too.
    await addLine(id, 'deduction', '40000').expect(201);
    expect((await agents.admin.patch(`/api/salary/${id}`).send({ baseSalary: '30000', reason: 'x' }).expect(409)).body.code).toBe('NEGATIVE_NET');

    // The stored sum always matches the lines.
    const [check] = await query<{ stored: string; lines: string }>(
      `SELECT s.adjustments::text AS stored,
              (SELECT sum(CASE WHEN kind = 'earning' THEN amount ELSE -amount END) FROM salary_adjustment_lines WHERE salary_id = s.id)::text AS lines
         FROM salaries s WHERE id = $1`,
      [id],
    );
    expect(check.stored).toBe(check.lines);

    const added = await auditRows('salary.adjustment_added');
    expect(added).toHaveLength(4);
    expect(added[0].metadata).toEqual({ month: MONTH, employeeId: ids.erin, lineId: expect.any(String), kind: 'earning' });
    expect((await auditRows('salary.adjustment_removed'))[0].metadata).toMatchObject({ month: MONTH, lineId: zeroLine.id, kind: 'deduction' });
  });

  it('PATCH: notes, and a base override that needs a reason (in the audit, without the amount)', async () => {
    const id = await erinRow();
    const noReason = await agents.admin.patch(`/api/salary/${id}`).send({ baseSalary: '55000' }).expect(400);
    expect(noReason.body.details.map((d: { path: string }) => d.path)).toContain('reason');
    const res = await agents.admin
      .patch(`/api/salary/${id}`)
      .send({ baseSalary: '55000', reason: 'Increment effective this month (fake)', notes: 'Checked' })
      .expect(200);
    expect(res.body.salary).toMatchObject({ baseSalary: '55000.00', netPayable: '55000.00', notes: 'Checked' });
    const [row] = await auditRows('salary.updated');
    expect(row.metadata).toEqual({ month: MONTH, employeeId: ids.erin, fields: ['notes', 'baseSalary'], reason: 'Increment effective this month (fake)' });
    expect(JSON.stringify(row.metadata)).not.toContain('55000');
    await agents.admin.patch(`/api/salary/${id}`).send({}).expect(400);
    await agents.admin.patch(`/api/salary/${id}`).send({ status: 'paid' }).expect(400);
  });

  it('validation errors name the field', async () => {
    const id = await erinRow();
    const bad = async (body: object, path: string) => {
      const res = await agents.admin.post(`/api/salary/${id}/adjustments`).send({ label: 'L', kind: 'earning', amount: '10', ...body }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(path);
    };
    await bad({ amount: 0 }, 'amount');
    await bad({ amount: '-5' }, 'amount');
    await bad({ amount: '1.001' }, 'amount');
    await bad({ amount: 'ten' }, 'amount');
    await bad({ kind: 'bonus' }, 'kind');
    await bad({ label: '  ' }, 'label');
    await bad({ label: 'x'.repeat(201) }, 'label');
    const payBad = async (body: Record<string, unknown>, path: string) => {
      const res = await pay(id, body).expect(400);
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(path);
    };
    await payBad({ paymentMethod: 'Bitcoin' }, 'paymentMethod');
    await payBad({ paidOn: '2026-10-15' }, 'paidOn'); // tomorrow
    await payBad({ paidOn: '2026-09-30' }, 'paidOn'); // before the salary month
    await payBad({ paidOn: '2026-02-30' }, 'paidOn');
    expect((await agents.admin.post(`/api/salary/${id}/unpay`).send({ reason: '' }).expect(400)).body.details[0].path).toBe('reason');
  });

  it('invalid and unknown ids are 404', async () => {
    const id = await erinRow();
    await agents.admin.get('/api/salary/not-a-uuid').expect(404);
    await agents.admin.get('/api/salary/00000000-0000-4000-a000-00000000dead').expect(404);
    await pay('00000000-0000-4000-a000-00000000dead').expect(404);
    await agents.admin.delete(`/api/salary/${id}/adjustments/00000000-0000-4000-a000-00000000dead`).expect(404);
    await agents.admin.delete(`/api/salary/${id}/adjustments/nope`).expect(404);
    // A line of another salary can't be removed through this one.
    const other = await salaryRow(ids.eli);
    const otherLine = await lineRow(other);
    await agents.admin.delete(`/api/salary/${id}/adjustments/${otherLine}`).expect(404);
  });
});

// ---------------------------------------------------------------------------
// Paying, un-paying, slips
// ---------------------------------------------------------------------------
describe('pay / unpay / publish', () => {
  it('pay creates exactly one expense transaction for the net, locks the row; a second pay is a 409', async () => {
    const id = await erinRow();
    await addLine(id, 'earning', '1000.50').expect(201);
    const res = await pay(id).expect(200);
    expect(res.body.salary).toMatchObject({ status: 'paid', paidOn: TODAY, paymentMethod: 'Bank Transfer', netPayable: '51000.50', referenceNumber: 'UTR-FAKE-9' });
    const txns = await query(
      `SELECT type, category, amount::text AS amount, txn_date AS "txnDate", salary_id AS "salaryId", invoice_id AS "invoiceId",
              created_by AS "createdBy", payment_method AS "paymentMethod", reference_number AS "referenceNumber", reversed_at AS "reversedAt"
         FROM transactions`,
    );
    expect(txns).toEqual([
      {
        type: 'expense',
        category: 'Salary',
        amount: '51000.50',
        txnDate: TODAY,
        salaryId: id,
        invoiceId: null,
        createdBy: ids.adminUser,
        paymentMethod: 'Bank Transfer',
        referenceNumber: 'UTR-FAKE-9',
        reversedAt: null,
      },
    ]);
    expect(res.body.salary.transactionId).toEqual(expect.any(String));

    expect((await pay(id).expect(409)).body.code).toBe('ALREADY_PAID');
    // Concurrent pays on another row: exactly one wins.
    const [eli] = await query<{ id: string }>(`SELECT id FROM salaries WHERE employee_id = $1`, [ids.eli]);
    const results = await Promise.all([pay(eli.id), pay(eli.id), pay(eli.id)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409, 409]);
    expect((await query('SELECT 1 FROM transactions WHERE salary_id = $1', [eli.id])).length).toBe(1);

    // Paid rows are locked.
    expect((await addLine(id, 'earning', '1').expect(409)).body.code).toBe('SALARY_LOCKED');
    const lineId = res.body.salary.lines[0].id;
    expect((await agents.admin.delete(`/api/salary/${id}/adjustments/${lineId}`).expect(409)).body.code).toBe('SALARY_LOCKED');
    expect((await agents.admin.patch(`/api/salary/${id}`).send({ notes: 'x' }).expect(409)).body.code).toBe('SALARY_LOCKED');

    const [audited] = await auditRows('salary.paid');
    expect(audited.metadata).toEqual({ month: MONTH, employeeId: ids.erin, transactionId: res.body.salary.transactionId, from: 'pending', to: 'paid' });
  });

  it('a zero net cannot be paid', async () => {
    const id = await erinRow();
    await addLine(id, 'deduction', '50000').expect(201);
    expect((await pay(id).expect(409)).body.code).toBe('NOTHING_TO_PAY');
    expect((await query('SELECT 1 FROM transactions')).length).toBe(0);
  });

  it('unpay marks the expense reversed, returns to pending and clears the paid date and slip; it can be paid again', async () => {
    const id = await erinRow();
    const paid = await pay(id).expect(200);
    await agents.admin.post(`/api/salary/${id}/publish-slip`).expect(200);
    const res = await agents.admin.post(`/api/salary/${id}/unpay`).send({ reason: 'Paid to the wrong account (fake)' }).expect(200);
    expect(res.body.salary).toMatchObject({ status: 'pending', paidOn: null, paymentMethod: null, slipPublished: false, slipPublishedAt: null, transactionId: null });
    const [txn] = await query<{ id: string; reversed_at: Date; reversed_by: string; reverse_reason: string }>(
      'SELECT id, reversed_at, reversed_by, reverse_reason FROM transactions WHERE salary_id = $1',
      [id],
    );
    expect(txn).toEqual({ id: paid.body.salary.transactionId, reversed_at: T0, reversed_by: ids.adminUser, reverse_reason: 'Paid to the wrong account (fake)' });
    expect((await agents.admin.post(`/api/salary/${id}/unpay`).send({ reason: 'again' }).expect(409)).body.code).toBe('INVALID_STATUS');
    expect((await auditRows('salary.unpaid'))[0].metadata).toEqual({ month: MONTH, employeeId: ids.erin, transactionId: txn.id, from: 'paid', to: 'pending' });

    // Editable again, and payable again: a second live expense row, the reversed one kept.
    await addLine(id, 'earning', '100').expect(201);
    await pay(id).expect(200);
    const rows = await query<{ amount: string; live: boolean }>(
      'SELECT amount::text AS amount, reversed_at IS NULL AS live FROM transactions WHERE salary_id = $1 ORDER BY created_at',
      [id],
    );
    expect(rows).toEqual([
      { amount: '50000.00', live: false },
      { amount: '50100.00', live: true },
    ]);
  });

  it('a slip can only be published while paid', async () => {
    const id = await erinRow();
    expect((await agents.admin.post(`/api/salary/${id}/publish-slip`).expect(409)).body.code).toBe('NOT_PAID');
    await pay(id).expect(200);
    const published = await agents.admin.post(`/api/salary/${id}/publish-slip`).expect(200);
    expect(published.body.salary).toMatchObject({ slipPublished: true, slipPublishedAt: T0.toISOString() });
    const unpublished = await agents.admin.post(`/api/salary/${id}/unpublish-slip`).expect(200);
    expect(unpublished.body.salary.slipPublished).toBe(false);
    expect((await auditRows('salary.slip_published')).map(r => r.metadata)).toEqual([{ month: MONTH, employeeId: ids.erin }]);
    expect(await auditRows('salary.slip_unpublished')).toHaveLength(1);
  });

  it('no audit row for salary mutations contains an amount', async () => {
    const id = await erinRow();
    await addLine(id, 'earning', '1234.56').expect(201);
    await agents.admin.patch(`/api/salary/${id}`).send({ baseSalary: '43210.98', reason: 'Fake reason' }).expect(200);
    await pay(id).expect(200);
    await agents.admin.post(`/api/salary/${id}/publish-slip`).expect(200);
    await agents.admin.post(`/api/salary/${id}/unpay`).send({ reason: 'Fake' }).expect(200);
    const rows = await query<{ metadata: unknown }>(`SELECT metadata FROM audit_logs WHERE action LIKE 'salary.%'`);
    expect(rows.length).toBeGreaterThanOrEqual(6);
    const text = JSON.stringify(rows);
    for (const amount of ['1234.56', '43210.98', '44445.54', '50000']) expect(text).not.toContain(amount);
  });
});

// ---------------------------------------------------------------------------
// Employee slips
// ---------------------------------------------------------------------------
describe('employee slips', () => {
  it('an employee reads their own published slips, with exactly the slip fields', async () => {
    const id = await erinRow();
    await addLine(id, 'earning', '2500', 'Festival bonus (fake)').expect(201);
    await addLine(id, 'deduction', '500', 'Advance recovery (fake)').expect(201);
    await pay(id, { paymentMethod: 'UPI' }).expect(200);
    await agents.admin.post(`/api/salary/${id}/publish-slip`).expect(200);
    const older = await salaryRow(ids.erin, { month: '2026-08', status: 'paid', published: true });

    const list = await agents.employee.get('/api/salary/slips/me').expect(200);
    expect(list.body.slips).toEqual([
      { id, month: MONTH, netPayable: '52000.00', paidOn: TODAY },
      { id: older, month: '2026-08', netPayable: '50000.00', paidOn: '2026-08-28' },
    ]);

    const res = await agents.employee.get(`/api/salary/slips/me/${id}`).expect(200);
    const slip = res.body.slip;
    expect(Object.keys(res.body)).toEqual(['slip']);
    expect(Object.keys(slip).sort()).toEqual(
      ['adjustments', 'baseSalary', 'company', 'employee', 'id', 'lines', 'month', 'netPayable', 'paidOn', 'paymentMethod', 'publishedAt'].sort(),
    );
    expect(Object.keys(slip.employee).sort()).toEqual(['code', 'department', 'designation', 'name']);
    expect(Object.keys(slip.company).sort()).toEqual(['address', 'name']);
    for (const line of slip.lines) expect(Object.keys(line).sort()).toEqual(['amount', 'kind', 'label']);
    expect(slip).toMatchObject({
      id,
      month: MONTH,
      employee: { name: 'Erin Employee', department: 'Engineering', designation: 'Engineer' },
      company: { name: 'Example Studio (Fake)', address: '1 Fake Street' },
      baseSalary: '50000.00',
      adjustments: '2000.00',
      netPayable: '52000.00',
      paidOn: TODAY,
      paymentMethod: 'UPI',
      lines: [
        { label: 'Festival bonus (fake)', kind: 'earning', amount: '2500.00' },
        { label: 'Advance recovery (fake)', kind: 'deduction', amount: '500.00' },
      ],
    });
    for (const key of ['baseSalary', 'adjustments', 'netPayable']) expect(slip[key]).toMatch(MONEY);
    // Nothing internal or about anyone else.
    const text = JSON.stringify(res.body);
    for (const leak of ['employeeId', 'notes', 'transactionId', 'createdBy', 'Eli', 'Morgan', 'status']) expect(text).not.toContain(leak);
  });

  it('another employee’s slip and an own unpublished slip are 404s identical to a missing id', async () => {
    const eliSlip = await salaryRow(ids.eli, { status: 'paid', published: true });
    const erinUnpublished = await salaryRow(ids.erin, { status: 'paid' });
    const erinPending = await salaryRow(ids.erin);
    const missing = await agents.employee.get('/api/salary/slips/me/00000000-0000-4000-a000-00000000dead').expect(404);
    for (const id of [eliSlip, erinUnpublished, erinPending]) {
      const res = await agents.employee.get(`/api/salary/slips/me/${id}`).expect(404);
      expect(res.body).toEqual(missing.body);
    }
    await agents.employee.get('/api/salary/slips/me/not-a-uuid').expect(404);
    expect((await agents.employee.get('/api/salary/slips/me').expect(200)).body.slips).toEqual([]);
    // Eli sees his own.
    expect((await eliAgent.get('/api/salary/slips/me').expect(200)).body.slips.map((s: { id: string }) => s.id)).toEqual([eliSlip]);
    // Employees can't reach the admin routes for any row, their own included.
    await agents.employee.get(`/api/salary/${erinPending}`).expect(403);
    await agents.employee.get(`/api/salary?month=${MONTH}`).expect(403);
  });

  it('un-paying removes the slip from the employee view', async () => {
    const id = await erinRow();
    await pay(id).expect(200);
    await agents.admin.post(`/api/salary/${id}/publish-slip`).expect(200);
    await agents.employee.get(`/api/salary/slips/me/${id}`).expect(200);
    await agents.admin.post(`/api/salary/${id}/unpay`).send({ reason: 'Fake' }).expect(200);
    await agents.employee.get(`/api/salary/slips/me/${id}`).expect(404);
    expect((await agents.employee.get('/api/salary/slips/me').expect(200)).body.slips).toEqual([]);
  });

  it('a manager linked to an employee reads only their own slips and nothing else under /api/salary', async () => {
    const mine = await salaryRow(ids.morgan, { status: 'paid', published: true });
    const erins = await salaryRow(ids.erin, { status: 'paid', published: true });
    expect((await agents.manager.get('/api/salary/slips/me').expect(200)).body.slips.map((s: { id: string }) => s.id)).toEqual([mine]);
    await agents.manager.get(`/api/salary/slips/me/${erins}`).expect(404);
    await agents.manager.get(`/api/salary?month=${MONTH}`).expect(403);
    await pay(erins, {}, agents.manager).expect(403);
  });
});

// ---------------------------------------------------------------------------
// Nobody changes their own salary row (400 CANNOT_MODIFY_OWN); another admin can.
// ---------------------------------------------------------------------------
describe('own salary row', () => {
  let selfAdmin: request.Agent;
  let pending: string;
  let paid: string;

  beforeEach(async () => {
    const ada = await employee('Ada Admin');
    await user('ada@example.test', 'admin', { employeeId: ada });
    selfAdmin = await signIn('ada@example.test');
    pending = await salaryRow(ada);
    paid = await salaryRow(ada, { status: 'paid' });
  });

  it('refuses every change by the linked admin with 400 CANNOT_MODIFY_OWN', async () => {
    const lineId = await lineRow(pending);
    const attempts: [string, () => request.Test][] = [
      ['edit notes', () => selfAdmin.patch(`/api/salary/${pending}`).send({ notes: 'Me (fake)' })],
      ['edit base', () => selfAdmin.patch(`/api/salary/${pending}`).send({ baseSalary: '90000', reason: 'Raise (fake)' })],
      ['add line', () => selfAdmin.post(`/api/salary/${pending}/adjustments`).send({ label: 'Bonus', kind: 'earning', amount: '5000' })],
      ['remove line', () => selfAdmin.delete(`/api/salary/${pending}/adjustments/${lineId}`)],
      ['pay', () => pay(pending, {}, selfAdmin)],
      ['unpay', () => selfAdmin.post(`/api/salary/${paid}/unpay`).send({ reason: 'Mistake (fake)' })],
      ['publish slip', () => selfAdmin.post(`/api/salary/${paid}/publish-slip`).send({})],
      ['unpublish slip', () => selfAdmin.post(`/api/salary/${paid}/unpublish-slip`).send({})],
    ];
    for (const [name, attempt] of attempts) {
      const res = await attempt();
      expect(res.status, name).toBe(400);
      expect(res.body.code, name).toBe('CANNOT_MODIFY_OWN');
      expect(res.body.error ?? res.body.message, name).toMatch(/own salary/);
    }
    const [row] = await query<{ status: string; notes: string | null; base: string; adjustments: string }>(
      'SELECT status, notes, base_salary::text AS base, adjustments::text AS adjustments FROM salaries WHERE id = $1',
      [pending],
    );
    expect(row).toEqual({ status: 'pending', notes: null, base: '50000.00', adjustments: '1000.00' });
    expect(await auditRows('salary.paid')).toHaveLength(0);
  });

  it('a missing id is still 404 for the linked admin, and they can still read the list', async () => {
    await selfAdmin.post('/api/salary/00000000-0000-4000-8000-000000000000/pay').send({ paidOn: TODAY, paymentMethod: 'Cash' }).expect(404);
    await selfAdmin.get(`/api/salary/${pending}`).expect(200);
  });

  it('another admin can change the same row', async () => {
    await agents.admin.patch(`/api/salary/${pending}`).send({ notes: 'By someone else (fake)' }).expect(200);
    await addLine(pending, 'earning', '500').expect(201);
    await pay(pending).expect(200);
    await agents.admin.post(`/api/salary/${pending}/publish-slip`).send({}).expect(200);
    await agents.admin.post(`/api/salary/${paid}/unpay`).send({ reason: 'Mistake (fake)' }).expect(200);
  });

  it('the linked admin can change other employees’ salaries', async () => {
    const row = await salaryRow(ids.erin);
    await selfAdmin.patch(`/api/salary/${row}`).send({ notes: 'Fine (fake)' }).expect(200);
  });
});
