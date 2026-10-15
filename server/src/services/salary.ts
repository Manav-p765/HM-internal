import { formatHundredths, toHundredths, toSignedHundredths } from './money.js';

// Salary money rules. The ONLY place they live; routes and tests use these functions.
//   adjustments = sum(earning lines) - sum(deduction lines)       (stored on salaries.adjustments)
//   net_payable = base_salary + adjustments                       (a generated column in Postgres)
//   net_payable must never be negative; a salary can only be paid when it is greater than 0.
// Integer arithmetic on BigInt paise, like services/money.ts; values in and out are 2-decimal strings.

export type AdjustmentKind = 'earning' | 'deduction';

export interface AdjustmentLine {
  kind: AdjustmentKind;
  amount: string; // > 0, 2 decimals
}

// numeric(14,2): at most 12 digits before the point.
const MAX_PAISE = 10n ** 14n - 1n;

export class NegativeNetError extends Error {
  constructor() {
    super('This would make the net payable negative');
  }
}

export class SalaryRangeError extends Error {
  constructor() {
    super('The amount is too large');
  }
}

// Earnings minus deductions, e.g. "-2000.00".
export function adjustmentsTotal(lines: AdjustmentLine[]): string {
  const total = lines.reduce((sum, line) => sum + (line.kind === 'earning' ? 1n : -1n) * toHundredths(line.amount), 0n);
  if (total > MAX_PAISE || total < -MAX_PAISE) throw new SalaryRangeError();
  return formatHundredths(total);
}

export function netPayable(baseSalary: string, adjustments: string): string {
  return formatHundredths(toHundredths(baseSalary) + toSignedHundredths(adjustments));
}

// The stored values for a base salary and a set of lines. Throws NegativeNetError when the net would be
// below zero (the change is rejected; nothing is written) and SalaryRangeError when it would not fit.
export function recalculate(baseSalary: string, lines: AdjustmentLine[]): { adjustments: string; netPayable: string } {
  const adjustments = adjustmentsTotal(lines);
  const net = toHundredths(baseSalary) + toSignedHundredths(adjustments);
  if (net < 0n) throw new NegativeNetError();
  if (net > MAX_PAISE) throw new SalaryRangeError();
  return { adjustments, netPayable: formatHundredths(net) };
}

// Only a positive net can be paid (an expense transaction's amount must be > 0).
export function isPayable(net: string): boolean {
  return toSignedHundredths(net) > 0n;
}
