-- DEV-ONLY seed data. Every name, email, company detail and number here is fake.
-- All four users share the dev-only password: devpass123
-- Loaded by `npm run db:seed` (refuses to run when NODE_ENV=production).

UPDATE company_settings SET
  company_name    = 'Example Studio LLP (DEV DATA)',
  company_address = '1 Fake Street, Testville 000000',
  company_phone   = '+00 00000 00000',
  company_email   = 'accounts@example.test',
  company_gstin   = '00AAAAA0000A0Z0',
  default_gst_rate = 18,
  invoice_prefix  = 'INV-DEV-',
  currency        = 'INR';

-- Employees (the admin has no employee record)
INSERT INTO employees (id, employee_code, full_name, work_email, phone, department, designation, joining_date, status, monthly_salary, payment_method) VALUES
  ('00000000-0000-4000-a000-000000000101', 'EMP-001', 'Morgan Manager (Fake)', 'manager@example.test',   '+00 00000 00001', 'Operations',  'Operations Lead',   '2024-04-01', 'active', 120000.00, 'Bank Transfer'),
  ('00000000-0000-4000-a000-000000000102', 'EMP-002', 'Erin Employee (Fake)',  'employee1@example.test', '+00 00000 00002', 'Engineering', 'Frontend Engineer', '2024-07-15', 'active',  90000.00, 'Bank Transfer'),
  ('00000000-0000-4000-a000-000000000103', 'EMP-003', 'Eli Employee (Fake)',   'employee2@example.test', '+00 00000 00003', 'Design',      'Product Designer',  '2025-01-06', 'active',  70000.00, 'UPI');

-- Users. password_hash = bcrypt('devpass123', cost 10)
INSERT INTO users (id, email, password_hash, role, employee_id, status) VALUES
  ('00000000-0000-4000-a000-000000000001', 'admin@example.test',     '$2b$10$1Oz/QhsWJBXzDI5l1KQLIuIHO1qX3AskdqHU.NvBn1n1JHcXSaGWW', 'admin',    NULL,                                   'active'),
  ('00000000-0000-4000-a000-000000000002', 'manager@example.test',   '$2b$10$1Oz/QhsWJBXzDI5l1KQLIuIHO1qX3AskdqHU.NvBn1n1JHcXSaGWW', 'manager',  '00000000-0000-4000-a000-000000000101', 'active'),
  ('00000000-0000-4000-a000-000000000003', 'employee1@example.test', '$2b$10$1Oz/QhsWJBXzDI5l1KQLIuIHO1qX3AskdqHU.NvBn1n1JHcXSaGWW', 'employee', '00000000-0000-4000-a000-000000000102', 'active'),
  ('00000000-0000-4000-a000-000000000004', 'employee2@example.test', '$2b$10$1Oz/QhsWJBXzDI5l1KQLIuIHO1qX3AskdqHU.NvBn1n1JHcXSaGWW', 'employee', '00000000-0000-4000-a000-000000000103', 'active');

-- Invoices: one paid, one sent + partially paid, one draft
INSERT INTO invoices (id, invoice_number, client_name, client_email, client_address, client_gstin, invoice_date, due_date, subtotal, tax_rate, tax_amount, total_amount, status, notes, created_by) VALUES
  ('00000000-0000-4000-a000-000000000201', 'INV-DEV-001', 'Acme Corp (Fake)',   'billing@acme.example.test',   '42 Sample Road, Faketown', '00BBBBB0000B0Z0', '2026-08-01', '2026-08-16', 100000.00, 18, 18000.00, 118000.00, 'paid',  NULL,                 '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-a000-000000000202', 'INV-DEV-002', 'Globex Ltd (Fake)',  'accounts@globex.example.test', '7 Demo Lane, Mockville',   NULL,              '2026-09-10', '2026-09-25',  50000.00, 18,  9000.00,  59000.00, 'sent',  'Net 15',             '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-a000-000000000203', 'INV-DEV-003', 'Initech (Fake)',     'ap@initech.example.test',     NULL,                       NULL,              '2026-10-05', '2026-10-20',  25000.00, 18,  4500.00,  29500.00, 'draft', 'Awaiting PO number', '00000000-0000-4000-a000-000000000001');

INSERT INTO invoice_items (invoice_id, position, description, quantity, unit_price) VALUES
  ('00000000-0000-4000-a000-000000000201', 0, 'Website redesign',        1, 80000.00),
  ('00000000-0000-4000-a000-000000000201', 1, 'Hosting setup (monthly)', 4,  5000.00),
  ('00000000-0000-4000-a000-000000000202', 0, 'Mobile app sprint',       2, 25000.00),
  ('00000000-0000-4000-a000-000000000203', 0, 'SEO audit',               1, 15000.00),
  ('00000000-0000-4000-a000-000000000203', 1, 'Content writing (pages)', 10, 1000.00);

-- One salary run: September 2026 (two paid, one pending with a deduction)
INSERT INTO salaries (id, employee_id, salary_month, base_salary, adjustments, status, paid_on, payment_method, slip_published_at, notes) VALUES
  ('00000000-0000-4000-a000-000000000301', '00000000-0000-4000-a000-000000000101', '2026-09-01', 120000.00,     0.00, 'paid',    '2026-09-30', 'Bank Transfer', '2026-10-01 10:00:00+05:30', NULL),
  ('00000000-0000-4000-a000-000000000302', '00000000-0000-4000-a000-000000000102', '2026-09-01',  90000.00,  5000.00, 'paid',    '2026-09-30', 'Bank Transfer', '2026-10-01 10:00:00+05:30', 'Release bonus'),
  ('00000000-0000-4000-a000-000000000303', '00000000-0000-4000-a000-000000000103', '2026-09-01',  70000.00, -2000.00, 'pending', NULL,         NULL,            NULL,                        'Unpaid leave deduction');

-- Ledger
INSERT INTO transactions (txn_date, type, category, description, amount, payment_method, reference_number, invoice_id, salary_id, created_by) VALUES
  ('2026-08-14', 'income',  'Client Payments',            'Payment for INV-DEV-001',           118000.00, 'Bank Transfer', 'UTR-FAKE-0001', '00000000-0000-4000-a000-000000000201', NULL,                                   '00000000-0000-4000-a000-000000000002'),
  ('2026-09-22', 'income',  'Client Payments',            'Part payment for INV-DEV-002',       20000.00, 'UPI',           'UPI-FAKE-0002', '00000000-0000-4000-a000-000000000202', NULL,                                   '00000000-0000-4000-a000-000000000002'),
  ('2026-09-30', 'expense', 'Salaries',                   'September 2026 salary - EMP-001',   120000.00, 'Bank Transfer', NULL,            NULL,                                   '00000000-0000-4000-a000-000000000301', '00000000-0000-4000-a000-000000000001'),
  ('2026-09-30', 'expense', 'Salaries',                   'September 2026 salary - EMP-002',    95000.00, 'Bank Transfer', NULL,            NULL,                                   '00000000-0000-4000-a000-000000000302', '00000000-0000-4000-a000-000000000001'),
  ('2026-09-05', 'expense', 'Software and Tools',         'Design tool seats (fake vendor)',     4999.00, 'Credit Card',   NULL,            NULL,                                   NULL,                                   '00000000-0000-4000-a000-000000000002'),
  ('2026-09-12', 'expense', 'Hosting and Infrastructure', 'Cloud hosting (fake vendor)',        12000.00, 'Credit Card',   NULL,            NULL,                                   NULL,                                   '00000000-0000-4000-a000-000000000002'),
  ('2026-10-02', 'expense', 'Office Expenses',            'Stationery',                          1850.00, 'Cash',          NULL,            NULL,                                   NULL,                                   '00000000-0000-4000-a000-000000000002');
