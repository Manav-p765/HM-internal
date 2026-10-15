// Report periods. The ONLY place a preset or a from/to pair becomes a date range. Pure: the caller passes
// today's IST date (services/clock.ts) and the financial year's first month (company_settings).
//   this_month / last_month: calendar months of the IST date
//   this_fy / last_fy:       12 months starting on the 1st of fyStartMonth (4 = April -> Apr 1 .. Mar 31)
// Either a preset or both from and to; a reversed range, a range over MAX_YEARS years or a half range is
// rejected with PeriodError.

export const PRESETS = ['this_month', 'last_month', 'this_fy', 'last_fy'] as const;
export type Preset = (typeof PRESETS)[number];

export const MAX_YEARS = 5;

export interface Period {
  from: string; // 'YYYY-MM-DD', inclusive
  to: string; // inclusive
  preset: Preset | null;
}

export class PeriodError extends Error {
  constructor(
    message: string,
    public path: 'preset' | 'from' | 'to',
  ) {
    super(message);
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

// First and last day of the month that is `offset` months from (year, month).
function monthRange(year: number, month: number, offset = 0): [string, string] {
  return [iso(utc(year, month + offset, 1)), iso(utc(year, month + offset + 1, 0))];
}

export function presetRange(preset: Preset, today: string, fyStartMonth = 4): [string, string] {
  const [y, m] = today.split('-').map(Number);
  switch (preset) {
    case 'this_month':
      return monthRange(y, m);
    case 'last_month':
      return monthRange(y, m, -1);
    case 'this_fy':
    case 'last_fy': {
      const startYear = (m >= fyStartMonth ? y : y - 1) - (preset === 'last_fy' ? 1 : 0);
      return [iso(utc(startYear, fyStartMonth, 1)), iso(utc(startYear + 1, fyStartMonth, 0))];
    }
  }
}

// A date at least MAX_YEARS years after `from` (inclusive range limit).
function maxEnd(from: string): string {
  const [y, m, d] = from.split('-').map(Number);
  return iso(new Date(Date.UTC(y + MAX_YEARS, m - 1, d - 1)));
}

export function resolvePeriod(
  input: { preset?: Preset; from?: string; to?: string },
  today: string,
  fyStartMonth = 4,
  fallback: Preset = 'this_month',
): Period {
  const { preset, from, to } = input;
  if (preset && (from || to)) throw new PeriodError('Use either a preset or a from/to range, not both', 'preset');
  if (preset || (!from && !to)) {
    const p = preset ?? fallback;
    const [f, t] = presetRange(p, today, fyStartMonth);
    return { from: f, to: t, preset: p };
  }
  if (!from) throw new PeriodError('Enter a start date', 'from');
  if (!to) throw new PeriodError('Enter an end date', 'to');
  if (from > to) throw new PeriodError('The start date must be on or before the end date', 'to');
  if (to > maxEnd(from)) throw new PeriodError(`A range can cover at most ${MAX_YEARS} years`, 'to');
  return { from, to, preset: null };
}

// The `months` calendar months ending with today's (IST), oldest first, as 'YYYY-MM'.
export function lastMonths(today: string, months: number): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: months }, (_, i) => iso(utc(y, m - (months - 1 - i), 1)).slice(0, 7));
}
