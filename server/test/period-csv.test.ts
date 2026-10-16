// services/period.ts and services/csv.ts: pure functions, no database.
import { describe, expect, it } from 'vitest';
import { lastMonths, PeriodError, presetRange, resolvePeriod } from '../src/services/period.js';
import { csvCell, num, toCsv } from '../src/services/csv.js';

describe('period presets', () => {
  it('this_month / last_month follow the IST date, including year boundaries and short months', () => {
    expect(presetRange('this_month', '2026-10-16')).toEqual(['2026-10-01', '2026-10-31']);
    expect(presetRange('last_month', '2026-10-16')).toEqual(['2026-09-01', '2026-09-30']);
    expect(presetRange('last_month', '2026-01-05')).toEqual(['2025-12-01', '2025-12-31']);
    expect(presetRange('this_month', '2028-02-10')).toEqual(['2028-02-01', '2028-02-29']); // leap year
    expect(presetRange('last_month', '2026-03-31')).toEqual(['2026-02-01', '2026-02-28']);
  });

  it('financial year (April start): March belongs to the FY that began the previous April', () => {
    expect(presetRange('this_fy', '2026-03-31', 4)).toEqual(['2025-04-01', '2026-03-31']);
    expect(presetRange('this_fy', '2026-04-01', 4)).toEqual(['2026-04-01', '2027-03-31']);
    expect(presetRange('last_fy', '2026-03-31', 4)).toEqual(['2024-04-01', '2025-03-31']);
    expect(presetRange('last_fy', '2026-04-01', 4)).toEqual(['2025-04-01', '2026-03-31']);
  });

  it('other financial-year start months (January = calendar year, July)', () => {
    expect(presetRange('this_fy', '2026-10-16', 1)).toEqual(['2026-01-01', '2026-12-31']);
    expect(presetRange('last_fy', '2026-10-16', 1)).toEqual(['2025-01-01', '2025-12-31']);
    expect(presetRange('this_fy', '2026-06-30', 7)).toEqual(['2025-07-01', '2026-06-30']);
    expect(presetRange('this_fy', '2026-07-01', 7)).toEqual(['2026-07-01', '2027-06-30']);
  });
});

describe('resolvePeriod', () => {
  const today = '2026-10-16';
  it('a preset, a custom range, or the fallback when nothing is given', () => {
    expect(resolvePeriod({ preset: 'this_month' }, today)).toEqual({ from: '2026-10-01', to: '2026-10-31', preset: 'this_month' });
    expect(resolvePeriod({ from: '2026-01-15', to: '2026-02-15' }, today)).toEqual({ from: '2026-01-15', to: '2026-02-15', preset: null });
    expect(resolvePeriod({}, today, 4, 'this_fy')).toEqual({ from: '2026-04-01', to: '2027-03-31', preset: 'this_fy' });
    expect(resolvePeriod({ from: '2026-05-05', to: '2026-05-05' }, today).from).toBe('2026-05-05'); // one day
  });

  it('rejects reversed, half, mixed and over-long ranges', () => {
    const bad = (input: Parameters<typeof resolvePeriod>[0], path: string) => {
      try {
        resolvePeriod(input, today);
        throw new Error('expected a PeriodError');
      } catch (err) {
        expect(err).toBeInstanceOf(PeriodError);
        expect((err as PeriodError).path).toBe(path);
      }
    };
    bad({ from: '2026-05-02', to: '2026-05-01' }, 'to');
    bad({ from: '2026-05-01' }, 'to');
    bad({ to: '2026-05-01' }, 'from');
    bad({ preset: 'this_month', from: '2026-05-01', to: '2026-05-02' }, 'preset');
    bad({ from: '2020-01-01', to: '2025-01-01' }, 'to'); // 5 years and a day
    expect(resolvePeriod({ from: '2020-01-01', to: '2024-12-31' }, today).to).toBe('2024-12-31'); // exactly 5 years
  });

  it('lastMonths ends with the current month, oldest first', () => {
    expect(lastMonths('2026-02-10', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(lastMonths('2026-10-31', 1)).toEqual(['2026-10']);
  });
});

describe('csv', () => {
  it('RFC 4180 escaping: commas, quotes and newlines are quoted; quotes doubled', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('cr\rhere')).toBe('"cr\rhere"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12)).toBe('12');
  });

  it('formula-looking cells get a leading single quote', () => {
    for (const value of ['=SUM(A1:A2)', '+1', '-2+3', '@cmd', '\tx', '\rx']) {
      expect(csvCell(value).replace(/^"/, '').startsWith(`'${value[0]}`)).toBe(true);
    }
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvCell('-500.00')).toBe("'-500.00"); // in a free-text column it is still text
    expect(csvCell('safe = later')).toBe('safe = later');
  });

  it('numeric columns are never prefixed (negatives included); a non-number in one is treated as text', () => {
    expect(csvCell('-500.00', true)).toBe('-500.00');
    expect(csvCell('1250.50', true)).toBe('1250.50');
    expect(csvCell(-3, true)).toBe('-3');
    expect(csvCell(0, true)).toBe('0');
    expect(csvCell('-1+1', true)).toBe("'-1+1");
    expect(csvCell('=1+1', true)).toBe("'=1+1");
    expect(csvCell('+5', true)).toBe("'+5");
    const csv = toCsv(['Description', num('Amount (INR)'), num('Count')], [['=HYPERLINK("http://x","y")', '-500.00', 2], ['-refund', '10.00', 1]]);
    expect(csv).toBe(`﻿Description,Amount (INR),Count\r\n"'=HYPERLINK(""http://x"",""y"")",-500.00,2\r\n'-refund,10.00,1\r\n`);
  });

  it('a document has a UTF-8 BOM, a header row and CRLF line ends', () => {
    const csv = toCsv(['A', 'B'], [['₹1', 'x,y']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe('﻿A,B\r\n₹1,"x,y"\r\n');
  });
});
