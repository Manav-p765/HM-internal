-- 008_ledger_categories: the ledger (manual transactions) and reports move to the API.
-- Categories become a table; transactions keep their text category column (no rename, no FK) and the
-- API checks that a manual row's category exists, is active, matches its type and is not a system one.
-- Manual rows are voided with the reversed_at/reversed_by/reverse_reason columns from 007.

-- ---------------------------------------------------------------------------
-- transaction_categories
-- ---------------------------------------------------------------------------
CREATE TABLE transaction_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        citext NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 60),   -- case-insensitive
  type        text NOT NULL CHECK (type IN ('income', 'expense')),
  is_system   boolean NOT NULL DEFAULT false,   -- used by invoice/salary payments; never renamed or deactivated
  active      boolean NOT NULL DEFAULT true,    -- inactive: hidden from pickers, still valid on old rows
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transaction_categories_system_active_check CHECK (NOT is_system OR active)
);

CREATE TRIGGER transaction_categories_set_updated_at BEFORE UPDATE ON transaction_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO transaction_categories (name, type, is_system) VALUES
  ('Invoice Payment',          'income',  true),
  ('Other Income',             'income',  false),
  ('Salary',                   'expense', true),
  ('Rent',                     'expense', false),
  ('Utilities',                'expense', false),
  ('Software & Subscriptions', 'expense', false),
  ('Hardware',                 'expense', false),
  ('Marketing',                'expense', false),
  ('Travel',                   'expense', false),
  ('Professional Fees',        'expense', false),
  ('Office Supplies',          'expense', false),
  ('Taxes',                    'expense', false),
  ('Other Expense',            'expense', false);

-- Backfill: every category already used by a transaction exists (inactive, so pickers don't offer it).
-- A name used for both types keeps the type it is used for most.
INSERT INTO transaction_categories (name, type, is_system, active)
SELECT DISTINCT ON (lower(t.category)) t.category, t.type, false, false
  FROM (SELECT category, type, count(*) AS n FROM transactions GROUP BY category, type) t
 WHERE NOT EXISTS (SELECT 1 FROM transaction_categories c WHERE c.name = t.category::citext)
 ORDER BY lower(t.category), t.n DESC, t.type;

CREATE INDEX transaction_categories_type_idx ON transaction_categories (type);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
-- 001 already implies this (invoice_id needs type income, salary_id needs type expense); say it directly.
ALTER TABLE transactions
  ADD CONSTRAINT transactions_single_link_check CHECK (invoice_id IS NULL OR salary_id IS NULL);

CREATE INDEX transactions_txn_date_type_idx ON transactions (txn_date, type);
CREATE INDEX transactions_category_idx ON transactions (category);
-- reversed_at / reversed_by / reverse_reason and transactions_reversal_check (all or none) exist since 007.
