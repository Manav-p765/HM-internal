-- 007_salary_reversals: salary and payslips move to the API, ledger rows are reversed instead of deleted,
-- and invoice numbers are assigned when an invoice is sent (drafts have none).

-- ---------------------------------------------------------------------------
-- transactions: reversal instead of delete. A reversed row stays in the ledger for history and is ignored
-- by every sum (invoice amount paid / balance, collected this month, salary payments).
-- ---------------------------------------------------------------------------
ALTER TABLE transactions
  ADD COLUMN reversed_at    timestamptz,
  ADD COLUMN reversed_by    uuid REFERENCES users(id),
  ADD COLUMN reverse_reason text,
  ADD CONSTRAINT transactions_reversal_check CHECK (
    (reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL) OR
    (reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND reverse_reason IS NOT NULL)
  );

-- A salary has at most one LIVE expense row; an un-paid (reversed) one stays, so the salary can be paid again.
ALTER TABLE transactions DROP CONSTRAINT transactions_salary_id_key;
CREATE UNIQUE INDEX transactions_salary_id_live_key ON transactions (salary_id) WHERE reversed_at IS NULL;
CREATE INDEX transactions_salary_id_idx ON transactions (salary_id);
CREATE INDEX transactions_reversed_by_idx ON transactions (reversed_by);

-- Salary expense rows use the category "Salary".
UPDATE transactions SET category = 'Salary' WHERE salary_id IS NOT NULL AND category <> 'Salary';

-- ---------------------------------------------------------------------------
-- invoices: the number is assigned at send. Existing rows keep their numbers (including drafts).
-- ---------------------------------------------------------------------------
ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL;  -- still UNIQUE (NULLs never collide)
ALTER TABLE invoices
  ADD CONSTRAINT invoices_number_check CHECK (status NOT IN ('sent', 'paid') OR invoice_number IS NOT NULL);

-- ---------------------------------------------------------------------------
-- salaries: everything in 001 is kept (net_payable generated, CHECK (net_payable >= 0), paid <=> paid_on).
-- Added: a paid salary has a payment method and a positive net; a published slip belongs to a paid salary.
-- ---------------------------------------------------------------------------
ALTER TABLE salaries
  ADD CONSTRAINT salaries_paid_check CHECK (status <> 'paid' OR (payment_method IS NOT NULL AND net_payable > 0)),
  ADD CONSTRAINT salaries_slip_check CHECK (slip_published_at IS NULL OR status = 'paid');

DROP INDEX salaries_salary_month_idx;
CREATE INDEX salaries_salary_month_status_idx ON salaries (salary_month, status);

-- ---------------------------------------------------------------------------
-- salary_adjustment_lines: itemised earnings (bonus, arrears) and deductions (unpaid leave, advance).
-- salaries.adjustments is the stored sum (earnings minus deductions), maintained by services/salary.ts.
-- Lines are only added or removed, never edited, so there is no updated_at.
-- ---------------------------------------------------------------------------
CREATE TABLE salary_adjustment_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_id   uuid NOT NULL REFERENCES salaries(id) ON DELETE CASCADE,
  label       text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  kind        text NOT NULL CHECK (kind IN ('earning', 'deduction')),
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  created_by  uuid REFERENCES users(id),   -- null only for lines backfilled below
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX salary_adjustment_lines_salary_id_idx ON salary_adjustment_lines (salary_id);
CREATE INDEX salary_adjustment_lines_created_by_idx ON salary_adjustment_lines (created_by);

-- Existing rows with a lump-sum adjustment get one line, so adjustments = sum(lines) holds everywhere.
INSERT INTO salary_adjustment_lines (salary_id, label, kind, amount, created_at)
SELECT id, coalesce(nullif(left(notes, 200), ''), 'Adjustment'),
       CASE WHEN adjustments > 0 THEN 'earning' ELSE 'deduction' END, abs(adjustments), created_at
  FROM salaries WHERE adjustments <> 0;
