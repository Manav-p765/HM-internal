-- 006_invoices: invoices move to the API. Link invoices to client companies (the client_* columns stay as
-- a snapshot taken when the invoice is written), record when an invoice was sent or cancelled, and give
-- company_settings the bank details, terms and a sequential invoice number counter used for printing and
-- numbering. Existing rows (dev seed) are backfilled before the new constraints are added.

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN client_id     uuid REFERENCES clients(id) ON DELETE RESTRICT,
  ADD COLUMN sent_at       timestamptz,
  ADD COLUMN cancelled_at  timestamptz,
  ADD COLUMN cancel_reason text;

-- Best-effort link for existing rows: an exact company name match.
UPDATE invoices i SET client_id = c.id FROM clients c WHERE c.company_name = i.client_name AND i.client_id IS NULL;

-- Sent and paid invoices were sent at some point; we don't know when, so use their creation time.
UPDATE invoices SET sent_at = created_at WHERE status IN ('sent', 'paid') AND sent_at IS NULL;
UPDATE invoices SET cancelled_at = updated_at, cancel_reason = coalesce(cancel_reason, 'Cancelled before reasons were recorded')
 WHERE status = 'cancelled' AND cancelled_at IS NULL;

ALTER TABLE invoices
  -- Draft invoices have not been sent; everything after draft has (cancelled may have been either).
  ADD CONSTRAINT invoices_sent_at_check CHECK (
    (status = 'draft' AND sent_at IS NULL) OR (status IN ('sent', 'paid') AND sent_at IS NOT NULL) OR status = 'cancelled'
  ),
  ADD CONSTRAINT invoices_cancelled_check CHECK (
    (status = 'cancelled') = (cancelled_at IS NOT NULL) AND (status = 'cancelled') = (cancel_reason IS NOT NULL)
  ),
  ADD CONSTRAINT invoices_totals_check CHECK (total_amount = subtotal + tax_amount);

CREATE INDEX invoices_client_id_idx    ON invoices (client_id);
CREATE INDEX invoices_invoice_date_idx ON invoices (invoice_date);
-- invoices(status), invoices(due_date) and transactions(invoice_id) already exist (001).

-- ---------------------------------------------------------------------------
-- company_settings (still exactly one row: id boolean PRIMARY KEY CHECK (id))
-- ---------------------------------------------------------------------------
ALTER TABLE company_settings
  ADD COLUMN bank_details        text,
  ADD COLUMN terms               text,
  ADD COLUMN invoice_next_number integer NOT NULL DEFAULT 1 CHECK (invoice_next_number >= 1);

-- Continue after existing invoices so a new number never starts behind them. (The API also skips any
-- number that is already taken, so a prefix change back to an old one can't collide either.)
UPDATE company_settings SET invoice_next_number = (SELECT count(*) + 1 FROM invoices);

-- The app is INR-only.
UPDATE company_settings SET currency = 'INR' WHERE currency <> 'INR';
ALTER TABLE company_settings ADD CONSTRAINT company_settings_currency_check CHECK (currency = 'INR');
