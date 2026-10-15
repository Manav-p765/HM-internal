// The availability rules (services/availability.ts): a pure unit test of deriveAvailability, then the
// database-backed availabilityFor with an injected clock.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, query } from '../src/db.js';
import { availabilityFor, dayStatus, deriveAvailability, ONLINE_WINDOW_MS, type AvailabilityFacts } from '../src/services/availability.js';
import { countWeekdays, istDate, isWeekend } from '../src/services/clock.js';
import { employee, resetAll, user } from './fixtures.js';

// Wednesday 2026-10-14, 11:00 IST.
const NOW = new Date('2026-10-14T05:30:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const facts = (overrides: Partial<AvailabilityFacts>): AvailabilityFacts => ({
  onFullDayLeave: false,
  punchedIn: false,
  punchedOut: false,
  lastSeenAt: null,
  ...overrides,
});

describe('dayStatus (shared by the roster and availability)', () => {
  it('approved full-day leave wins over a punch; otherwise a punch means present', () => {
    expect(dayStatus({ onFullDayLeave: true, punchedIn: true })).toBe('on_leave');
    expect(dayStatus({ onFullDayLeave: true, punchedIn: false })).toBe('on_leave');
    expect(dayStatus({ onFullDayLeave: false, punchedIn: true })).toBe('present');
    expect(dayStatus({ onFullDayLeave: false, punchedIn: false })).toBe('absent');
  });
});

describe('deriveAvailability (rules in order)', () => {
  it('on_leave: approved full-day leave wins over everything, even an open record with a fresh heartbeat', () => {
    expect(deriveAvailability(facts({ onFullDayLeave: true }), NOW)).toBe('on_leave');
    expect(deriveAvailability(facts({ onFullDayLeave: true, punchedIn: true, lastSeenAt: minutesAgo(0) }), NOW)).toBe('on_leave');
  });

  it('online: punched in, not out, heartbeat within 5 minutes (inclusive)', () => {
    expect(deriveAvailability(facts({ punchedIn: true, lastSeenAt: minutesAgo(1) }), NOW)).toBe('online');
    expect(deriveAvailability(facts({ punchedIn: true, lastSeenAt: new Date(NOW.getTime() - ONLINE_WINDOW_MS) }), NOW)).toBe('online');
  });

  it('available: heartbeat older than 5 minutes, no heartbeat at all, or already punched out', () => {
    expect(deriveAvailability(facts({ punchedIn: true, lastSeenAt: new Date(NOW.getTime() - ONLINE_WINDOW_MS - 1) }), NOW)).toBe('available');
    expect(deriveAvailability(facts({ punchedIn: true, lastSeenAt: minutesAgo(6) }), NOW)).toBe('available');
    expect(deriveAvailability(facts({ punchedIn: true }), NOW)).toBe('available');
    expect(deriveAvailability(facts({ punchedIn: true, punchedOut: true, lastSeenAt: minutesAgo(0) }), NOW)).toBe('available');
  });

  it('not_in_today: no record today, even with a recent heartbeat', () => {
    expect(deriveAvailability(facts({}), NOW)).toBe('not_in_today');
    expect(deriveAvailability(facts({ lastSeenAt: minutesAgo(0) }), NOW)).toBe('not_in_today');
  });
});

describe('IST date helpers', () => {
  it('istDate switches at 18:30 UTC (IST midnight)', () => {
    expect(istDate(new Date('2026-10-14T18:29:59.999Z'))).toBe('2026-10-14');
    expect(istDate(new Date('2026-10-14T18:30:00.000Z'))).toBe('2026-10-15');
  });

  it('counts weekdays only', () => {
    expect(countWeekdays('2026-10-12', '2026-10-16')).toBe(5); // Mon-Fri
    expect(countWeekdays('2026-10-16', '2026-10-19')).toBe(2); // Fri-Mon over a weekend
    expect(countWeekdays('2026-10-17', '2026-10-18')).toBe(0); // Sat-Sun
    expect(isWeekend('2026-10-17')).toBe(true);
    expect(isWeekend('2026-10-16')).toBe(false);
  });
});

describe('availabilityFor (database, injected clock)', () => {
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    await resetAll();
    for (const name of ['Leave Full', 'Leave Half', 'Online', 'Stale', 'Out', 'Absent', 'Leave Yesterday']) {
      ids[name] = await employee(name);
    }
    const reviewer = await user('reviewer@example.test', 'admin');
    const leave = (employeeId: string, start: string, end: string, dayType: 'full' | 'half', status = 'approved') =>
      query(
        `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, day_type, half_day_period, total_days, reason, status, reviewed_by, reviewed_at)
         VALUES ($1, 'casual', $2, $3, $4, $5, 1, 'Fake reason', $6, $7, $8)`,
        [employeeId, start, end, dayType, dayType === 'half' ? 'first' : null, status, status === 'pending' ? null : reviewer, status === 'pending' ? null : NOW],
      );
    const punch = (employeeId: string, out: Date | null, lastSeen: Date | null) =>
      Promise.all([
        query(`INSERT INTO attendance_records (employee_id, work_date, punch_in, punch_out) VALUES ($1, '2026-10-14', $2, $3)`, [
          employeeId,
          minutesAgo(90),
          out,
        ]),
        query('UPDATE employees SET last_seen_at = $2 WHERE id = $1', [employeeId, lastSeen]),
      ]);

    await leave(ids['Leave Full'], '2026-10-13', '2026-10-15', 'full');
    await leave(ids['Leave Half'], '2026-10-14', '2026-10-14', 'half');
    await punch(ids['Leave Half'], null, minutesAgo(2)); // half-day leave + working: online, not on_leave
    await leave(ids['Leave Yesterday'], '2026-10-13', '2026-10-13', 'full');
    await leave(ids.Absent, '2026-10-14', '2026-10-14', 'full', 'pending'); // pending leave doesn't count
    await punch(ids.Online, null, minutesAgo(1));
    await punch(ids.Stale, null, minutesAgo(6));
    await punch(ids.Out, minutesAgo(10), minutesAgo(1));
  });

  afterAll(async () => {
    await pool.end();
  });

  it('derives all four states from the stored facts', async () => {
    const statuses = await availabilityFor(Object.values(ids), NOW);
    expect(Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, statuses.get(id)]))).toEqual({
      'Leave Full': 'on_leave',
      'Leave Half': 'online',
      Online: 'online',
      Stale: 'available',
      Out: 'available',
      Absent: 'not_in_today',
      'Leave Yesterday': 'not_in_today',
    });
  });

  it('follows the clock: 5 minutes later the online employee is available; the next IST day nobody is in', async () => {
    const later = new Date(NOW.getTime() + 5 * 60_000);
    expect((await availabilityFor([ids.Online], later)).get(ids.Online)).toBe('available');
    const tomorrow = new Date('2026-10-14T18:30:00Z'); // 00:00 IST on the 15th
    const statuses = await availabilityFor([ids.Online, ids['Leave Full']], tomorrow);
    expect(statuses.get(ids.Online)).toBe('not_in_today');
    expect(statuses.get(ids['Leave Full'])).toBe('on_leave'); // leave runs to the 15th
  });
});
