// Money display for API decimal strings, and the invoice form's LIVE PREVIEW of totals.
// Stored and shown amounts always come from the server; the preview mirrors the server rules
// (server/src/services/money.ts) only so the form can show something while typing, and is replaced by the
// server's numbers on save. Integer arithmetic on BigInt; no floats.

// The company's own currency: the ledger, salaries and the P&L are INR only (company_settings.currency).
export const CURRENCY = 'INR';

// Invoice currencies, as server/src/services/currency.ts. An invoice (and a client's default for new
// invoices) is in one of these; all have 2 decimal places.
export const INVOICE_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'NZD', 'CHF'] as const;
export type InvoiceCurrency = (typeof INVOICE_CURRENCIES)[number];

export const CURRENCY_LABEL: Record<InvoiceCurrency, string> = {
  INR: 'INR · Indian Rupee',
  USD: 'USD · US Dollar',
  EUR: 'EUR · Euro',
  GBP: 'GBP · Pound Sterling',
  AUD: 'AUD · Australian Dollar',
  CAD: 'CAD · Canadian Dollar',
  SGD: 'SGD · Singapore Dollar',
  AED: 'AED · UAE Dirham',
  NZD: 'NZD · New Zealand Dollar',
  CHF: 'CHF · Swiss Franc',
};

const SYMBOL: Record<InvoiceCurrency, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  AED: 'AED ',
  NZD: 'NZ$',
  CHF: 'CHF ',
};

const DECIMAL_2 = /^\d{1,15}(\.\d{1,2})?$/;

function toHundredths(value: string): bigint | null {
  const v = value.trim();
  if (!DECIMAL_2.test(v)) return null;
  const [whole, fraction = ''] = v.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function fromHundredths(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

// "118000.5" -> "₹1,18,000.50" (Indian grouping, always 2 decimals); with another currency
// "118000.5", "USD" -> "$118,000.50" (international grouping). Non-numeric input -> "₹0.00" / "$0.00".
export function formatMoney(value: string | null | undefined, currency: InvoiceCurrency = 'INR'): string {
  const symbol = SYMBOL[currency] ?? `${currency} `;
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec((value ?? '').trim());
  if (!match) return `${symbol}0.00`;
  const [, sign, whole, fraction = ''] = match;
  return `${sign}${symbol}${BigInt(whole).toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US')}.${fraction.padEnd(2, '0')}`;
}

const roundHalfUp = (numerator: bigint, denominator: bigint) => (numerator * 2n + denominator) / (denominator * 2n);

export interface PreviewTotals {
  lineTotals: (string | null)[]; // null where the row isn't a valid number yet
  subtotal: string;
  taxAmount: string;
  total: string;
}

// LIVE PREVIEW ONLY: line = round(qty x price, 2); tax = round half up(subtotal x rate / 100, 2).
export function previewTotals(items: { quantity: string; unitPrice: string }[], taxRate: string): PreviewTotals {
  const lines = items.map(i => {
    const q = toHundredths(i.quantity);
    const p = toHundredths(i.unitPrice);
    return q === null || p === null ? null : roundHalfUp(q * p, 100n);
  });
  const subtotal = lines.reduce<bigint>((sum, v) => sum + (v ?? 0n), 0n);
  const rate = toHundredths(taxRate) ?? 0n;
  const taxAmount = roundHalfUp(subtotal * rate, 10000n);
  return {
    lineTotals: lines.map(l => (l === null ? null : fromHundredths(l))),
    subtotal: fromHundredths(subtotal),
    taxAmount: fromHundredths(taxAmount),
    total: fromHundredths(subtotal + taxAmount),
  };
}

// For the payment form: is `amount` a valid amount no larger than `max`? (Client-side hint only.)
export function compareAmounts(a: string, b: string): number | null {
  const x = toHundredths(a);
  const y = toHundredths(b);
  if (x === null || y === null) return null;
  return x < y ? -1 : x > y ? 1 : 0;
}

// Salary adjustment form, LIVE PREVIEW only: the net payable if a line of `amount` were added. The server
// recomputes (services/salary.ts) and refuses a negative net; null while the amount isn't a valid number.
export function previewNetAfterLine(netPayable: string, kind: 'earning' | 'deduction', amount: string): string | null {
  const net = toHundredths(netPayable);
  const value = toHundredths(amount);
  if (net === null || value === null) return null;
  return fromHundredths(kind === 'earning' ? net + value : net - value);
}

// DISPLAY ONLY (chart bar heights): `value` as a percentage of `max`, both non-negative server amounts.
// 0 when max is 0 or either value isn't a valid amount. Never used for a figure that is shown as money.
export function sharePercent(value: string, max: string): number {
  const v = toHundredths(value);
  const m = toHundredths(max);
  if (v === null || m === null || m === 0n) return 0;
  return Number((v * 10000n) / m) / 100;
}

// DISPLAY ONLY: the largest of some non-negative server amounts ("0.00" when none), to scale chart bars.
export function maxAmount(values: string[]): string {
  let best = 0n;
  for (const v of values) {
    const h = toHundredths(v);
    if (h !== null && h > best) best = h;
  }
  return fromHundredths(best);
}

// Exact sum of server amounts for report footers (no floats). Invalid entries count as 0.
export function sumMoney(values: string[]): string {
  return fromHundredths(values.reduce<bigint>((sum, v) => sum + (toHundredths(v) ?? 0n), 0n));
}

// "18.00" -> "18", "12.50" -> "12.5" for labels.
export function trimRate(rate: string): string {
  return rate.includes('.') ? rate.replace(/\.?0+$/, '') : rate;
}
