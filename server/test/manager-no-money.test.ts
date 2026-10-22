// Managers see no money. Every GET route a manager may call (taken from the routes actually registered, so a
// new one is covered automatically) is called with real data: an employee with a salary, a client with a
// sent, part-paid invoice, a project, a task, attendance and a leave. No response may contain a money-ish
// key or a decimal amount. A manager's own payslips (GET /api/salary/slips/me...) are their own pay, like an
// employee's, and are the only exception. Money routes themselves are 403 (see route-matrix.test.ts).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pool, query } from '../src/db.js';
import { mountedRouters } from '../src/middleware/access.js';
import { company, employee, member, project, resetAll, signIn, task, user } from './fixtures.js';

const OWN_PAY = new Set(['GET /api/salary/slips/me', 'GET /api/salary/slips/me/:id']);

// Keys that carry money, and any string that looks like a decimal amount ("45000.00"). A GSTIN is a tax
// registration id (managers keep client records), not an amount, so "gstin" is allowed.
const MONEY_KEY = /amount|salary|payroll|balance|budget|cost|price|invoice|payment|paid|gst(?!in)|tax|bank|revenue|income|expense|billing|outstanding|collected|net/i;
const AMOUNT = /^-?\d+\.\d{2}$/;

function moneyIn(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => moneyIn(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [...(MONEY_KEY.test(k) ? [`${path}.${k}`] : []), ...moneyIn(v, `${path}.${k}`)]);
  }
  return typeof value === 'string' && AMOUNT.test(value) ? [`${path} = ${value}`] : [];
}

function managerGetRoutes(): string[] {
  const keys: string[] = [];
  for (const [prefix, router] of mountedRouters) {
    for (const r of router.routes) {
      const allowed = r.access === 'session' || (Array.isArray(r.access) && r.access.includes('manager'));
      if (r.method === 'get' && allowed) keys.push(`/api${prefix === '/' ? '' : prefix}${r.path === '/' && prefix !== '/' ? '' : r.path}`);
    }
  }
  return keys;
}

let manager: request.Agent;
let params: Record<string, string>;

beforeAll(async () => {
  await resetAll();
  await query('TRUNCATE invoices, transactions, salaries CASCADE');
  const admin = await user('admin@example.test', 'admin');
  const managerEmp = await employee('Morgan Manager');
  await user('manager@example.test', 'manager', { employeeId: managerEmp });
  const emp = await employee('Avery A');
  await query(`UPDATE employees SET monthly_salary = 45000, payment_method = 'Bank Transfer' WHERE id = $1`, [emp]);
  await user('a@example.test', 'employee', { employeeId: emp });
  const acme = await company('Acme (Fake)');
  const proj = await project('Acme Site', admin, acme);
  await member(proj, emp);
  const t = await task(proj, admin, { assignee: emp, visible: true });

  // A sent invoice with a part payment, so totals and balances exist to leak.
  const adminAgent = await signIn('admin@example.test');
  const inv = await adminAgent
    .post('/api/invoices')
    .send({ clientId: acme, dueDate: '2099-01-01', items: [{ description: 'Design (fake)', quantity: '1', unitPrice: '1000.00' }] })
    .expect(201);
  await adminAgent.post(`/api/invoices/${inv.body.invoice.id}/send`).expect(200);
  await signIn('a@example.test'); // automatic punch-in: today's attendance row
  const [leave] = await query<{ id: string }>(
    `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, day_type, total_days, reason, status)
     VALUES ($1, 'casual', '2099-01-05', '2099-01-05', 'full', 1, 'Fake reason', 'pending') RETURNING id`,
    [emp],
  );
  const [record] = await query<{ work_date: string }>('SELECT work_date FROM attendance_records WHERE employee_id = $1', [emp]);

  manager = await signIn('manager@example.test');
  params = { employees: emp, clients: acme, projects: proj, tasks: t, leaves: leave.id, employeeId: emp, date: record?.work_date ?? '2099-01-05' };
});

afterAll(async () => {
  await pool.end();
});

describe('managers receive no money', () => {
  it('every GET route a manager can call answers without money-ish keys or amounts', async () => {
    const checked: string[] = [];
    for (const path of managerGetRoutes()) {
      if (OWN_PAY.has(`GET ${path}`)) continue;
      const resource = path.split('/')[2];
      const url = path.replace(/:([A-Za-z]+)/g, (_, name: string) => (name === 'id' ? params[resource] : params[name]) ?? 'x');
      const res = await manager.get(url);
      expect({ url, status: res.status }).not.toMatchObject({ status: 403 });
      if (res.headers['content-type']?.includes('json')) {
        expect({ url, money: moneyIn(res.body) }).toEqual({ url, money: [] });
      }
      checked.push(url);
    }
    // Sanity: the walk reached the screens managers use.
    for (const p of ['/api/employees', `/api/employees/${params.employees}`, '/api/clients', `/api/clients/${params.clients}`, '/api/projects', '/api/tasks', '/api/attendance', '/api/leaves', '/api/auth/me']) {
      expect(checked).toContain(p);
    }
  });

  it('the money routes themselves are 403 for a manager', async () => {
    for (const url of ['/api/invoices', '/api/settings/company', '/api/reports/invoices', '/api/reports/profit-loss', '/api/transactions', '/api/salary']) {
      expect({ url, status: (await manager.get(url)).status }).toEqual({ url, status: 403 });
    }
  });

  it('the same employee record does carry salary for an admin (the check above would notice it)', async () => {
    const admin = await signIn('admin@example.test');
    const res = await admin.get(`/api/employees/${params.employees}`).expect(200);
    expect(moneyIn(res.body)).toContain('$.employee.monthlySalary');
  });
});
