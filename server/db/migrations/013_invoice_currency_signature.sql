-- 013_invoice_currency_signature: invoices in the client's currency, and a signature on the printed invoice.
--
-- Currency: an invoice is written in one currency (all amounts on it, its payments and its balance are in
-- that currency). A client has a default currency that new invoices pick up. The list is fixed in
-- services/currency.ts and repeated here; every one has 2 decimal places, so numeric(14,2) and the money
-- rules are unchanged. Existing rows are INR. The company's own currency stays INR: the ledger, salaries and
-- the P&L never hold another currency.
ALTER TABLE clients
  ADD COLUMN currency text NOT NULL DEFAULT 'INR'
    CONSTRAINT clients_currency_check CHECK (currency IN ('INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'NZD', 'CHF'));

ALTER TABLE invoices
  ADD COLUMN currency text NOT NULL DEFAULT 'INR'
    CONSTRAINT invoices_currency_check CHECK (currency IN ('INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'NZD', 'CHF'));

-- An invoice payment has two amounts: invoice_amount, in the invoice's currency (what counts towards the
-- invoice's balance), and amount, the INR actually received (what the ledger and reports sum). For an INR
-- invoice they are equal. Non-invoice rows have no invoice_amount.
ALTER TABLE transactions ADD COLUMN invoice_amount numeric(14,2);
UPDATE transactions SET invoice_amount = amount WHERE invoice_id IS NOT NULL;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_invoice_amount_check CHECK (
    (invoice_id IS NULL AND invoice_amount IS NULL) OR (invoice_id IS NOT NULL AND invoice_amount > 0)
  );

-- An invoice payment inserted without invoice_amount (an INR payment written by hand, the dev seed) gets the
-- INR amount.
CREATE FUNCTION transactions_default_invoice_amount() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL AND NEW.invoice_amount IS NULL THEN
    NEW.invoice_amount := NEW.amount;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_default_invoice_amount
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION transactions_default_invoice_amount();

-- Signature: an image printed above "Authorized Signatory" (same rules as the logo, migration 011), and the
-- signatory's name and designation printed under the line.
ALTER TABLE company_settings
  ADD COLUMN signature_data_url text
    CONSTRAINT company_settings_signature_check CHECK (
      signature_data_url IS NULL
      OR (signature_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' AND length(signature_data_url) <= 210000)
    ),
  ADD COLUMN signatory_name text CONSTRAINT company_settings_signatory_name_check CHECK (length(signatory_name) <= 120),
  ADD COLUMN signatory_designation text CONSTRAINT company_settings_signatory_designation_check CHECK (length(signatory_designation) <= 120);
