// The server's notion of "now" and of "today" in the company time zone (Asia/Kolkata).
// Attendance, presence and leave logic reads time only through here, never from the browser and never
// from Postgres now(), so tests can move the clock (setClock) and every rule follows.

let current: () => Date = () => new Date();

export function now(): Date {
  return current();
}

// Tests only: freeze or move the clock. Call resetClock() afterwards.
export function setClock(at: Date | string | (() => Date)): void {
  if (typeof at === 'function') current = at;
  else {
    const fixed = new Date(at);
    current = () => new Date(fixed);
  }
}

export function resetClock(): void {
  current = () => new Date();
}

// India has no daylight saving: IST is always UTC+05:30.
const IST_OFFSET_MS = 330 * 60 * 1000;

// 'YYYY-MM-DD' of the given instant in Asia/Kolkata.
export function istDate(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// Minutes since midnight in Asia/Kolkata (0-1439) of the given instant.
export function istMinutesOfDay(at: Date): number {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function todayIst(): string {
  return istDate(now());
}

// Attendance runs on working days, not calendar days: most shifts are at night (clients in the US and
// elsewhere), so a working day starts at 06:00 IST and ends at 05:59 the next morning. A punch-in at
// 01:30 IST on the 15th belongs to the working day of the 14th. Attendance, presence and "on leave
// today" use this; invoices, salary and the ledger keep the calendar date (istDate).
export const WORKDAY_START_IST = { hour: 6, minute: 0 };
const WORKDAY_START_MS = (WORKDAY_START_IST.hour * 60 + WORKDAY_START_IST.minute) * 60 * 1000;

// 'YYYY-MM-DD' of the working day the given instant falls in.
export function workDate(at: Date): string {
  return istDate(new Date(at.getTime() - WORKDAY_START_MS));
}

// Saturday and Sunday are not working days. `date` is 'YYYY-MM-DD'.
export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

// Weekdays (Mon-Fri) from start to end inclusive.
export function countWeekdays(start: string, end: string): number {
  let count = 0;
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
