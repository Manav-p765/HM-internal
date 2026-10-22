// Mail through Resend's HTTPS API (Render's free tier blocks outbound SMTP). fetch is always mocked:
// nothing here reaches api.resend.com.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { config, parseConfig } from '../src/config.js';
import { pool, query } from '../src/db.js';
import {
  composeMail,
  createResendTransport,
  MailError,
  sendTestEmail,
  setMailTransportForTests,
  testOutbox,
} from '../src/services/mail.js';
import { resetAll, signIn, user } from './fixtures.js';

const FAKE_KEY = 're_FakeKeyForTests_9fK2m4Q7xZ1b8NcV';
const FROM = 'Monks Internal Management <no-reply@hybridmonks.com>';

type FetchArgs = [string, RequestInit];
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// A fetch that never answers but honours the abort signal, like a blocked port or a stalled provider.
const hangingFetch = ((_url: string, init: RequestInit) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal!.reason));
  })) as unknown as typeof fetch;

describe('config', () => {
  const prod = (overrides: Record<string, string | undefined>) => ({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://hm:pw@db:5432/hm',
    SESSION_SECRET: '9f2c4e8a1b7d3f6e0a5c9b2d8e4f1a7c3b6d0e9f2a5c8b1d4e7f0a3c6b9d2e5f',
    APP_URL: 'https://internal.hybridmonks.com',
    SMTP_FROM: 'no-reply@hybridmonks.com',
    ...overrides,
  });

  it('RESEND_API_KEY alone is enough in production (no SMTP_HOST/USER/PASS)', () => {
    const r = parseConfig(prod({ RESEND_API_KEY: FAKE_KEY }));
    expect(r.ok).toBe(true);
  });

  it('without RESEND_API_KEY, SMTP is required and the error points at RESEND_API_KEY', () => {
    const r = parseConfig(prod({}));
    expect(r.ok).toBe(false);
    const errors = r.ok ? '' : r.errors.join('\n');
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) expect(errors).toContain(`${key}: is required in production unless RESEND_API_KEY is set`);
  });

  it('a malformed key is refused without echoing it; SMTP_FROM is still required', () => {
    const bad = 'not-a-resend-key-SECRETVALUE';
    const r = parseConfig(prod({ RESEND_API_KEY: bad, SMTP_FROM: undefined }));
    expect(r.ok).toBe(false);
    const errors = r.ok ? '' : r.errors.join('\n');
    expect(errors).toContain('RESEND_API_KEY: does not look like a Resend API key');
    expect(errors).toContain('SMTP_FROM: is required in production');
    expect(errors).not.toContain(bad);
  });
});

describe('the Resend transport', () => {
  const mail = { to: 'someone@example.test', subject: 'Hello', text: 'Body', html: '<p>Body</p>' };

  it('POSTs to /emails with the bearer key, the "Name <address>" sender and the recipient', async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => json(200, { id: 'msg_123' }));
    const t = createResendTransport({ apiKey: FAKE_KEY, from: FROM, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(t.send(mail, 'test')).resolves.toBe('msg_123');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(JSON.parse(String(init.body))).toEqual({ from: FROM, to: ['someone@example.test'], subject: 'Hello', text: 'Body', html: '<p>Body</p>' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends reply_to only when a Reply-To is set', async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => json(200, { id: 'msg_123' }));
    const t = createResendTransport({ apiKey: FAKE_KEY, from: FROM, fetchImpl: fetchImpl as unknown as typeof fetch });
    await t.send({ ...mail, replyTo: 'admin@example.test' }, 'test');
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1].body)).reply_to).toBe('admin@example.test');
  });

  it('a 4xx becomes MailError RESEND_<status>/<name>, never the provider message', async () => {
    const fetchImpl = (async () =>
      json(422, { statusCode: 422, name: 'validation_error', message: 'Invalid `to` field: someone@example.test' })) as unknown as typeof fetch;
    const t = createResendTransport({ apiKey: FAKE_KEY, from: FROM, fetchImpl });
    const err = await t.send(mail, 'test').catch(e => e);
    expect(err).toBeInstanceOf(MailError);
    expect(err.code).toBe('RESEND_422/validation_error');
    expect(err.message).not.toContain('someone@example.test');
  });

  it('gives up after the timeout with code TIMEOUT', async () => {
    const t = createResendTransport({ apiKey: FAKE_KEY, from: FROM, timeoutMs: 50, fetchImpl: hangingFetch });
    const started = Date.now();
    const err = await t.send(mail, 'test').catch(e => e);
    expect(err).toBeInstanceOf(MailError);
    expect(err.code).toBe('TIMEOUT');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('a network failure is NETWORK; the global fetch is used when none is injected', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const t = createResendTransport({ apiKey: FAKE_KEY, from: FROM });
    const err = await t.send(mail, 'test').catch(e => e);
    expect(err.code).toBe('NETWORK');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe('creating a login with Resend as the transport', () => {
  let admin: request.Agent;
  let logs: string[];

  beforeEach(async () => {
    await resetAll();
    testOutbox.length = 0;
    await user('admin@example.test', 'admin');
    admin = await signIn('admin@example.test');
    logs = [];
    const capture = (...args: unknown[]) => void logs.push(args.map(a => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join(' '));
    for (const method of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation(capture);
  });

  afterEach(() => {
    setMailTransportForTests(null);
    vi.restoreAllMocks();
  });

  function useResend(fetchImpl: typeof fetch, timeoutMs?: number) {
    setMailTransportForTests(createResendTransport({ apiKey: FAKE_KEY, from: FROM, fetchImpl, timeoutMs }));
  }

  function expectCleanLogs(...secrets: string[]) {
    const text = logs.join('\n');
    for (const secret of [FAKE_KEY, ...secrets]) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/token=|set-password\?|Bearer/i);
  }

  const tokenIn = (body: string) => decodeURIComponent(/token=(\S+)/.exec((JSON.parse(body) as { text: string }).text)![1]);

  it('success: 201, the invite link goes to Resend only, not to the logs or the response', async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => json(200, { id: 'msg_ok' }));
    useResend(fetchImpl as unknown as typeof fetch);
    const res = await admin.post('/api/users').send({ email: 'new.person@example.test', role: 'employee' }).expect(201);

    const sent = JSON.parse(String(fetchImpl.mock.calls[0][1].body)) as { to: string[]; subject: string; text: string; html: string };
    expect(sent.to).toEqual(['new.person@example.test']);
    expect(sent.subject).toBe('Set your password');
    // The same link in both parts, on APP_URL's host, shown as itself (no redirect or tracking link).
    const link = /(\S+\/set-password\?token=\S+)/.exec(sent.text)![1];
    expect(new URL(link).origin).toBe(new URL(config.APP_URL).origin);
    expect(sent.html).toContain(`<a href="${link}"`);
    expect(sent.html).toContain(`>${link}</a>`);
    expect(sent.html.match(/href=/g)).toHaveLength(1);
    expect(sent.html).not.toMatch(/<img|<script|https?:\/\/(?!localhost)[^"]*\.(png|gif|jpg)/i);
    const token = tokenIn(String(fetchImpl.mock.calls[0][1].body));
    expect(res.text).not.toContain(token);
    expect(testOutbox).toHaveLength(0);
    expectCleanLogs(token);
  });

  it('4xx from Resend: 502 MAIL_FAILED, nothing saved, only purpose/transport/code logged', async () => {
    let body = '';
    useResend((async (_url: string, init: RequestInit) => {
      body = String(init.body);
      return json(403, { statusCode: 403, name: 'validation_error', message: 'The hybridmonks.com domain is not verified' });
    }) as unknown as typeof fetch);
    const res = await admin.post('/api/users').send({ email: 'unlucky@example.test', role: 'employee' }).expect(502);
    expect(res.body).toEqual({ error: 'The email could not be sent, so nothing was changed. Try again later.', code: 'MAIL_FAILED' });
    expect(await query(`SELECT 1 FROM users WHERE email = 'unlucky@example.test'`)).toHaveLength(0);
    expect(await query(`SELECT 1 FROM audit_logs WHERE action = 'user.created'`)).toHaveLength(0);

    expect(await query('SELECT 1 FROM password_tokens')).toHaveLength(0);

    expect(logs.join('\n')).toContain('Mail send failed: purpose=invite transport=resend code=RESEND_403/validation_error');
    expectCleanLogs(tokenIn(body), 'unlucky@example.test', 'not verified');
  });

  it('timeout: 502 MAIL_FAILED quickly, nothing saved', async () => {
    useResend(hangingFetch, 100);
    const started = Date.now();
    const res = await admin.post('/api/users').send({ email: 'slow@example.test', role: 'employee' }).expect(502);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(res.body.code).toBe('MAIL_FAILED');
    expect(await query(`SELECT 1 FROM users WHERE email = 'slow@example.test'`)).toHaveLength(0);
    expect(await query('SELECT 1 FROM password_tokens')).toHaveLength(0);
    expect(logs.join('\n')).toContain('Mail send failed: purpose=invite transport=resend code=TIMEOUT');
    expectCleanLogs('slow@example.test');
  });

  it('a resend-invite that cannot be sent: 502, the new link is dropped and the old one still works', async () => {
    const created = await admin.post('/api/users').send({ email: 'keep@example.test', role: 'employee' }).expect(201);
    const oldToken = /token=(\S+)/.exec(testOutbox[0].text)![1];
    useResend((async () => json(500, { name: 'internal_server_error' })) as unknown as typeof fetch);
    await admin.post(`/api/users/${created.body.user.id}/resend-invite`).send({}).expect(502);
    expect(await query('SELECT 1 FROM password_tokens')).toHaveLength(1);
    setMailTransportForTests(null);
    await request(app).get('/api/auth/set-password/check').query({ token: decodeURIComponent(oldToken) }).expect(200);
  });

  it('mail:test goes through the same transport', async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => json(200, { id: 'msg_test' }));
    useResend(fetchImpl as unknown as typeof fetch);
    await expect(sendTestEmail('me@example.test')).resolves.toBe('msg_test');
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1].body)).subject).toBe('Test email from Monks Internal Management');

    useResend((async () => json(401, { name: 'missing_api_key' })) as unknown as typeof fetch);
    await expect(sendTestEmail('me@example.test')).rejects.toMatchObject({ code: 'RESEND_401/missing_api_key' });
    expectCleanLogs();
  });
});

afterAll(async () => {
  await pool.end();
});

describe('composeMail', () => {
  it('builds matching text and HTML parts, escapes the HTML, and adds Reply-To only when SMTP_REPLY_TO is set', () => {
    const mail = composeMail('x@example.test', 'Subject', { paragraphs: ['A <b>bold</b> & "quoted" claim'], link: 'http://localhost:3000/set-password?token=a&b' });
    expect(mail.text).toContain('A <b>bold</b> & "quoted" claim');
    expect(mail.html).toContain('A &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot; claim');
    expect(mail.html).toContain('href="http://localhost:3000/set-password?token=a&amp;b"');
    expect(mail).not.toHaveProperty('replyTo');

    const settings = config as { SMTP_REPLY_TO?: string };
    settings.SMTP_REPLY_TO = 'office@example.test';
    try {
      expect(composeMail('x@example.test', 'Subject', { paragraphs: ['Hi'] }).replyTo).toBe('office@example.test');
    } finally {
      delete settings.SMTP_REPLY_TO;
    }
  });

  it('SMTP_REPLY_TO must be a plain address', () => {
    const r = parseConfig({ NODE_ENV: 'development', DATABASE_URL: 'postgres://u:p@127.0.0.1:5440/db', SESSION_SECRET: 'x'.repeat(40), SMTP_REPLY_TO: 'Office <office@example.test>' });
    expect(r.ok).toBe(false);
  });
});
