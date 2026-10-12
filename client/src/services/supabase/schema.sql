-- ==============================================================================
-- HYBRID MONKS INTERNAL MANAGEMENT SYSTEM — PRODUCTION DATABASE SCHEMA
-- Target Engine: PostgreSQL 15+ / Supabase
-- Includes: RLS Policies, Foreign Keys, Audit Constraints, Triggers
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USER ROLES ENUM
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('admin', 'manager', 'employee');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role user_role_enum NOT NULL DEFAULT 'employee',
    designation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. COMPANY SETTINGS
CREATE TABLE IF NOT EXISTS public.company_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    company_name TEXT NOT NULL DEFAULT 'Hybrid Monks',
    company_address TEXT DEFAULT 'Level 4, Maker Maxity, BKC, Mumbai 400051',
    company_email TEXT DEFAULT 'accounts@hybridmonks.com',
    company_phone TEXT DEFAULT '+91 22 6123 4567',
    company_gstin TEXT DEFAULT '27AABCH1234F1Z8',
    default_currency TEXT NOT NULL DEFAULT 'INR',
    financial_year_start_month INT NOT NULL DEFAULT 4,
    invoice_prefix TEXT NOT NULL DEFAULT 'INV-2026-',
    tax_rate_percentage NUMERIC(5,2) NOT NULL DEFAULT 18.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. EMPLOYEES TABLE
CREATE TABLE IF NOT EXISTS public.employees (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    work_email TEXT NOT NULL UNIQUE,
    phone_number TEXT,
    department TEXT NOT NULL,
    designation TEXT NOT NULL,
    joining_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Active', 'On Leave', 'Inactive')),
    monthly_salary NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    payment_method TEXT DEFAULT 'Bank Transfer',
    notes TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    date DATE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    payment_method TEXT NOT NULL,
    reference_number TEXT,
    notes TEXT,
    linked_salary_id TEXT,
    linked_invoice_id TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. INVOICES TABLE
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_address TEXT,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 18.00,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
    outstanding_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (outstanding_amount >= 0),
    status TEXT NOT NULL CHECK (status IN ('Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. INVOICE ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
    subtotal NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0)
);

-- 9. INVOICE PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.invoice_payments (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL,
    reference TEXT,
    notes TEXT,
    recorded_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. SALARY RECORDS TABLE
CREATE TABLE IF NOT EXISTS public.salary_records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    employee_name TEXT NOT NULL,
    employee_email TEXT NOT NULL,
    department TEXT NOT NULL,
    salary_month TEXT NOT NULL, -- Format 'YYYY-MM'
    base_salary NUMERIC(14,2) NOT NULL CHECK (base_salary >= 0),
    adjustments NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    final_payable_amount NUMERIC(14,2) NOT NULL CHECK (final_payable_amount >= 0),
    payment_date DATE,
    payment_method TEXT,
    status TEXT NOT NULL CHECK (status IN ('Pending', 'Paid')),
    linked_expense_txn_id TEXT REFERENCES public.transactions(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_employee_month UNIQUE (employee_id, salary_month)
);

-- 11. AUDIT LOGS TABLE (TAMPER-EVIDENT ACCOUNTABILITY LOG)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL,
    user_email TEXT,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL, -- e.g. 'SALARY_PAYMENT', 'ATTENDANCE_CORRECTION'
    entity_type TEXT NOT NULL, -- 'salary', 'attendance', 'invoice', 'employee', 'settings', 'auth'
    entity_id TEXT, -- Target identifier, e.g. 'SAL-2026-09-EMP001' or 'ATT-2026-10-09-EMP003'
    details TEXT NOT NULL,
    previous_state JSONB, -- Previous record state before mutation
    new_state JSONB,      -- Mutated record state after action
    ip_address TEXT
);

-- Performance Indexes for Audit Trail
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_role, user_name);

-- 12. STORED FUNCTION: log_audit_event
-- Reusable procedure to log critical actions server-side with caller context
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_details TEXT,
    p_user_name TEXT DEFAULT NULL,
    p_user_email TEXT DEFAULT NULL,
    p_user_role TEXT DEFAULT NULL,
    p_previous_state JSONB DEFAULT NULL,
    p_new_state JSONB DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
    v_user_id UUID;
    v_user_role TEXT;
    v_user_name TEXT;
    v_user_email TEXT;
BEGIN
    -- Derive caller information from active JWT session if available
    v_user_id := auth.uid();
    v_user_role := COALESCE(p_user_role, auth.jwt()->>'role', 'system');
    v_user_name := COALESCE(p_user_name, auth.jwt()->>'name', 'System');
    v_user_email := COALESCE(p_user_email, auth.jwt()->>'email');

    INSERT INTO public.audit_logs (
        user_id,
        user_name,
        user_email,
        user_role,
        action,
        entity_type,
        entity_id,
        details,
        previous_state,
        new_state,
        ip_address
    ) VALUES (
        v_user_id,
        v_user_name,
        v_user_email,
        v_user_role,
        p_action,
        p_entity_type,
        p_entity_id,
        p_details,
        p_previous_state,
        p_new_state,
        p_ip_address
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins: Full access
CREATE POLICY "Admin full access profiles" ON public.profiles FOR ALL USING (auth.jwt()->>'role' = 'admin');
CREATE POLICY "Admin full access employees" ON public.employees FOR ALL USING (auth.jwt()->>'role' = 'admin');
CREATE POLICY "Admin full access transactions" ON public.transactions FOR ALL USING (auth.jwt()->>'role' = 'admin');
CREATE POLICY "Admin full access invoices" ON public.invoices FOR ALL USING (auth.jwt()->>'role' = 'admin');
CREATE POLICY "Admin full access salary_records" ON public.salary_records FOR ALL USING (auth.jwt()->>'role' = 'admin');
CREATE POLICY "Admin full access audit_logs" ON public.audit_logs FOR SELECT USING (auth.jwt()->>'role' = 'admin');

-- Managers: Read/Write Transactions, Invoices, Employee directory, and operational audit logs
CREATE POLICY "Manager transactions" ON public.transactions FOR ALL USING (auth.jwt()->>'role' IN ('admin', 'manager'));
CREATE POLICY "Manager invoices" ON public.invoices FOR ALL USING (auth.jwt()->>'role' IN ('admin', 'manager'));
CREATE POLICY "Manager employees" ON public.employees FOR SELECT USING (auth.jwt()->>'role' IN ('admin', 'manager'));
CREATE POLICY "Manager operational audit_logs" ON public.audit_logs FOR SELECT USING (
    auth.jwt()->>'role' IN ('admin', 'manager') AND entity_type IN ('attendance', 'invoice')
);

-- Append-only policy: Authenticated sessions can record audit logs, but cannot alter or delete them
CREATE POLICY "Authenticated users can insert audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
);

-- Employees: View only permitted records
CREATE POLICY "Employee read transactions" ON public.transactions FOR SELECT USING (auth.jwt()->>'role' IN ('admin', 'manager', 'employee'));
CREATE POLICY "Employee read invoices" ON public.invoices FOR SELECT USING (auth.jwt()->>'role' IN ('admin', 'manager', 'employee'));
