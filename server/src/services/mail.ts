import nodemailer from 'nodemailer';
import { config } from '../config.js';

// Every email has a plain-text part and an HTML part with the same words and the same single link (whose
// visible text is the URL itself, on APP_URL's host), a short plain subject, and an optional Reply-To
// (SMTP_REPLY_TO). No images, no tracking pixels, no redirect links: Resend's open/click tracking must stay
// off for the sending domain (docs/DEPLOY.md), so the link a user sees is the link they open.
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

// What kind of email it is, for logs (never the recipient, the password or the link).
type MailPurpose = 'invite' | 'password-reset' | 'test';

// A send that failed. An invite or admin reset link is sent after its DB transaction has committed; the route
// then removes what it created and lets the error propagate as 502 MAIL_FAILED (errors.ts). The forgot-password
// email is sent in the background and only logged, so the response never reveals anything.
export class MailError extends Error {
  constructor(
    public purpose: MailPurpose,
    public code: string,
  ) {
    super(`Could not send the ${purpose} email (${code})`);
  }
}

// Test runs collect mail here instead of sending it. testMail.failNext makes the next send fail like an
// SMTP authentication error would. setMailTransportForTests() sends through a real transport instead
// (Resend with a mocked fetch).
export const testOutbox: Mail[] = [];
export const testMail = { failNext: false };

// Every send gives up after this long, so a blocked port or a slow provider becomes a quick 502, not a
// request that hangs.
export const MAIL_TIMEOUT_MS = 10_000;

export interface MailTransport {
  name: 'resend' | 'smtp';
  /** Sends one message and resolves with the provider's message id. Throws a MailError on any failure. */
  send(mail: Mail, purpose: MailPurpose): Promise<string>;
}

// A short, log-safe token from a provider value (error names, codes, ids); anything else is dropped.
function token(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_./-]{1,64}$/.test(value) ? value : undefined;
}

// The SMTP error code only: nodemailer errors can carry the server's response and the command sent.
function smtpCode(err: unknown): string {
  const e = err as { code?: unknown; responseCode?: number };
  return [token(e.code), e.responseCode].filter(Boolean).join('/') || 'UNKNOWN';
}

class MailTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new MailTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// "Name <address>" from EMAIL_FROM_NAME and SMTP_FROM (a legacy value that already has a name is kept).
export function fromHeader(): string | undefined {
  if (!config.SMTP_FROM) return undefined;
  if (config.SMTP_FROM.includes('<')) return config.SMTP_FROM;
  const name = config.EMAIL_FROM_NAME.replace(/["\\\r\n<>]/g, '');
  return `${name} <${config.SMTP_FROM}>`;
}

// Resend's HTTPS API (POST /emails), for hosts that block outbound SMTP. Failures are reduced to a code:
// RESEND_<status>[/<error name>], TIMEOUT or NETWORK. Never the response message (it can quote the
// recipient), the request body (the set-password link) or the API key.
export function createResendTransport(opts: {
  apiKey: string;
  from: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): MailTransport {
  const timeoutMs = opts.timeoutMs ?? MAIL_TIMEOUT_MS;
  return {
    name: 'resend',
    async send(mail, purpose) {
      const doFetch = opts.fetchImpl ?? fetch;
      // One deadline for the request and reading the reply.
      const signal = AbortSignal.timeout(timeoutMs);
      let response: Response;
      let data: { id?: unknown; name?: unknown } | null;
      try {
        response = await doFetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: opts.from,
            to: [mail.to],
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
            ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
          }),
          signal,
        });
        data = (await response.json().catch(() => null)) as typeof data;
      } catch (err) {
        const name = (err as { name?: unknown }).name;
        throw new MailError(purpose, name === 'TimeoutError' || name === 'AbortError' || signal.aborted ? 'TIMEOUT' : 'NETWORK');
      }
      if (!response.ok) {
        const name = token(data?.name);
        throw new MailError(purpose, `RESEND_${response.status}${name ? `/${name}` : ''}`);
      }
      return token(data?.id) ?? '(no id)';
    },
  };
}

// nodemailer over SMTP, with its connect/greeting/socket timeouts plus an overall cap.
function createSmtpTransport(timeoutMs = MAIL_TIMEOUT_MS): MailTransport {
  const smtp = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  });
  return {
    name: 'smtp',
    async send(mail, purpose) {
      try {
        const { to, subject, text, html, replyTo } = mail;
        const info = await withTimeout(smtp.sendMail({ from: fromHeader(), to, subject, text, html, replyTo }), timeoutMs);
        return token(info.messageId) ?? '(no id)';
      } catch (err) {
        throw new MailError(purpose, err instanceof MailTimeout ? 'TIMEOUT' : smtpCode(err));
      }
    },
  };
}

// Resend when RESEND_API_KEY is set, else SMTP when SMTP_HOST is set, else none (development prints mail).
function configuredTransport(): MailTransport | null {
  if (config.RESEND_API_KEY) return createResendTransport({ apiKey: config.RESEND_API_KEY, from: fromHeader() ?? '' });
  return config.SMTP_HOST ? createSmtpTransport() : null;
}

const transport = configuredTransport();
let testTransport: MailTransport | null = null;

export function setMailTransportForTests(next: MailTransport | null): void {
  if (!config.isTest) throw new Error('setMailTransportForTests is for the test suite only');
  testTransport = next;
}

/** Which transport is in use, for startup and mail:test messages (never a credential). */
export function mailTransportName(): 'resend' | 'smtp' | 'console' {
  return transport?.name ?? 'console';
}

// Called at startup: production must be able to send mail (new accounts and resets depend on it).
// config.ts already refuses to start without it in production; this is a backstop.
export function assertMailConfigured(): void {
  if (!config.isProduction) return;
  if (!config.SMTP_FROM || !transport) {
    throw new Error('Missing mail configuration in production: set RESEND_API_KEY (or SMTP_HOST) and SMTP_FROM');
  }
}

// Logs a failure as purpose, transport and code only.
async function deliver(t: MailTransport, mail: Mail, purpose: MailPurpose): Promise<string> {
  try {
    return await t.send(mail, purpose);
  } catch (err) {
    const failure = err instanceof MailError ? err : new MailError(purpose, 'UNKNOWN');
    console.error(`Mail send failed: purpose=${purpose} transport=${t.name} code=${failure.code}`);
    throw failure;
  }
}

async function send(mail: Mail, purpose: MailPurpose): Promise<void> {
  if (config.isTest) {
    if (testTransport) {
      await deliver(testTransport, mail, purpose);
      return;
    }
    if (testMail.failNext) {
      testMail.failNext = false;
      console.error(`Mail send failed: purpose=${purpose} code=EAUTH/535`);
      throw new MailError(purpose, 'EAUTH/535');
    }
    testOutbox.push(mail);
    return;
  }
  if (!transport) {
    if (config.isProduction) throw new MailError(purpose, 'NOT_CONFIGURED');
    // Dev without a mail provider: print the whole email. This is the only place a set-password link is ever logged.
    console.log(
      [
        '',
        '----- DEV MAIL (no RESEND_API_KEY or SMTP_HOST; nothing was sent) -----',
        `To: ${mail.to}`,
        `Subject: ${mail.subject}`,
        '',
        mail.text,
        '-----------------------------------------------------------------------',
        '',
      ].join('\n'),
    );
    return;
  }
  await deliver(transport, mail, purpose);
}

// npm run mail:test: one test message through the configured transport (Resend or SMTP). Returns the
// message id or throws a MailError carrying the provider code.
export async function sendTestEmail(to: string): Promise<string> {
  const t = (config.isTest ? testTransport : null) ?? transport;
  if (!t) throw new MailError('test', 'NOT_CONFIGURED');
  return deliver(
    t,
    composeMail(to, 'Test email from Monks Internal Management', {
      paragraphs: [`This is a test message from Monks Internal Management (${config.APP_URL}). If you received it, outgoing mail works.`],
    }),
    'test',
  );
}

const SIGN_OFF = ['Monks Internal Management', 'Hybrid Monks LLP'];

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

// One message in both formats from the same words: greeting, paragraphs, at most one link (shown as itself),
// closing paragraphs and the sign-off. The HTML is plain and inline-styled: no images, scripts or assets.
export function composeMail(to: string, subject: string, body: { paragraphs: string[]; link?: string; after?: string[] }): Mail {
  const after = body.after ?? [];
  const text = [
    'Hello,',
    '',
    ...body.paragraphs.flatMap(p => [p, '']),
    ...(body.link ? [body.link, ''] : []),
    ...after.flatMap(p => [p, '']),
    ...SIGN_OFF,
  ].join('\n');
  const para = (v: string) => `<p style="margin:0 0 16px">${escapeHtml(v)}</p>`;
  const html = [
    '<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827">',
    '<div style="max-width:560px">',
    para('Hello,'),
    ...body.paragraphs.map(para),
    body.link
      ? `<p style="margin:0 0 16px"><a href="${escapeHtml(body.link)}" style="color:#4338ca;word-break:break-all">${escapeHtml(body.link)}</a></p>`
      : '',
    ...after.map(para),
    `<p style="margin:24px 0 0;color:#6b7280">${SIGN_OFF.map(escapeHtml).join('<br>')}</p>`,
    '</div></body></html>',
  ].join('');
  return { to, subject, text, html, ...(config.SMTP_REPLY_TO ? { replyTo: config.SMTP_REPLY_TO } : {}) };
}

// The one link both emails carry, always on APP_URL (the public origin). Only ever built here; the token is
// never logged.
export const setPasswordLink = (token: string) => `${config.APP_URL}/set-password?token=${encodeURIComponent(token)}`;

export function sendInviteEmail(to: string, token: string): Promise<void> {
  return send(
    composeMail(to, 'Set your password', {
      paragraphs: ['An account has been created for you on Monks Internal Management. Open this link to choose your password:'],
      link: setPasswordLink(token),
      after: [
        'The link works once and expires in 72 hours. If it has expired, ask your administrator to send a new invite.',
        'If you were not expecting this email, you can ignore it.',
      ],
    }),
    'invite',
  );
}

export function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  return send(
    composeMail(to, 'Reset your password', {
      paragraphs: ['We received a request to reset the password for your Monks Internal Management account. Open this link to choose a new one:'],
      link: setPasswordLink(token),
      after: ['The link works once and expires in 1 hour.', 'If you did not request this, you can ignore this email; your password will not change.'],
    }),
    'password-reset',
  );
}
