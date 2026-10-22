import type { Currency } from './currency.js';
import { toSignedHundredths } from './money.js';

// "Total in words" for invoices in the invoice's currency: INR in Indian numbering (thousand, lakh, crore),
// every other currency in international numbering (thousand, million, billion). The INR wording is ported
// from the old invoice generator's amountToWords (same wording: "Indian Rupees ... and ... Paise Only", "and" before a last
// group under 100), but it takes the server's 2-decimal string and works on BigInt paise, so no float is
// involved (the old version split rupees and paise with Math.floor/Math.round on a double). Amounts of 100
// crore and more are spelled in crores ("One Thousand Crore"), as invoices do.

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

// 0..999
function belowThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  const rest = n % 100;
  return ONES[Math.floor(n / 100)] + ' Hundred' + (rest ? ' and ' + belowThousand(rest) : '');
}

// Whole rupees (>= 1) in Indian grouping.
function indianNumber(n: bigint): string {
  const crores = n / 10_000_000n;
  const lakhs = Number((n % 10_000_000n) / 100_000n);
  const thousands = Number((n % 100_000n) / 1000n);
  const rest = Number(n % 1000n);
  const parts: string[] = [];
  if (crores > 0n) parts.push(indianNumber(crores) + ' Crore');
  if (lakhs > 0) parts.push(belowThousand(lakhs) + ' Lakh');
  if (thousands > 0) parts.push(belowThousand(thousands) + ' Thousand');
  if (rest > 0) parts.push(parts.length > 0 && rest < 100 ? 'and ' + belowThousand(rest) : belowThousand(rest));
  return parts.join(' ');
}

// Whole units (>= 1) in international grouping, for every currency but INR.
function internationalNumber(n: bigint): string {
  const groups: [bigint, string][] = [
    [1_000_000_000n, 'Billion'],
    [1_000_000n, 'Million'],
    [1000n, 'Thousand'],
  ];
  const parts: string[] = [];
  let rest = n;
  for (const [size, name] of groups) {
    if (rest >= size) {
      parts.push(`${size === 1_000_000_000n ? internationalNumber(rest / size) : belowThousand(Number(rest / size))} ${name}`);
      rest %= size;
    }
  }
  const last = Number(rest);
  if (last > 0) parts.push(parts.length > 0 && last < 100 ? 'and ' + belowThousand(last) : belowThousand(last));
  return parts.join(' ');
}

// Unit and fraction names per invoice currency (services/currency.ts).
const NAMES: Record<Currency, [unit: string, fraction: string]> = {
  INR: ['Indian Rupees', 'Paise'],
  USD: ['US Dollars', 'Cents'],
  EUR: ['Euros', 'Cents'],
  GBP: ['Pounds Sterling', 'Pence'],
  AUD: ['Australian Dollars', 'Cents'],
  CAD: ['Canadian Dollars', 'Cents'],
  SGD: ['Singapore Dollars', 'Cents'],
  AED: ['UAE Dirhams', 'Fils'],
  NZD: ['New Zealand Dollars', 'Cents'],
  CHF: ['Swiss Francs', 'Centimes'],
};

// "118000.50" -> "One Lakh Eighteen Thousand Indian Rupees and Fifty Paise Only"
// "118000.50", "USD" -> "One Hundred and Eighteen Thousand US Dollars and Fifty Cents Only"
export function amountInWords(amount: string, currency: Currency = 'INR'): string {
  const [unit, fractionName] = NAMES[currency];
  const hundredths = toSignedHundredths(amount);
  const negative = hundredths < 0n;
  const abs = negative ? -hundredths : hundredths;
  const whole = abs / 100n;
  const fraction = Number(abs % 100n);
  if (whole === 0n && fraction === 0) return `Zero ${unit} Only`;
  const words: string[] = [];
  if (negative) words.push('Minus');
  // Only paise: "Fifty Paise Only" (the old tool printed "Zero Indian Rupees and Fifty Paise Only").
  if (whole > 0n) words.push(currency === 'INR' ? indianNumber(whole) : internationalNumber(whole), unit);
  if (fraction > 0) words.push(...(whole > 0n ? ['and'] : []), belowThousand(fraction), fractionName);
  words.push('Only');
  return words.join(' ');
}
