import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Configuration comes from the environment (in development also from the .env file at the repo root; it
// never overrides variables that are already set). It is validated once at startup with zod, and the
// process exits with a list of the problems if anything is wrong. Messages name the variable and the
// rule, never the value, so secrets don't end up in logs.

// Variables that only make sense in development or tests. Production refuses to start if any is set.
export const DEV_ONLY_VARS = ['DB_SCHEMA', 'SEED', 'SEED_ON_START', 'ENABLE_SEED', 'DISABLE_RATE_LIMITS'] as const;

// Values copied from examples or docs, never acceptable as a production session secret.
const PLACEHOLDER = /change[-_ ]?me|replace|example|placeholder|your[-_ ]|secret|xxxx/i;

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

const blankToUndefined = (v: unknown) => (v === '' ? undefined : v);
const intVar = (def: number, min = 0) => z.preprocess(blankToUndefined, z.coerce.number().int().min(min).default(def));
const optionalString = z.preprocess(blankToUndefined, z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: intVar(4000, 1),
  DATABASE_URL: z.string().min(1, 'is required'),
  // Postgres schema to run in (the test suite uses DB_SCHEMA=hm_test). Development/test only.
  DB_SCHEMA: z.preprocess(blankToUndefined, z.string().regex(/^[a-z_][a-z0-9_]*$/, 'must be a plain schema name').optional()),
  SESSION_SECRET: z.string().min(1, 'is required'),
  APP_URL: z.preprocess(blankToUndefined, z.url('must be a URL').optional()),
  // Resend's HTTPS API (https://api.resend.com). When set, mail goes through it instead of SMTP; needed on
  // hosts that block outbound SMTP (Render's free tier blocks ports 25, 465 and 587). Never logged.
  RESEND_API_KEY: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: intVar(587, 1),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  // The sender address (e.g. no-reply@hybridmonks.com), for Resend and SMTP alike. EMAIL_FROM_NAME is the
  // display name.
  SMTP_FROM: optionalString,
  EMAIL_FROM_NAME: z.preprocess(blankToUndefined, z.string().max(100).default('Monks Internal Management')),
  // Optional Reply-To for every email (e.g. a monitored admin inbox), since SMTP_FROM is usually no-reply.
  SMTP_REPLY_TO: z.preprocess(blankToUndefined, z.email('must be a plain email address').optional()),
  // Express "trust proxy": a hop count, true/false, or a comma-separated list of addresses/subnets.
  TRUST_PROXY: z.preprocess(blankToUndefined, z.string().default('1')),
  DB_POOL_MAX: intVar(10, 1),
  DB_STATEMENT_TIMEOUT_MS: intVar(15_000),
  DB_IDLE_TIMEOUT_MS: intVar(30_000),
  DB_CONNECTION_TIMEOUT_MS: intVar(5_000),
  // Request log lines (method, path, status, duration; never bodies, cookies or query strings).
  LOG_REQUESTS: z.preprocess(blankToUndefined, z.enum(['true', 'false']).optional()),
});

export type Env = z.infer<typeof schema>;

export interface AppConfig extends Env {
  APP_URL: string;
  isProduction: boolean;
  isTest: boolean;
  appOrigin: string;
  trustProxy: boolean | number | string;
  logRequests: boolean;
  bcryptCost: number;
}

function parseTrustProxy(value: string): boolean | number | string {
  const v = value.trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v) === 0 ? false : Number(v);
  return value.trim();
}

// Pure: validates an environment object. Used at startup and by the tests.
export function parseConfig(raw: Record<string, string | undefined>): { ok: true; config: AppConfig } | { ok: false; errors: string[] } {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map(i => `${i.path.join('.') || '(config)'}: ${i.message}`) };
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';
  const errors: string[] = [];

  if (isProduction) {
    if (env.SESSION_SECRET.length < 32) errors.push('SESSION_SECRET: must be at least 32 characters in production');
    if (PLACEHOLDER.test(env.SESSION_SECRET) || new Set(env.SESSION_SECRET).size < 10) {
      errors.push('SESSION_SECRET: looks like an example or placeholder value; generate a random one (e.g. openssl rand -hex 32)');
    }
    if (!env.APP_URL) errors.push('APP_URL: is required in production (the public URL, e.g. https://internal.hybridmonks.com)');
    else {
      const url = new URL(env.APP_URL);
      // http is accepted only for a loopback address (the local production rehearsal behind a proxy).
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname))) {
        errors.push('APP_URL: must use https in production');
      }
      if (env.APP_URL.endsWith('/') || url.pathname !== '/' || url.search || url.hash) {
        errors.push('APP_URL: must be just the origin, with no path and no trailing slash');
      }
    }
    // Mail: Resend (RESEND_API_KEY) or SMTP (SMTP_HOST/USER/PASS), and a sender address either way.
    if (!env.SMTP_FROM) errors.push('SMTP_FROM: is required in production (the sender address, also used by Resend)');
    if (env.RESEND_API_KEY) {
      if (!/^re_[A-Za-z0-9_-]{8,}$/.test(env.RESEND_API_KEY) || PLACEHOLDER.test(env.RESEND_API_KEY)) {
        errors.push('RESEND_API_KEY: does not look like a Resend API key (they start with re_)');
      }
    } else {
      for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const) {
        if (!env[key]) errors.push(`${key}: is required in production unless RESEND_API_KEY is set`);
      }
    }
    if (env.SMTP_FROM && !z.email().safeParse(env.SMTP_FROM).success) {
      errors.push('SMTP_FROM: must be a plain email address (the display name goes in EMAIL_FROM_NAME)');
    }
    for (const key of DEV_ONLY_VARS) {
      if (raw[key] !== undefined && raw[key] !== '') errors.push(`${key}: is a development/test setting and must not be set in production`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const appUrl = env.APP_URL ?? 'http://localhost:3000';
  return {
    ok: true,
    config: {
      ...env,
      APP_URL: appUrl,
      isProduction,
      isTest: env.NODE_ENV === 'test',
      appOrigin: new URL(appUrl).origin,
      trustProxy: parseTrustProxy(env.TRUST_PROXY),
      logRequests: env.LOG_REQUESTS ? env.LOG_REQUESTS === 'true' : isProduction,
      // Cost 12 everywhere except the test suite, where hashing speed matters more than strength.
      bcryptCost: env.NODE_ENV === 'test' ? 4 : 12,
    },
  };
}

// The .env file lives at the repo root (same depth from src/ and dist/).
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env'), quiet: true });

const result = parseConfig(process.env);
if (!result.ok) {
  console.error(`Invalid configuration (NODE_ENV=${process.env.NODE_ENV ?? 'development'}). The server will not start:`);
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}

export const config: AppConfig = result.config;
