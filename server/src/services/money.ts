import { z } from 'zod';

// Invoice money rules. The ONLY place they live; routes and tests use these functions.
//   line_total = round(quantity * unit_price, 2)
//   subtotal   = sum of line totals
//   tax_amount = round half up(subtotal * tax_rate / 100, 2)
//   total      = subtotal + tax_amount
// Everything is integer arithmetic on BigInt (paise for money, hundredths for quantities and rates), so no
// JS float ever touches a stored amount. Values come in and go out as decimal strings with 2 places.
// Postgres's round() on numeric rounds half away from zero, which for these non-negative values is the
// same as half up, so the generated invoice_items.line_total column always agrees with lineTotal().

export const MAX_LINES = 100;
// numeric(14,2): at most 12 digits before the point.
const MAX_AMOUNT_PAISE = 10n ** 14n - 1n;
// invoice_items.quantity is numeric(10,2).
const MAX_QUANTITY_HUNDREDTHS = 10n ** 10n - 1n;

const DECIMAL_2 = /^\d{1,15}(\.\d{1,2})?$/;

// "12.5" -> 1250n (hundredths). Only plain non-negative decimals with up to 2 places.
export function toHundredths(value: string): bigint {
  if (!DECIMAL_2.test(value)) throw new Error(`Not a 2-decimal amount: ${value}`);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

// 1250n -> "12.50"
export function formatHundredths(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

// Integer division rounding half up (both operands non-negative).
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

// quantity and unitPrice as decimal strings -> line total in paise.
export function lineTotal(quantity: string, unitPrice: string): bigint {
  // (q/100) * (p/100) rupees = q*p/10000 rupees = q*p/100 paise
  return divRoundHalfUp(toHundredths(quantity) * toHundredths(unitPrice), 100n);
}

export interface TotalsInput {
  items: { quantity: string; unitPrice: string }[];
  taxRate: string; // percent, up to 2 decimals
}

export interface Totals {
  lineTotals: string[];
  subtotal: string;
  taxAmount: string;
  total: string;
}

export class MoneyRangeError extends Error {}

export function computeTotals({ items, taxRate }: TotalsInput): Totals {
  const lines = items.map(i => lineTotal(i.quantity, i.unitPrice));
  const subtotal = lines.reduce((sum, v) => sum + v, 0n);
  // subtotal paise * (rate hundredths / 100) / 100 = subtotal * rate / 10000
  const taxAmount = divRoundHalfUp(subtotal * toHundredths(taxRate), 10000n);
  const total = subtotal + taxAmount;
  if (total > MAX_AMOUNT_PAISE || lines.some(l => l > MAX_AMOUNT_PAISE)) {
    throw new MoneyRangeError('The invoice total is too large');
  }
  return {
    lineTotals: lines.map(formatHundredths),
    subtotal: formatHundredths(subtotal),
    taxAmount: formatHundredths(taxAmount),
    total: formatHundredths(total),
  };
}

// ---------------------------------------------------------------------------
// zod helpers: accept a number or a numeric string, validate to 2 decimals, output a normalised string.
// ---------------------------------------------------------------------------
function decimalString(label: string, opts: { min?: 'positive' | 'nonnegative'; maxHundredths: bigint; maxLabel: string }) {
  return z
    .union([z.string(), z.number()], { message: `${label} must be a number` })
    .transform(v => (typeof v === 'number' ? String(v) : v.trim()))
    .refine(v => DECIMAL_2.test(v), `${label} must be a number with at most 2 decimal places`)
    .refine(v => !DECIMAL_2.test(v) || opts.min !== 'positive' || toHundredths(v) > 0n, `${label} must be greater than 0`)
    .refine(v => !DECIMAL_2.test(v) || toHundredths(v) <= opts.maxHundredths, `${label} must be at most ${opts.maxLabel}`)
    .transform(v => formatHundredths(toHundredths(v)));
}

export const moneyAmount = (label = 'Amount', min: 'positive' | 'nonnegative' = 'nonnegative') =>
  decimalString(label, { min, maxHundredths: MAX_AMOUNT_PAISE, maxLabel: '999999999999.99' });

export const quantityValue = decimalString('Quantity', { min: 'positive', maxHundredths: MAX_QUANTITY_HUNDREDTHS, maxLabel: '99999999.99' });

export const percentValue = (label = 'Tax rate') =>
  decimalString(label, { min: 'nonnegative', maxHundredths: 10000n, maxLabel: '100' });

// Signed variant for computed values such as a balance ("-5.00").
export function toSignedHundredths(value: string): bigint {
  return value.startsWith('-') ? -toHundredths(value.slice(1)) : toHundredths(value);
}

// Compare two decimal strings (either may be negative): -1, 0, 1.
export function compareMoney(a: string, b: string): number {
  const x = toSignedHundredths(a);
  const y = toSignedHundredths(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function subtractMoney(a: string, b: string): string {
  return formatHundredths(toSignedHundredths(a) - toSignedHundredths(b));
}
