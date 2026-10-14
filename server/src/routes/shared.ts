// Small validation and SQL helpers shared by the routers.
import { z } from 'zod';

// Optional free text: trimmed, '' becomes null.
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform(v => (v ? v : null));

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  // Round-trip check: Date.parse alone accepts 2026-02-30 (rolling over to March 2).
  .refine(v => {
    const parsed = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
  }, 'Enter a valid date');

export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ILIKE pattern for a user search term, with %, _ and \ escaped.
export const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, c => `\\${c}`)}%`;

// Today's date in the company time zone, for "overdue" (deadline before today, not completed).
export const TODAY_SQL = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;
