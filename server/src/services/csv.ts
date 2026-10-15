import type { Response } from 'express';
import { todayIst } from './clock.js';

// CSV downloads. The ONLY place CSV text is built.
//   RFC 4180: fields with a comma, double quote, CR or LF are quoted; quotes are doubled; lines end CRLF.
//   UTF-8 with a BOM, so spreadsheet apps detect the encoding (₹, names).
//   Formula injection: a cell starting with = + - @ TAB or CR gets a leading single quote, so a spreadsheet
//   shows it as text instead of evaluating it (this includes negative amounts such as "-500.00").

export const CSV_ROW_CAP = 50_000;
const BOM = '﻿';
const FORMULA_START = /^[=+\-@\t\r]/;

export type CsvCell = string | number | boolean | null | undefined;

export function csvCell(value: CsvCell): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return BOM + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// Sends a CSV download. The filename is built from fixed text and the server date only, never user input.
// `capped` adds X-Row-Cap-Reached so the UI can say the file stopped at CSV_ROW_CAP rows.
export function sendCsv(res: Response, baseName: string, csv: string, capped = false): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}-${todayIst()}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  if (capped) res.setHeader('X-Row-Cap-Reached', 'true');
  res.send(csv);
}
