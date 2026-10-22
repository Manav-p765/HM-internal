import { z } from 'zod';

// Invoice currencies. INR is the company's own currency: the ledger, salaries and every ledger report are
// INR only. An invoice (and a client, as the default for its new invoices) may be in any of these. Every one
// has 2 decimal places, so services/money.ts applies unchanged. Migration 013 repeats the list in CHECKs.
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'NZD', 'CHF'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const BASE_CURRENCY: Currency = 'INR';

export const currencyValue = z.enum(CURRENCIES, 'Choose a supported currency');
