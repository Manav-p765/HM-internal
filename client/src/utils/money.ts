// Money display for API decimal strings, and the invoice form's LIVE PREVIEW of totals.
// Stored and shown amounts always come from the server; the preview mirrors the server rules
// (server/src/services/money.ts) only so the form can show something while typing, and is replaced by the
// server's numbers on save. Integer arithmetic on BigInt; no floats.

// The app is INR-only (company_settings.currency is fixed to INR on the server).
export const CURRENCY = 'INR';

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

// "118000.5" -> "₹1,18,000.50" (Indian grouping, always 2 decimals). Non-numeric input -> "₹0.00".
export function formatMoney(value: string | null | undefined): string {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec((value ?? '').trim());
  if (!match) return '₹0.00';
  const [, sign, whole, fraction = ''] = match;
  return `${sign}₹${BigInt(whole).toLocaleString('en-IN')}.${fraction.padEnd(2, '0')}`;
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

// Exact sum of server amounts for report footers (no floats). Invalid entries count as 0.
export function sumMoney(values: string[]): string {
  return fromHundredths(values.reduce<bigint>((sum, v) => sum + (toHundredths(v) ?? 0n), 0n));
}

// "18.00" -> "18", "12.50" -> "12.5" for labels.
export function trimRate(rate: string): string {
  return rate.includes('.') ? rate.replace(/\.?0+$/, '') : rate;
}
