// Production readiness: config validation, Origin check, health endpoints, mail failures and logs.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { parseConfig } from '../src/config.js';
import { createOriginCheck } from '../src/middleware/security.js';
import { errorHandler } from '../src/middleware/errors.js';
import { describeError } from '../src/services/errorLog.js';
import { setRequestLogging } from '../src/middleware/requestLog.js';
import { testMail, testOutbox } from '../src/services/mail.js';
import { resetAll, signIn, user } from './fixtures.js';

const GOOD_SECRET = '9f2c4e8a1b7d3f6e0a5c9b2d8e4f1a7c3b6d0e9f2a5c8b1d4e7f0a3c6b9d2e5f';
const prod = (overrides: Record<string, string | undefined> = {}) => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://hm:pw@db:5432/hm',
  SESSION_SECRET: GOOD_SECRET,
  APP_URL: 'https://internal.hybridmonks.com',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USER: 'apikey',
  SMTP_PASS: 'smtp-pass-not-real',
  SMTP_FROM: 'no-reply@hybridmonks.com',
  ...overrides,
});
const errorsFor = (env: Record<string, string | undefined>) => {
  const r = parseConfig(env);
  return r.ok ? [] : r.errors;
};

describe('config (parseConfig)', () => {
  it('a complete production environment is accepted, with safe defaults', () => {
    const r = parseConfig(prod());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toMatchObject({
      isProduction: true,
      appOrigin: 'https://internal.hybridmonks.com',
      trustProxy: 1,
      logRequests: true,
      DB_POOL_MAX: 10,
      DB_STATEMENT_TIMEOUT_MS: 15000,
      DB_IDLE_TIMEOUT_MS: 30000,
      EMAIL_FROM_NAME: 'Monks Internal Management',
    });
  });

  it('missing production settings are each named', () => {
    const errors = errorsFor(prod({ APP_URL: undefined, SMTP_HOST: undefined, SMTP_USER: '', SMTP_PASS: undefined, SMTP_FROM: undefined }));
    for (const key of ['APP_URL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) expect(errors.join('\n')).toContain(`${key}:`);
    expect(errorsFor(prod({ DATABASE_URL: '' })).join('\n')).toContain('DATABASE_URL');
  });

  it('weak, short or example session secrets are refused, and the value is never printed', () => {
    for (const secret of ['short', 'change-me-change-me-change-me-change-me', 'replace-with-at-least-32-random-characters', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']) {
      const errors = errorsFor(prod({ SESSION_SECRET: secret }));
      expect(errors.some(e => e.startsWith('SESSION_SECRET:')), secret).toBe(true);
      expect(errors.join('\n')).not.toContain(secret);
    }
    // Development accepts any non-empty secret.
    expect(parseConfig({ DATABASE_URL: 'postgres://x', SESSION_SECRET: 'dev' }).ok).toBe(true);
  });

  it('APP_URL must be https without a path or trailing slash (http only for loopback rehearsals)', () => {
    expect(errorsFor(prod({ APP_URL: 'http://internal.hybridmonks.com' }))).toEqual(['APP_URL: must use https in production']);
    expect(errorsFor(prod({ APP_URL: 'https://internal.hybridmonks.com/' })).join()).toContain('no trailing slash');
    expect(errorsFor(prod({ APP_URL: 'https://internal.hybridmonks.com/app' })).join()).toContain('no path');
    expect(parseConfig(prod({ APP_URL: 'http://localhost:8088' })).ok).toBe(true);
    expect(parseConfig(prod({ APP_URL: 'http://127.0.0.1:8088' })).ok).toBe(true);
  });

  it('SMTP_FROM must be a plain address in production; dev-only variables are refused', () => {
    expect(errorsFor(prod({ SMTP_FROM: 'Monks <no-reply@hybridmonks.com>' })).join()).toContain('SMTP_FROM');
    for (const key of ['DB_SCHEMA', 'SEED', 'SEED_ON_START', 'ENABLE_SEED', 'DISABLE_RATE_LIMITS']) {
      expect(errorsFor(prod({ [key]: key === 'DB_SCHEMA' ? 'hm_test' : '1' })).join(), key).toContain(`${key}: is a development/test setting`);
    }
  });

  it('TRUST_PROXY accepts a hop count, true/false or an address list; pool settings are configurable', () => {
    const tp = (v: string) => {
      const r = parseConfig(prod({ TRUST_PROXY: v }));
      return r.ok ? r.config.trustProxy : 'invalid';
    };
    expect(tp('2')).toBe(2);
    expect(tp('0')).toBe(false);
    expect(tp('false')).toBe(false);
    expect(tp('true')).toBe(true);
    expect(tp('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
    const r = parseConfig(prod({ DB_POOL_MAX: '25', DB_STATEMENT_TIMEOUT_MS: '30000', LOG_REQUESTS: 'false' }));
    expect(r.ok && r.config).toMatchObject({ DB_POOL_MAX: 25, DB_STATEMENT_TIMEOUT_MS: 30000, logRequests: false });
    expect(errorsFor(prod({ DB_POOL_MAX: 'lots' })).join()).toContain('DB_POOL_MAX');
  });
});

describe('Origin check', () => {
  const appWith = (requireOrigin: boolean) => {
    const a = express();
    a.use(createOriginCheck({ allowed: ['https://internal.hybridmonks.com'], requireOrigin }));
    a.all('/x', (_req, res) => {
      res.json({ ok: true });
    });
    a.use(errorHandler);
    return a;
  };

  it('production: a mutating request needs the APP_URL origin; GETs are not checked', async () => {
    const a = appWith(true);
    expect((await request(a).post('/x').set('Origin', 'https://evil.example').expect(403)).body.code).toBe('BAD_ORIGIN');
    expect((await request(a).post('/x').expect(403)).body.code).toBe('ORIGIN_REQUIRED');
    expect((await request(a).delete('/x').expect(403)).body.code).toBe('ORIGIN_REQUIRED');
    await request(a).post('/x').set('Origin', 'https://internal.hybridmonks.com').expect(200);
    await request(a).get('/x').expect(200);
  });

  it('development: a missing Origin is allowed, a foreign one is not', async () => {
    const a = appWith(false);
    await request(a).post('/x').expect(200);
    await request(a).post('/x').set('Origin', 'http://evil.example').expect(403);
  });
});

describe('health endpoints', () => {
  it('/api/health says ok and db only; /api/health/ready reports migrations; nothing else leaks', async () => {
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body).toEqual({ ok: true, db: 'ok' });
    expect(health.headers['cache-control']).toBe('no-store');
    const ready = await request(app).get('/api/health/ready').expect(200);
    expect(ready.body).toEqual({ ok: true, db: 'ok', migrations: 'current' });
    for (const res of [health, ready]) {
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['content-security-policy']).toContain("script-src 'self'");
      expect(res.text).not.toMatch(/postgres|version|hm_test|stack/i);
    }
  });

  it('unknown /api routes are a JSON 404 without the query string', async () => {
    const res = await request(app).get('/api/nope?token=secret-looking-value').expect(404);
    expect(res.body).toEqual({ error: 'Not found: GET /api/nope', code: 'NOT_FOUND' });
  });
});

describe('mail failures and logs', () => {
  let output: string[];
  const capture = (...args: unknown[]) => {
    output.push(args.map(a => (typeof a === 'string' ? a : a instanceof Error ? `${a.message}\n${a.stack}` : JSON.stringify(a))).join(' '));
  };
  let admin: request.Agent;

  beforeEach(async () => {
    await resetAll();
    testOutbox.length = 0;
    testMail.failNext = false;
    await user('admin@example.test', 'admin');
    admin = await signIn('admin@example.test');
    output = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation(capture);
    const write = process.stdout.write.bind(process.stdout);
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown, ...rest: unknown[]) => {
      output.push(String(chunk));
      return (write as (...a: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof process.stdout.write);
    setRequestLogging(true);
  });

  afterEach(() => {
    setRequestLogging(false);
    vi.restoreAllMocks();
  });

  it('no temporary password, reset token or submitted password ever reaches the logs', async () => {
    await admin.post('/api/users').send({ email: 'new.person@example.test', role: 'employee' }).expect(201);
    const tempPassword = /Temporary password: (\S+)/.exec(testOutbox[0].text)![1];
    // The API response never contains it either.
    const list = await admin.get('/api/users').expect(200);
    expect(list.text).not.toContain(tempPassword);

    await request(app).post('/api/auth/forgot-password').send({ email: 'new.person@example.test' }).expect(200);
    await new Promise(r => setTimeout(r, 50)); // the reset email is sent in the background
    const token = /token=([^\s&]+)/.exec(testOutbox[1].text)![1];

    await request(app).post('/api/auth/login').send({ email: 'new.person@example.test', password: 'wrong-password-123' }).expect(401);
    await request(app).post('/api/auth/reset-password').send({ token: decodeURIComponent(token), newPassword: 'a-brand-new-password-1' }).expect(200);

    const logs = output.join('\n');
    expect(logs).toContain('POST /api/users 201'); // request logging was on
    expect(logs).toContain('POST /api/auth/reset-password 200');
    for (const secret of [tempPassword, token, decodeURIComponent(token), 'wrong-password-123', 'a-brand-new-password-1']) {
      expect(logs).not.toContain(secret);
    }
    expect(logs).not.toMatch(/hm\.sid|cookie|set-cookie/i);
  });

  it('a credentials email that cannot be sent: 502 MAIL_FAILED, nothing saved, only the SMTP code logged', async () => {
    testMail.failNext = true;
    const res = await admin.post('/api/users').send({ email: 'unlucky@example.test', role: 'employee' }).expect(502);
    expect(res.body).toEqual({ error: 'The email could not be sent, so nothing was changed. Try again later.', code: 'MAIL_FAILED' });
    expect(await query(`SELECT 1 FROM users WHERE email = 'unlucky@example.test'`)).toHaveLength(0);
    const logs = output.join('\n');
    expect(logs).toContain('Mail send failed: purpose=credentials code=EAUTH/535');
    expect(logs).not.toContain('unlucky@example.test');
  });

  it('a password-reset email that cannot be sent still answers the same generic 200', async () => {
    await user('someone@example.test', 'employee');
    testMail.failNext = true;
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'someone@example.test' }).expect(200);
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.test' }).expect(200);
    expect(res.body).toEqual(unknown.body);
    await new Promise(r => setTimeout(r, 50));
    expect(output.join('\n')).toContain('Mail send failed: purpose=password-reset code=EAUTH/535');
  });
});

afterAll(async () => {
  await pool.end();
});

describe('the 500 handler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs only the error class, its code and the route pattern, never values, SQL or parameters', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' ')));
    const err = Object.assign(new Error('duplicate key value violates unique constraint "x" secret-value@example.test'), {
      code: '23505',
      detail: 'Key (email)=(secret-value@example.test) already exists.',
      parameters: ['secret-value@example.test', 'salary-99999.00'],
      query: 'UPDATE users SET email = $1',
    });
    const req = { method: 'PATCH', baseUrl: '/api/users', route: { path: '/:id' }, originalUrl: '/api/users/abc?q=secret-query' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandler(err, req as never, res as never, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error', code: 'INTERNAL' });
    expect(lines).toEqual(['Unhandled error on PATCH /api/users/:id: Error code=23505']);
  });

  it('drops a code that is not a short token', () => {
    expect(describeError(Object.assign(new TypeError('x'), { code: 'value with spaces and secret' }))).toBe('TypeError');
    expect(describeError('a thrown string with a secret')).toBe('string');
    expect(describeError(null)).toBe('object');
  });
});
