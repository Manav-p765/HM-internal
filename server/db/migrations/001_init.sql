-- 001_init: core schema for Monks Internal Management.
-- Conventions: uuid PKs, citext emails, money NUMERIC(14,2), text status columns with CHECKs,
-- created_at/updated_at on every app table (updated_at maintained by trigger).

CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------
CREATE TABLE employees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code   text NOT NULL UNIQUE,                -- e.g. EMP-001
  full_name       text NOT NULL,
  work_email      citext NOT NULL UNIQUE,
  phone           text,
  department      text NOT NULL,
  designation     text NOT NULL,
  joining_date    date NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'on_leave', 'inactive')),
  monthly_salary  numeric(14,2) NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0),
  payment_method  text,
  notes           text,
  avatar_url      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- users (login accounts; optionally linked 1:1 to an employee)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 citext NOT NULL UNIQUE,
  password_hash         text,                          -- null until an invite is accepted
  role                  text NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
  employee_id           uuid UNIQUE REFERENCES employees(id),
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  must_change_password  boolean NOT NULL DEFAULT false,
  last_login_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- invoices + invoice_items
-- Overdue / partially paid are derived (due_date, sum of linked income transactions).
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  text NOT NULL UNIQUE,
  client_name     text NOT NULL,
  client_email    citext,
  client_address  text,
  client_gstin    text,
  invoice_date    date NOT NULL,
  due_date        date NOT NULL,
  subtotal        numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_rate        numeric(5,2)  NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_amount      numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount    numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'paid', 'cancelled')),
  notes           text,
  created_by      uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (due_date >= invoice_date)
);

CREATE TABLE invoice_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position     integer NOT NULL CHECK (position >= 0),
  description  text NOT NULL,
  quantity     numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit_price   numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total   numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, position)
);

-- ---------------------------------------------------------------------------
-- salaries (one row per employee per month)
-- ---------------------------------------------------------------------------
CREATE TABLE salaries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  salary_month       date NOT NULL CHECK (extract(day FROM salary_month) = 1),
  base_salary        numeric(14,2) NOT NULL CHECK (base_salary >= 0),
  adjustments        numeric(14,2) NOT NULL DEFAULT 0,   -- bonus (+) / deduction (-)
  net_payable        numeric(14,2) GENERATED ALWAYS AS (base_salary + adjustments) STORED
                       CHECK (net_payable >= 0),
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_on            date,
  payment_method     text,
  slip_published_at  timestamptz,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, salary_month),
  CHECK ((status = 'paid') = (paid_on IS NOT NULL))
);

-- ---------------------------------------------------------------------------
-- transactions (single-entry income/expense ledger)
-- Invoice payments are income rows with invoice_id; paid salaries are expense rows with salary_id.
-- ---------------------------------------------------------------------------
CREATE TABLE transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_date          date NOT NULL,
  type              text NOT NULL CHECK (type IN ('income', 'expense')),
  category          text NOT NULL,
  description       text NOT NULL,
  amount            numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method    text NOT NULL,
  reference_number  text,
  notes             text,
  invoice_id        uuid REFERENCES invoices(id) ON DELETE RESTRICT,
  salary_id         uuid UNIQUE REFERENCES salaries(id) ON DELETE RESTRICT,
  created_by        uuid NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (invoice_id IS NULL OR type = 'income'),
  CHECK (salary_id IS NULL OR type = 'expense')
);

-- ---------------------------------------------------------------------------
-- company_settings (exactly one row: id is always true)
-- ---------------------------------------------------------------------------
CREATE TABLE company_settings (
  id                          boolean PRIMARY KEY DEFAULT true CHECK (id),
  company_name                text NOT NULL,
  company_address             text,
  company_phone               text,
  company_email               citext,
  company_gstin               text,
  default_gst_rate            numeric(5,2) NOT NULL DEFAULT 18 CHECK (default_gst_rate >= 0 AND default_gst_rate <= 100),
  invoice_prefix              text NOT NULL DEFAULT 'INV-',
  currency                    char(3) NOT NULL DEFAULT 'INR',
  financial_year_start_month  smallint NOT NULL DEFAULT 4 CHECK (financial_year_start_month BETWEEN 1 AND 12),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO company_settings (company_name) VALUES ('Hybrid Monks LLP');

-- ---------------------------------------------------------------------------
-- auth_tokens (invites and password resets; only a hash of the token is stored)
-- ---------------------------------------------------------------------------
CREATE TABLE auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  purpose     text NOT NULL CHECK (purpose IN ('invite', 'reset')),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- sessions (layout required by connect-pg-simple, tableName: 'sessions')
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  sid     varchar NOT NULL PRIMARY KEY,
  sess    json NOT NULL,
  expire  timestamp(6) NOT NULL
);

-- ---------------------------------------------------------------------------
-- indexes (unique constraints above already index users.email, users.employee_id,
-- employees.employee_code/work_email, invoices.invoice_number, invoice_items(invoice_id, position),
-- salaries(employee_id, salary_month), transactions.salary_id, auth_tokens.token_hash)
-- ---------------------------------------------------------------------------
CREATE INDEX invoices_status_idx          ON invoices (status);
CREATE INDEX invoices_due_date_idx        ON invoices (due_date);
CREATE INDEX invoices_created_by_idx      ON invoices (created_by);
CREATE INDEX salaries_salary_month_idx    ON salaries (salary_month);
CREATE INDEX transactions_txn_date_idx    ON transactions (txn_date);
CREATE INDEX transactions_type_date_idx   ON transactions (type, txn_date);
CREATE INDEX transactions_invoice_id_idx  ON transactions (invoice_id);
CREATE INDEX transactions_created_by_idx  ON transactions (created_by);
CREATE INDEX auth_tokens_user_id_idx      ON auth_tokens (user_id);
CREATE INDEX sessions_expire_idx          ON sessions (expire);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER employees_set_updated_at        BEFORE UPDATE ON employees        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_set_updated_at            BEFORE UPDATE ON users            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER invoices_set_updated_at         BEFORE UPDATE ON invoices         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER invoice_items_set_updated_at    BEFORE UPDATE ON invoice_items    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER salaries_set_updated_at         BEFORE UPDATE ON salaries         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER transactions_set_updated_at     BEFORE UPDATE ON transactions     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER company_settings_set_updated_at BEFORE UPDATE ON company_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER auth_tokens_set_updated_at      BEFORE UPDATE ON auth_tokens      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
