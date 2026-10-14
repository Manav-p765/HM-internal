-- 003_clients: client companies and the 'client' role for portal logins.
-- A company can have several portal users; a client user belongs to exactly one company and never to an employee.

CREATE TABLE clients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name   text NOT NULL,
  contact_name   text,
  contact_email  citext,
  contact_phone  text,
  address        text,          -- used on invoices later
  gstin          text,          -- used on invoices later
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes          text,          -- internal; never shown to the client
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX clients_status_idx ON clients (status);
CREATE INDEX clients_company_name_idx ON clients (lower(company_name));

CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- users: allow the client role, link client users to their company.
ALTER TABLE users
  ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE RESTRICT,
  DROP CONSTRAINT users_role_check,
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'manager', 'employee', 'client')),
  -- Client users: a company and no employee record. Everyone else: no company.
  ADD CONSTRAINT users_client_link_check CHECK (
    (role = 'client' AND client_id IS NOT NULL AND employee_id IS NULL)
    OR (role <> 'client' AND client_id IS NULL)
  );

CREATE INDEX users_client_id_idx ON users (client_id);
