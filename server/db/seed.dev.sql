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

-- Employees (the admin has no employee record; EMP-004 has no login yet, for trying "Add user")
INSERT INTO employees (id, employee_code, full_name, work_email, phone, department, designation, joining_date, status, monthly_salary, payment_method) VALUES
  ('00000000-0000-4000-a000-000000000101', 'EMP-001', 'Morgan Manager (Fake)', 'manager@example.test',   '+00 00000 00001', 'Operations',  'Operations Lead',   '2024-04-01', 'active', 120000.00, 'Bank Transfer'),
  ('00000000-0000-4000-a000-000000000102', 'EMP-002', 'Erin Employee (Fake)',  'employee1@example.test', '+00 00000 00002', 'Engineering', 'Frontend Engineer', '2024-07-15', 'active',  90000.00, 'Bank Transfer'),
  ('00000000-0000-4000-a000-000000000103', 'EMP-003', 'Eli Employee (Fake)',   'employee2@example.test', '+00 00000 00003', 'Design',      'Product Designer',  '2025-01-06', 'active',  70000.00, 'UPI'),
  ('00000000-0000-4000-a000-000000000104', 'EMP-004', 'Nia Newhire (Fake)',    'newhire@example.test',   '+00 00000 00004', 'Marketing',   'Marketing Associate', '2026-10-01', 'active',  55000.00, 'Bank Transfer');

-- Users. password_hash = bcrypt('devpass123', cost 10)
INSERT INTO users (id, email, password_hash, role, employee_id, status) VALUES
  ('00000000-0000-4000-a000-000000000001', 'admin@example.test',     '$2b$10$1Oz/QhsWJBXzDI5l1KQLIuIHO1qX3AskdqHU.NvBn1n1JHcXSaGWW', 'admin',    NULL,                                   'active'),
  ('00000000-0000-4000-a000-000000000002', 'manager@example.test',   '$2b$10$1Oz/QhsWJBXzDI5l1KQLIuIHO1qX3AskdqHU.NvBn1n1JHcXSaGWW', 'manager',  '00000000-0000-4000-a000-000000000101', 'active'),
  ('00000000-0000-4000-a000-000000000003', 'employee1@example.test', '$2b$10$1Oz/QhsWJBXzDI5l1KQLIuIHO1qX3AskdqHU.NvBn1n1JHcXSaGWW', 'employee', '00000000-0000-4000-a000-000000000102', 'active'),
  ('00000000-0000-4000-a000-000000000004', 'employee2@example.test', '$2b$10$1Oz/QhsWJBXzDI5l1KQLIuIHO1qX3AskdqHU.NvBn1n1JHcXSaGWW', 'employee', '00000000-0000-4000-a000-000000000103', 'active');

-- Client companies and their portal logins (role 'client'; same dev password devpass123)
INSERT INTO clients (id, company_name, contact_name, contact_email, contact_phone, address, gstin, notes) VALUES
  ('00000000-0000-4000-a000-000000000501', 'Acme Corp (Fake)',  'Wile E. Fake',  'billing@acme.example.test',    '+00 00000 00501', '42 Sample Road, Faketown',  '00BBBBB0000B0Z0', 'Dev seed client with one portal login'),
  ('00000000-0000-4000-a000-000000000502', 'Globex Ltd (Fake)', 'Hank Placeholder', 'accounts@globex.example.test', '+00 00000 00502', '7 Demo Lane, Mockville', '00CCCCC0000C0Z0', 'Dev seed client with two portal logins');

INSERT INTO users (id, email, password_hash, role, client_id, status) VALUES
  ('00000000-0000-4000-a000-000000000601', 'client.acme@example.test',    '$2b$10$1Oz/QhsWJBXzDI5l1KQLIuIHO1qX3AskdqHU.NvBn1n1JHcXSaGWW', 'client', '00000000-0000-4000-a000-000000000501', 'active'),
  ('00000000-0000-4000-a000-000000000602', 'client.globex1@example.test', '$2b$10$1Oz/QhsWJBXzDI5l1KQLIuIHO1qX3AskdqHU.NvBn1n1JHcXSaGWW', 'client', '00000000-0000-4000-a000-000000000502', 'active'),
  ('00000000-0000-4000-a000-000000000603', 'client.globex2@example.test', '$2b$10$1Oz/QhsWJBXzDI5l1KQLIuIHO1qX3AskdqHU.NvBn1n1JHcXSaGWW', 'client', '00000000-0000-4000-a000-000000000502', 'active');

-- Projects: three client projects across the two seed companies plus one internal project.
INSERT INTO projects (id, name, description, client_id, start_date, deadline, status, created_by) VALUES
  ('00000000-0000-4000-a000-000000000701', 'Acme Website Redesign (Fake)', 'New marketing site for Acme.', '00000000-0000-4000-a000-000000000501', '2026-09-01', '2026-11-30', 'active',      '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-a000-000000000702', 'Globex Mobile App (Fake)',     'Customer app, phase 1.',       '00000000-0000-4000-a000-000000000502', '2026-08-15', '2026-12-15', 'active',      '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-a000-000000000703', 'Globex Brand Refresh (Fake)',  'Logo and style guide.',        '00000000-0000-4000-a000-000000000502', '2026-10-01', '2026-10-31', 'not_started', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-a000-000000000704', 'Internal Tooling (Fake)',      'Internal admin improvements.', NULL,                                   '2026-09-15', NULL,         'active',      '00000000-0000-4000-a000-000000000001');

INSERT INTO project_members (project_id, employee_id) VALUES
  ('00000000-0000-4000-a000-000000000701', '00000000-0000-4000-a000-000000000102'),
  ('00000000-0000-4000-a000-000000000701', '00000000-0000-4000-a000-000000000103'),
  ('00000000-0000-4000-a000-000000000702', '00000000-0000-4000-a000-000000000102'),
  ('00000000-0000-4000-a000-000000000702', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-a000-000000000703', '00000000-0000-4000-a000-000000000103'),
  ('00000000-0000-4000-a000-000000000704', '00000000-0000-4000-a000-000000000101');

-- Tasks in mixed statuses, priorities and client visibility (completed_at only on completed tasks).
INSERT INTO tasks (id, task_code, project_id, title, description, assignee_employee_id, start_date, deadline, priority, status,
                   client_visible, completed_at, completion_comment, created_by, updated_by) VALUES
  ('00000000-0000-4000-a000-000000000801', 'TSK-001', '00000000-0000-4000-a000-000000000701', 'Homepage design',        'Hero, features, footer.',        '00000000-0000-4000-a000-000000000103', '2026-09-01', '2026-09-20', 'high',   'completed',   true,  '2026-09-19 17:00+05:30', 'Signed off internally after QA.', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-a000-000000000802', 'TSK-002', '00000000-0000-4000-a000-000000000701', 'Build homepage',         'Implement the approved design.', '00000000-0000-4000-a000-000000000102', '2026-09-21', '2026-10-10', 'high',   'in_progress', true,  NULL, NULL, '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-a000-000000000803', 'TSK-003', '00000000-0000-4000-a000-000000000701', 'Contact form + CRM hook', NULL,                             '00000000-0000-4000-a000-000000000102', '2026-10-05', '2026-10-25', 'medium', 'todo',        true,  NULL, NULL, '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-a000-000000000804', 'TSK-004', '00000000-0000-4000-a000-000000000701', 'Set up staging server',  'Internal infra task.',           '00000000-0000-4000-a000-000000000103', '2026-09-05', '2026-09-12', 'low',    'completed',   false, '2026-09-11 12:00+05:30', NULL, '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-a000-000000000805', 'TSK-005', '00000000-0000-4000-a000-000000000702', 'Login screens',          NULL,                             '00000000-0000-4000-a000-000000000102', '2026-08-15', '2026-09-30', 'urgent', 'in_review',   true,  NULL, 'Ready for review, see build 42.', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-a000-000000000806', 'TSK-006', '00000000-0000-4000-a000-000000000702', 'Push notifications',     'Blocked on vendor keys.',        '00000000-0000-4000-a000-000000000101', '2026-09-01', '2026-10-05', 'high',   'blocked',     true,  NULL, NULL, '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-a000-000000000807', 'TSK-007', '00000000-0000-4000-a000-000000000702', 'Analytics events',       NULL,                             NULL,                                   NULL,         '2026-11-01', 'low',    'todo',        false, NULL, NULL, '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-a000-000000000808', 'TSK-008', '00000000-0000-4000-a000-000000000703', 'Moodboard',              NULL,                             '00000000-0000-4000-a000-000000000103', '2026-10-01', '2026-10-08', 'medium', 'todo',        true,  NULL, NULL, '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-a000-000000000809', 'TSK-009', '00000000-0000-4000-a000-000000000704', 'Audit log viewer',       NULL,                             '00000000-0000-4000-a000-000000000101', '2026-09-15', '2026-10-20', 'medium', 'in_progress', false, NULL, NULL, '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-a000-000000000810', 'TSK-010', '00000000-0000-4000-a000-000000000704', 'Backup script',          NULL,                             NULL,                                   NULL,         NULL,         'low',    'todo',        false, NULL, NULL, '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001');

INSERT INTO task_comments (task_id, author_user_id, comment_type, body, created_at) VALUES
  ('00000000-0000-4000-a000-000000000801', '00000000-0000-4000-a000-000000000002', 'internal_note',   'Internal: client asked for a darker hero; we kept brand colours.', '2026-09-18 11:00+05:30'),
  ('00000000-0000-4000-a000-000000000801', '00000000-0000-4000-a000-000000000002', 'client_feedback', 'The homepage design is ready for your review.',                     '2026-09-19 17:05+05:30'),
  ('00000000-0000-4000-a000-000000000801', '00000000-0000-4000-a000-000000000601', 'client_feedback', 'Looks great, approved.',                                             '2026-09-20 10:00+05:30'),
  ('00000000-0000-4000-a000-000000000805', '00000000-0000-4000-a000-000000000003', 'internal_note',   'Internal: OTP edge case still flaky on Android.',                    '2026-10-01 15:30+05:30'),
  ('00000000-0000-4000-a000-000000000805', '00000000-0000-4000-a000-000000000602', 'client_feedback', 'Can the login screen show our logo larger?',                         '2026-10-02 09:15+05:30');

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

-- Attendance: the 10 weekdays before today (IST), relative to when the seed runs, so the screens always
-- have recent history. Erin (EMP-002) misses one day (covered by an approved sick leave below); Eli
-- (EMP-003) misses two and has one record left open (never punched out); the manager's rows were entered
-- manually by the admin. Today has no rows: employees are punched in automatically when they sign in.
WITH last10 AS (
  SELECT d::date AS day, row_number() OVER (ORDER BY d DESC) AS n
    FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - 16, (now() AT TIME ZONE 'Asia/Kolkata')::date - 1, interval '1 day') d
   WHERE extract(isodow FROM d) < 6
   ORDER BY d DESC
   LIMIT 10
), plan (employee_id, created_by, updated_by, absent_days, open_day, source, minute_offset) AS (VALUES
  ('00000000-0000-4000-a000-000000000102'::uuid, '00000000-0000-4000-a000-000000000003'::uuid, NULL::uuid, ARRAY[3], NULL::bigint, 'login', 4),
  ('00000000-0000-4000-a000-000000000103'::uuid, '00000000-0000-4000-a000-000000000004'::uuid, NULL::uuid, ARRAY[2, 7], 5::bigint, 'login', 17),
  ('00000000-0000-4000-a000-000000000101'::uuid, '00000000-0000-4000-a000-000000000001'::uuid, '00000000-0000-4000-a000-000000000001'::uuid, ARRAY[]::int[], NULL::bigint, 'manual', 9)
)
INSERT INTO attendance_records (employee_id, work_date, punch_in, punch_out, source, note, created_by, updated_by)
SELECT p.employee_id, l.day,
       (l.day + time '09:00' + make_interval(mins => ((l.n * 7 + p.minute_offset) % 45)::int)) AT TIME ZONE 'Asia/Kolkata',
       CASE WHEN l.n = p.open_day THEN NULL
            ELSE (l.day + time '17:40' + make_interval(mins => ((l.n * 11 + p.minute_offset) % 70)::int)) AT TIME ZONE 'Asia/Kolkata' END,
       p.source,
       CASE WHEN p.source = 'manual' THEN 'Entered by admin from the visitor log (fake)' END,
       p.created_by, p.updated_by
  FROM plan p CROSS JOIN last10 l
 WHERE NOT (l.n = ANY (p.absent_days));

-- Leave requests in every status. Dates are relative to today; total_days counts weekdays (half day = 0.5).
WITH t AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today, date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata'))::date AS monday),
     erin_absent AS (
       SELECT d::date AS day FROM generate_series((SELECT today FROM t) - 16, (SELECT today FROM t) - 1, interval '1 day') d
        WHERE extract(isodow FROM d) < 6 ORDER BY d DESC OFFSET 2 LIMIT 1),
     req (employee_id, leave_type, start_date, end_date, day_type, half_day_period, reason, status, reviewed_by, reviewer_comment, rejection_reason) AS (
       SELECT '00000000-0000-4000-a000-000000000102'::uuid, 'sick', (SELECT day FROM erin_absent), (SELECT day FROM erin_absent), 'full', NULL, 'Fever (fake)', 'approved', '00000000-0000-4000-a000-000000000002'::uuid, 'Get well soon (fake)', NULL
       UNION ALL SELECT '00000000-0000-4000-a000-000000000103', 'earned', t.monday + 7, t.monday + 9, 'full', NULL, 'Family trip (fake)', 'pending', NULL, NULL, NULL FROM t
       UNION ALL SELECT '00000000-0000-4000-a000-000000000103', 'casual', t.monday - 28, t.monday - 27, 'full', NULL, 'Moving house (fake)', 'rejected', '00000000-0000-4000-a000-000000000001', NULL, 'Release week, please pick other dates (fake)' FROM t
       UNION ALL SELECT '00000000-0000-4000-a000-000000000102', 'casual', t.monday + 11, t.monday + 11, 'half', 'second', 'Appointment (fake)', 'cancelled', NULL, NULL, NULL FROM t
       UNION ALL SELECT '00000000-0000-4000-a000-000000000101', 'casual', t.monday + 14, t.monday + 15, 'full', NULL, 'Wedding in the family (fake)', 'pending', NULL, NULL, NULL FROM t
       UNION ALL SELECT '00000000-0000-4000-a000-000000000104', 'earned', t.monday, t.monday + 4, 'full', NULL, 'Pre-planned holiday (fake)', 'approved', '00000000-0000-4000-a000-000000000002', NULL, NULL FROM t
     )
INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, day_type, half_day_period, total_days, reason, status,
                            reviewed_by, reviewed_at, reviewer_comment, rejection_reason)
SELECT r.employee_id, r.leave_type, r.start_date, r.end_date, r.day_type, r.half_day_period,
       CASE WHEN r.day_type = 'half' THEN 0.5
            ELSE (SELECT count(*) FROM generate_series(r.start_date, r.end_date, interval '1 day') g WHERE extract(isodow FROM g) < 6) END,
       r.reason, r.status, r.reviewed_by, CASE WHEN r.reviewed_by IS NOT NULL THEN now() - interval '2 days' END,
       r.reviewer_comment, r.rejection_reason
  FROM req r;
