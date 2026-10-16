import type { Response } from 'express';
import { todayIst } from './clock.js';

// CSV downloads. The ONLY place CSV text is built.
//   RFC 4180: fields with a comma, double quote, CR or LF are quoted; quotes are doubled; lines end CRLF.
//   UTF-8 with a BOM, so spreadsheet apps detect the encoding (₹, names).
//   Formula injection: a FREE-TEXT cell starting with = + - @ TAB or CR gets a leading single quote, so a
//   spreadsheet shows it as text instead of evaluating it. Columns declared numeric (server-generated
//   amounts, totals, counts) are written as-is, negatives included ("-500.00"), but only when the value
//   really is a plain number; anything else in a numeric column is treated as text.

export const CSV_ROW_CAP = 50_000;
const BOM = '﻿';
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export type CsvCell = string | number | boolean | null | undefined;

// A column header: plain text (a free-text column) or num('Amount (INR)') for a numeric column.
export type CsvColumn = string | { header: string; numeric: true };
export const num = (header: string): CsvColumn => ({ header, numeric: true });

export function csvCell(value: CsvCell, numeric = false): string {
  let text = value === null || value === undefined ? '' : String(value);
  const isNumber = numeric && PLAIN_NUMBER.test(text);
  if (!isNumber && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: CsvColumn[], rows: CsvCell[][]): string {
  const numeric = columns.map(c => typeof c !== 'string');
  const header = columns.map(c => csvCell(typeof c === 'string' ? c : c.header)).join(',');
  const body = rows.map(row => row.map((cell, i) => csvCell(cell, numeric[i])).join(','));
  return BOM + [header, ...body].join('\r\n') + '\r\n';
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
