/**
 * Date and reporting formatters. Money is formatted by formatMoney() in utils/money.ts (server strings).
 */

export function formatDate(dateString?: string): string {
  if (!dateString) return '—';
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return dateString;
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatMonthYear(monthStr: string): string {
  if (!monthStr) return '—';
  try {
    const [year, month] = monthStr.split('-').map(Number);
    if (!year || !month) return monthStr;
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return monthStr;
  }
}

// Browser-side CSV for the attendance and leave screens (the finance CSVs are built by the server,
// server/src/services/csv.ts, with the same rules). Numbers are written as-is; a text cell starting with
// = + - @ TAB or CR gets a leading single quote so a spreadsheet shows it as text instead of evaluating it.
// UTF-8 with a BOM, every cell quoted (RFC 4180), CRLF line ends.
export function exportToCSV(filename: string, headers: string[], rows: (string | number | undefined)[][]): void {
  const escapeValue = (val: string | number | undefined): string => {
    if (val === undefined || val === null) return '""';
    let str = String(val);
    if (typeof val !== 'number' && /^[=+\-@\t\r]/.test(str)) str = `'${str}`;
    return `"${str.replace(/"/g, '""')}"`;
  };

  const csvContent =
    '﻿' +
    [headers.map(escapeValue).join(','), ...rows.map(row => row.map(escapeValue).join(','))].join('\r\n') +
    '\r\n';

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


// Times are shown in the company time zone (IST), whatever the browser's zone is.
// The IST calendar date ('YYYY-MM-DD') of a timestamp. Never slice a UTC ISO string for this: between
// 00:00 and 05:30 IST that gives the previous day. (India has no daylight saving: always UTC+05:30.)
export function istDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

// A timestamp shown as a date, in IST ("16 Oct 2026").
export function formatDateIst(iso?: string | null): string {
  return iso ? formatDate(istDateOf(iso)) : '—';
}

export function formatTimeIst(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
}

// The IST clock time (HH:MM) of an ISO timestamp, for <input type="time">.
export function timeInputIst(iso?: string | null): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(11, 16);
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// Weekdays (Mon-Fri) between two YYYY-MM-DD dates inclusive. A preview only: the server computes total_days.
export function countWeekdays(start: string, end: string): number {
  if (!start || !end || end < start) return 0;
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
