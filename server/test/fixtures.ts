// Shared fixtures for the projects / tasks / portal tests (hm_test schema).
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db.js';
import { hashPassword } from '../src/services/passwords.js';

export const PASSWORD = 'correct-horse-battery';

export async function resetAll() {
  await query(
    'TRUNCATE attendance_records, leave_requests, task_comments, tasks, project_members, projects, audit_logs, password_tokens, sessions, users, employees, clients CASCADE',
  );
}

let codeCounter = 0;
export async function employee(fullName: string, status = 'active'): Promise<string> {
  codeCounter++;
  const [row] = await query<{ id: string }>(
    `INSERT INTO employees (employee_code, full_name, work_email, phone, department, designation, joining_date, status, monthly_salary)
     VALUES ($1, $2, $3, '+00 555 0101', 'Engineering', 'Engineer', '2025-01-01', $4, 50000) RETURNING id`,
    [`EMP-${900 + codeCounter}`, fullName, `${fullName.toLowerCase().replace(/\W+/g, '.')}.${codeCounter}@example.test`, status],
  );
  return row.id;
}

export async function company(name: string): Promise<string> {
  const [row] = await query<{ id: string }>(`INSERT INTO clients (company_name) VALUES ($1) RETURNING id`, [name]);
  return row.id;
}

export async function user(
  email: string,
  role: 'admin' | 'manager' | 'employee' | 'client',
  links: { employeeId?: string; clientId?: string } = {},
): Promise<string> {
  const [row] = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, employee_id, client_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [email, await hashPassword(PASSWORD), role, links.employeeId ?? null, links.clientId ?? null],
  );
  return row.id;
}

export async function signIn(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return agent;
}

export async function project(name: string, createdBy: string, clientId: string | null, status = 'active'): Promise<string> {
  const [row] = await query<{ id: string }>(
    `INSERT INTO projects (name, client_id, status, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
    [name, clientId, status, createdBy],
  );
  return row.id;
}

export async function member(projectId: string, employeeId: string) {
  await query('INSERT INTO project_members (project_id, employee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [projectId, employeeId]);
}

let taskCounter = 0;
export async function task(
  projectId: string,
  createdBy: string,
  opts: { title?: string; assignee?: string | null; status?: string; visible?: boolean; deadline?: string | null; completionComment?: string } = {},
): Promise<string> {
  taskCounter++;
  const status = opts.status ?? 'todo';
  const [row] = await query<{ id: string }>(
    `INSERT INTO tasks (task_code, project_id, title, assignee_employee_id, status, client_visible, deadline,
                        completed_at, completion_comment, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      `TSK-${String(900 + taskCounter)}`,
      projectId,
      opts.title ?? `Task ${taskCounter}`,
      opts.assignee ?? null,
      status,
      opts.visible ?? false,
      opts.deadline ?? null,
      status === 'completed' ? new Date() : null,
      opts.completionComment ?? null,
      createdBy,
    ],
  );
  if (opts.assignee) await member(projectId, opts.assignee);
  return row.id;
}

export async function comment(taskId: string, authorId: string, type: 'internal_note' | 'client_feedback', body: string) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO task_comments (task_id, author_user_id, comment_type, body) VALUES ($1, $2, $3, $4) RETURNING id`,
    [taskId, authorId, type, body],
  );
  return row.id;
}

// transaction_categories as migration 008 seeds them (tests add, rename and deactivate categories).
export async function resetCategories() {
  await query('TRUNCATE transaction_categories');
  await query(
    `INSERT INTO transaction_categories (name, type, is_system) VALUES
       ('Invoice Payment', 'income', true), ('Other Income', 'income', false),
       ('Salary', 'expense', true), ('Rent', 'expense', false), ('Utilities', 'expense', false),
       ('Software & Subscriptions', 'expense', false), ('Hardware', 'expense', false), ('Marketing', 'expense', false),
       ('Travel', 'expense', false), ('Professional Fees', 'expense', false), ('Office Supplies', 'expense', false),
       ('Taxes', 'expense', false), ('Other Expense', 'expense', false)`,
  );
}

// A ledger row written directly (manual unless invoiceId/salaryId is given).
export async function ledgerRow(
  createdBy: string,
  opts: {
    type?: 'income' | 'expense';
    category?: string;
    amount?: string;
    date?: string;
    description?: string;
    invoiceId?: string;
    salaryId?: string;
    voidedBy?: string;
    referenceNumber?: string;
    paymentMethod?: string;
  } = {},
): Promise<string> {
  const type = opts.type ?? (opts.invoiceId ? 'income' : 'expense');
  const [row] = await query<{ id: string }>(
    `INSERT INTO transactions (txn_date, type, category, description, amount, payment_method, reference_number, invoice_id, salary_id,
                               created_by, reversed_at, reversed_by, reverse_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [
      opts.date ?? '2026-10-10',
      type,
      opts.category ?? (type === 'income' ? 'Other Income' : 'Rent'),
      opts.description ?? 'Fake ledger row',
      opts.amount ?? '100.00',
      opts.paymentMethod ?? 'Bank Transfer',
      opts.referenceNumber ?? null,
      opts.invoiceId ?? null,
      opts.salaryId ?? null,
      createdBy,
      opts.voidedBy ? new Date('2026-10-12T04:30:00Z') : null,
      opts.voidedBy ?? null,
      opts.voidedBy ? 'Fake void reason' : null,
    ],
  );
  return row.id;
}
