// The salary money rules (services/salary.ts): pure functions, no database.
import { describe, expect, it } from 'vitest';
import { adjustmentsTotal, isPayable, NegativeNetError, netPayable, recalculate, SalaryRangeError } from '../src/services/salary.js';

describe('salary rules', () => {
  it('adjustments are earnings minus deductions, exact to the paisa', () => {
    expect(adjustmentsTotal([])).toBe('0.00');
    expect(
      adjustmentsTotal([
        { kind: 'earning', amount: '5000.00' },
        { kind: 'deduction', amount: '1234.56' },
        { kind: 'earning', amount: '0.10' },
        { kind: 'earning', amount: '0.20' },
      ]),
    ).toBe('3765.74'); // 0.1 + 0.2 is exactly 0.30 here (floats give 0.30000000000000004)
    expect(adjustmentsTotal([{ kind: 'deduction', amount: '2000.00' }])).toBe('-2000.00');
  });

  it('net payable = base + adjustments', () => {
    expect(netPayable('70000.00', '-2000.00')).toBe('68000.00');
    expect(netPayable('90000.00', '5000.50')).toBe('95000.50');
  });

  it('recalculate returns the stored values', () => {
    expect(recalculate('50000.00', [{ kind: 'earning', amount: '2500.00' }, { kind: 'deduction', amount: '500.25' }])).toEqual({
      adjustments: '1999.75',
      netPayable: '51999.75',
    });
  });

  it('a change that would make the net negative is rejected; exactly zero is allowed', () => {
    expect(() => recalculate('1000.00', [{ kind: 'deduction', amount: '1000.01' }])).toThrow(NegativeNetError);
    expect(recalculate('1000.00', [{ kind: 'deduction', amount: '1000.00' }]).netPayable).toBe('0.00');
    // Removing an earning that a deduction relied on is caught the same way.
    expect(() => recalculate('100.00', [{ kind: 'deduction', amount: '150.00' }])).toThrow(NegativeNetError);
  });

  it('a result that does not fit numeric(14,2) is rejected', () => {
    expect(() => recalculate('999999999999.99', [{ kind: 'earning', amount: '0.01' }])).toThrow(SalaryRangeError);
  });

  it('only a positive net is payable', () => {
    expect(isPayable('0.00')).toBe(false);
    expect(isPayable('0.01')).toBe(true);
    expect(isPayable('-1.00')).toBe(false);
  });
});
