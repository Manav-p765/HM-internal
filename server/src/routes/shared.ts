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
  .refine(v => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Enter a valid date');

export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ILIKE pattern for a user search term, with %, _ and \ escaped.
export const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, c => `\\${c}`)}%`;

// Today's date in the company time zone, for "overdue" (deadline before today, not completed).
export const TODAY_SQL = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;
