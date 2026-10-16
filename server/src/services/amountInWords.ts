import { toSignedHundredths } from './money.js';

// "Total in words" for invoices, Indian numbering (thousand, lakh, crore). Ported from the old invoice
// generator's amountToWords (same wording: "Indian Rupees ... and ... Paise Only", "and" before a last
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

// "118000.50" -> "One Lakh Eighteen Thousand Indian Rupees and Fifty Paise Only"
export function amountInWords(amount: string): string {
  const paise = toSignedHundredths(amount);
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const rupees = abs / 100n;
  const fraction = Number(abs % 100n);
  if (rupees === 0n && fraction === 0) return 'Zero Indian Rupees Only';
  const words: string[] = [];
  if (negative) words.push('Minus');
  // Only paise: "Fifty Paise Only" (the old tool printed "Zero Indian Rupees and Fifty Paise Only").
  if (rupees > 0n) words.push(indianNumber(rupees), 'Indian Rupees');
  if (fraction > 0) words.push(...(rupees > 0n ? ['and'] : []), belowThousand(fraction), 'Paise');
  words.push('Only');
  return words.join(' ');
}
