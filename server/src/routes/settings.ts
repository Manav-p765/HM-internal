import { z } from 'zod';
import { query } from '../db.js';
import { audit } from '../services/audit.js';
import { percentValue } from '../services/money.js';
import { createRouter } from '../middleware/access.js';
import { HttpError, parseBody } from '../middleware/errors.js';
import { optionalEmail, optionalGstin, optionalText } from './shared.js';

// Company settings: the single company_settings row (what invoices and their print page show).
// Admin only (managers see no money: no invoices, bank details or tax rates); only admins change it. Employees and clients
// are refused. The currency is fixed to INR.
export const settingsRouter = createRouter();

export const COMPANY_COLUMNS = `
  company_name AS "companyName", company_address AS "companyAddress", company_phone AS "companyPhone",
  company_email AS "companyEmail", company_gstin AS "companyGstin", default_gst_rate AS "defaultGstRate",
  invoice_prefix AS "invoicePrefix", currency, bank_details AS "bankDetails", terms,
  invoice_next_number AS "invoiceNextNumber", logo_data_url AS "logoDataUrl", updated_at AS "updatedAt"`;

// The number the next invoice will get, e.g. HM-0007 (zero-padded to 4 digits; longer when it outgrows them).
export function formatInvoiceNumber(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(4, '0')}`;
}

async function loadCompany() {
  const [row] = await query<{ invoicePrefix: string; invoiceNextNumber: number } & Record<string, unknown>>(
    `SELECT ${COMPANY_COLUMNS} FROM company_settings`,
  );
  return { ...row, nextInvoiceNumber: formatInvoiceNumber(row.invoicePrefix, row.invoiceNextNumber) };
}

// ---------------------------------------------------------------------------
// GET /api/settings/company  (admin)
// ---------------------------------------------------------------------------
settingsRouter.get('/company', ['admin'], async (_req, res) => {
  res.json({ company: await loadCompany() });
});

// Logo: a base64 data URL of a PNG, JPEG or WebP image of at most 150 KB, or null to remove it. SVG is
// refused (it can carry script). The declared type must match the file's own signature, so a renamed file
// or arbitrary bytes are rejected. Migration 011 repeats the shape and size check.
const LOGO_MAX_BYTES = 150 * 1024;
const LOGO_PATTERN = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const LOGO_SIGNATURE: Record<string, (b: Buffer) => boolean> = {
  png: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpeg: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

function logoProblem(value: string): string | null {
  const invalid = 'Logo must be a PNG, JPEG or WebP image';
  const match = LOGO_PATTERN.exec(value);
  if (!match || match[2].length % 4 !== 0) return invalid;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > LOGO_MAX_BYTES) return 'Logo must be at most 150 KB';
  return LOGO_SIGNATURE[match[1]](bytes) ? null : invalid;
}

const logoValue = z
  .string()
  .max(210_000, 'Logo must be at most 150 KB')
  .superRefine((value, ctx) => {
    const problem = logoProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  })
  .nullable();

// ---------------------------------------------------------------------------
// PATCH /api/settings/company  (admin)
// Changing the prefix only affects invoices numbered from now on; existing numbers never change.
// ---------------------------------------------------------------------------
const patchSchema = z
  .object({
    companyName: z.string().trim().min(1, 'Company name is required').max(200),
    companyAddress: optionalText(1000),
    companyPhone: optionalText(40),
    companyEmail: optionalEmail,
    companyGstin: optionalGstin,
    defaultGstRate: percentValue('Default GST rate'),
    invoicePrefix: z
      .string()
      .trim()
      .min(1, 'Invoice prefix is required')
      .max(20)
      .regex(/^[A-Za-z0-9/_-]+$/, 'Use letters, digits, "-", "_" or "/" only'),
    bankDetails: optionalText(2000),
    terms: optionalText(4000),
    logoDataUrl: logoValue,
  })
  .partial()
  .strict()
  .refine(body => Object.keys(body).length > 0, 'Nothing to update');

const COLUMN: Record<string, string> = {
  companyName: 'company_name',
  companyAddress: 'company_address',
  companyPhone: 'company_phone',
  companyEmail: 'company_email',
  companyGstin: 'company_gstin',
  defaultGstRate: 'default_gst_rate',
  invoicePrefix: 'invoice_prefix',
  bankDetails: 'bank_details',
  terms: 'terms',
  logoDataUrl: 'logo_data_url',
};

settingsRouter.patch('/company', ['admin'], async (req, res) => {
  const body = parseBody(patchSchema, req.body);
  const fields = Object.keys(body).filter(k => k in COLUMN);
  if (fields.length === 0) throw new HttpError(400, 'Nothing to update', 'VALIDATION_ERROR');
  const params: unknown[] = [];
  const sets = fields.map(f => {
    params.push((body as Record<string, unknown>)[f]);
    return `${COLUMN[f]} = $${params.length}`;
  });
  await query(`UPDATE company_settings SET ${sets.join(', ')}`, params);
  await audit(req, { action: 'settings.company_updated', entityType: 'company_settings', metadata: { fields } });
  res.json({ company: await loadCompany() });
});
