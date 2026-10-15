// The invoice money rules (services/money.ts): pure functions, no database.
import { describe, expect, it } from 'vitest';
import { compareMoney, computeTotals, formatHundredths, lineTotal, moneyAmount, percentValue, quantityValue, subtractMoney, toHundredths } from '../src/services/money.js';

describe('computeTotals', () => {
  it('3 x 33.33 at 18%: 99.99 + 18.00 (17.9982 rounds up) = 117.99', () => {
    expect(computeTotals({ items: [{ quantity: '3', unitPrice: '33.33' }], taxRate: '18' })).toEqual({
      lineTotals: ['99.99'],
      subtotal: '99.99',
      taxAmount: '18.00',
      total: '117.99',
    });
  });

  it('rounds tax half up at exactly half a paisa (0.25 at 18% = 0.045 -> 0.05)', () => {
    expect(computeTotals({ items: [{ quantity: '1', unitPrice: '0.25' }], taxRate: '18' }).taxAmount).toBe('0.05');
    // 0.15 at 10% = 0.015 -> 0.02; 100.50 at 1% = 1.005 -> 1.01 (floats get 1.005 wrong: it is 1.00499999...)
    expect(computeTotals({ items: [{ quantity: '1', unitPrice: '0.15' }], taxRate: '10' }).taxAmount).toBe('0.02');
    expect(computeTotals({ items: [{ quantity: '1', unitPrice: '100.50' }], taxRate: '1' }).taxAmount).toBe('1.01'); // 1.005
  });

  it('rounds each line to 2 decimals before summing', () => {
    // 1.5 x 0.33 = 0.495 -> 0.50; 0.01 x 0.01 = 0.0001 -> 0.00
    expect(lineTotal('1.5', '0.33')).toBe(50n);
    expect(lineTotal('0.01', '0.01')).toBe(0n);
    const totals = computeTotals({ items: [{ quantity: '1.5', unitPrice: '0.33' }, { quantity: '1.5', unitPrice: '0.33' }], taxRate: '0' });
    expect(totals).toEqual({ lineTotals: ['0.50', '0.50'], subtotal: '1.00', taxAmount: '0.00', total: '1.00' });
  });

  it('handles large amounts exactly (beyond the safe range of a double)', () => {
    const totals = computeTotals({ items: [{ quantity: '99999999.99', unitPrice: '9999.99' }], taxRate: '0' });
    // 99999999.99 * 9999.99 = 999998999900.0001 -> 999998999900.00
    expect(totals.subtotal).toBe('999998999900.00');
    expect(() => computeTotals({ items: [{ quantity: '99999999.99', unitPrice: '99999.99' }], taxRate: '0' })).toThrow('too large');
  });

  it('many lines: 100 lines of 0.01 x 0.99 (0.0099 -> 0.01 each) = 1.00', () => {
    const items = Array.from({ length: 100 }, () => ({ quantity: '0.01', unitPrice: '0.99' }));
    const totals = computeTotals({ items, taxRate: '18' });
    expect(totals.subtotal).toBe('1.00');
    expect(totals.taxAmount).toBe('0.18');
    expect(totals.total).toBe('1.18');
  });

  it('zero-price lines and a 0% rate', () => {
    expect(computeTotals({ items: [{ quantity: '2', unitPrice: '0' }], taxRate: '0' }).total).toBe('0.00');
  });
});

describe('decimal helpers', () => {
  it('parses and formats 2-decimal strings', () => {
    expect(toHundredths('12.5')).toBe(1250n);
    expect(toHundredths('0.07')).toBe(7n);
    expect(formatHundredths(1250n)).toBe('12.50');
    expect(formatHundredths(-5n)).toBe('-0.05');
    expect(() => toHundredths('1.234')).toThrow();
    expect(() => toHundredths('-1')).toThrow();
    expect(compareMoney('10.00', '9.99')).toBe(1);
    expect(compareMoney('5', '5.00')).toBe(0);
    expect(subtractMoney('117.99', '17.99')).toBe('100.00');
  });

  it('zod helpers accept numbers or strings, normalise to 2 decimals and enforce the rules', () => {
    expect(moneyAmount().parse(12.5)).toBe('12.50');
    expect(moneyAmount().parse(' 7 ')).toBe('7.00');
    expect(moneyAmount().safeParse('1.234').success).toBe(false);
    expect(moneyAmount().safeParse(-1).success).toBe(false);
    expect(moneyAmount('Amount', 'positive').safeParse(0).success).toBe(false);
    expect(moneyAmount().safeParse('1000000000000').success).toBe(false);
    expect(quantityValue.safeParse(0).success).toBe(false);
    expect(quantityValue.parse('0.5')).toBe('0.50');
    expect(percentValue().safeParse('100.01').success).toBe(false);
    expect(percentValue().parse(18)).toBe('18.00');
  });
});
