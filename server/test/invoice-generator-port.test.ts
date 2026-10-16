// What was ported from the old invoice generator (manav859/invoice_generator): its calculation rules and its
// amount-in-words helper. Pure functions, no database. The cases mirror the old tool's behaviour with fake
// data; where the old tool's float arithmetic gave a wrong paisa, the expected value here is the exact one
// and the comment says what the old tool printed.
import { describe, expect, it } from 'vitest';
import { amountInWords } from '../src/services/amountInWords.js';
import { computeTotals } from '../src/services/money.js';

describe('old tool calculation rules == services/money.ts computeTotals', () => {
  // Old rules (calculateTotals.ts): amount = round(qty x rate, 2) per line; subtotal = sum; tax (optional,
  // one percentage, e.g. "GST 18%") = round(subtotal x pct / 100, 2); total = subtotal + tax. These are
  // exactly the existing rules, so the port reuses computeTotals rather than adding a second implementation.
  it('typical service invoice: 3 lines at 18% GST', () => {
    const totals = computeTotals({
      items: [
        { quantity: '1', unitPrice: '45000' }, // website design (fake)
        { quantity: '12', unitPrice: '1250.50' }, // hours of support (fake)
        { quantity: '2.5', unitPrice: '999.99' }, // 2.5 x 999.99 = 2499.975 -> 2499.98
      ],
      taxRate: '18',
    });
    expect(totals).toEqual({
      lineTotals: ['45000.00', '15006.00', '2499.98'],
      subtotal: '62505.98',
      taxAmount: '11251.08', // 11251.0764
      total: '73757.06',
    });
  });

  it('no tax (the old tool omitted the tax row when the percentage was empty or 0)', () => {
    expect(computeTotals({ items: [{ quantity: '4', unitPrice: '2500' }], taxRate: '0' })).toEqual({
      lineTotals: ['10000.00'],
      subtotal: '10000.00',
      taxAmount: '0.00',
      total: '10000.00',
    });
  });

  it('fractional GST rate (old tool allowed any 0-100 percentage)', () => {
    // 12345.67 x 12.5% = 1543.20875 -> 1543.21
    expect(computeTotals({ items: [{ quantity: '1', unitPrice: '12345.67' }], taxRate: '12.5' }).taxAmount).toBe('1543.21');
  });

  it('half-paisa line amounts round up (old tool: 1.5 x 0.33 printed 0.49 because 49.4999... in floats)', () => {
    expect(computeTotals({ items: [{ quantity: '1.5', unitPrice: '0.33' }], taxRate: '0' }).lineTotals).toEqual(['0.50']);
  });

  it('half-paisa tax rounds up (old tool: 100.50 at 1% printed 1.00 because 1.005 is 1.00499... in floats)', () => {
    expect(computeTotals({ items: [{ quantity: '1', unitPrice: '100.50' }], taxRate: '1' })).toMatchObject({
      taxAmount: '1.01',
      total: '101.51',
    });
  });

  it('crore-sized invoice stays exact', () => {
    // 3 x 41,66,666.67 = 1,25,00,000.01; 18% = 22,50,000.0018 -> 22,50,000.00
    expect(computeTotals({ items: [{ quantity: '3', unitPrice: '4166666.67' }], taxRate: '18' })).toMatchObject({
      subtotal: '12500000.01',
      taxAmount: '2250000.00',
      total: '14750000.01',
    });
  });
});

describe('amountInWords (Indian grouping)', () => {
  it.each([
    ['0.00', 'Zero Indian Rupees Only'],
    ['1.00', 'One Indian Rupees Only'],
    ['19.00', 'Nineteen Indian Rupees Only'],
    ['100.00', 'One Hundred Indian Rupees Only'],
    ['117.99', 'One Hundred and Seventeen Indian Rupees and Ninety Nine Paise Only'],
    ['1005.00', 'One Thousand and Five Indian Rupees Only'],
    ['1100.00', 'One Thousand One Hundred Indian Rupees Only'],
    ['10000.00', 'Ten Thousand Indian Rupees Only'],
    ['73757.06', 'Seventy Three Thousand Seven Hundred and Fifty Seven Indian Rupees and Six Paise Only'],
    ['100000.00', 'One Lakh Indian Rupees Only'],
    ['118000.50', 'One Lakh Eighteen Thousand Indian Rupees and Fifty Paise Only'],
    ['2500050.00', 'Twenty Five Lakh and Fifty Indian Rupees Only'],
    ['10000000.00', 'One Crore Indian Rupees Only'],
    ['14750000.01', 'One Crore Forty Seven Lakh Fifty Thousand Indian Rupees and One Paise Only'],
    ['99999999.99', 'Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred and Ninety Nine Indian Rupees and Ninety Nine Paise Only'],
  ])('%s', (amount, words) => {
    expect(amountInWords(amount)).toBe(words);
  });

  it('beyond 99 crore keeps counting crores (the old tool broke at 100 crore: "Ten Hundred Crore")', () => {
    expect(amountInWords('10000000000.00')).toBe('One Thousand Crore Indian Rupees Only');
    expect(amountInWords('999999999999.99')).toBe(
      'Ninety Nine Thousand Nine Hundred and Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred and Ninety Nine Indian Rupees and Ninety Nine Paise Only',
    );
  });

  it('paise only and negative amounts', () => {
    expect(amountInWords('0.50')).toBe('Fifty Paise Only');
    expect(amountInWords('-25.00')).toBe('Minus Twenty Five Indian Rupees Only');
  });

  it('agrees with computeTotals output for a stored total', () => {
    const { total } = computeTotals({ items: [{ quantity: '3', unitPrice: '33.33' }], taxRate: '18' });
    expect(amountInWords(total)).toBe('One Hundred and Seventeen Indian Rupees and Ninety Nine Paise Only');
  });
});
