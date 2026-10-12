import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// The .env file lives at the repo root (same depth from src/ and dist/).
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env'), quiet: true });

const isProduction = process.env.NODE_ENV === 'production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Optional Postgres schema to run in (used by the test suite: DB_SCHEMA=hm_test).
  DB_SCHEMA: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/)
    .optional(),
  SESSION_SECRET: isProduction
    ? z.string().min(32, 'SESSION_SECRET must be at least 32 characters in production')
    : z.string().min(1, 'SESSION_SECRET is required'),
  APP_URL: isProduction
    ? z.url('APP_URL must be set to the public URL in production')
    : z.url().default('http://localhost:3000'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.preprocess(v => (v === '' ? undefined : v), z.coerce.number().int().positive().default(587)),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  appOrigin: new URL(env.APP_URL).origin,
  // Cost 12 everywhere except the test suite, where hashing speed matters more than strength.
  bcryptCost: env.NODE_ENV === 'test' ? 4 : 12,
};
