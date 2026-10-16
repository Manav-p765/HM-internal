import nodemailer from 'nodemailer';
import { config } from '../config.js';

interface Mail {
  to: string;
  subject: string;
  text: string;
}

// What kind of email it is, for logs (never the recipient, the password or the link).
type MailPurpose = 'credentials' | 'password-reset' | 'test';

// A send that failed. Routes let it propagate: the credentials email is sent inside the DB transaction,
// so the account change is rolled back and the caller gets 502 MAIL_FAILED (errors.ts); the password reset
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
// SMTP authentication error would.
export const testOutbox: Mail[] = [];
export const testMail = { failNext: false };

// The SMTP error code only: nodemailer errors can carry the server's response and the command sent.
function smtpCode(err: unknown): string {
  const e = err as { code?: string; responseCode?: number };
  return [e.code, e.responseCode].filter(Boolean).join('/') || 'UNKNOWN';
}

const from = () => {
  if (!config.SMTP_FROM) return undefined;
  // A legacy "Name <address>" value is passed through; a plain address gets EMAIL_FROM_NAME.
  return config.SMTP_FROM.includes('<') ? config.SMTP_FROM : { name: config.EMAIL_FROM_NAME, address: config.SMTP_FROM };
};

const transport = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    })
  : null;

// Called at startup: production must be able to send mail (new accounts and resets depend on it).
// config.ts already refuses to start without SMTP_HOST/USER/PASS/FROM in production; this is a backstop.
export function assertMailConfigured(): void {
  if (!config.isProduction) return;
  const missing = (['SMTP_HOST', 'SMTP_FROM'] as const).filter(key => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing mail configuration in production: ${missing.join(', ')}`);
  }
}

async function send(mail: Mail, purpose: MailPurpose): Promise<void> {
  if (config.isTest) {
    if (testMail.failNext) {
      testMail.failNext = false;
      console.error(`Mail send failed: purpose=${purpose} code=EAUTH/535`);
      throw new MailError(purpose, 'EAUTH/535');
    }
    testOutbox.push(mail);
    return;
  }
  if (!transport) {
    if (config.isProduction) throw new Error('SMTP is not configured');
    // Dev without SMTP: print the whole email. This is the only place a temp password is ever logged.
    console.log(
      [
        '',
        '----- DEV MAIL (SMTP_HOST not set; nothing was sent) -----',
        `To: ${mail.to}`,
        `Subject: ${mail.subject}`,
        '',
        mail.text,
        '-----------------------------------------------------------',
        '',
      ].join('\n'),
    );
    return;
  }
  try {
    await transport.sendMail({ from: from(), ...mail });
  } catch (err) {
    const code = smtpCode(err);
    console.error(`Mail send failed: purpose=${purpose} code=${code}`);
    throw new MailError(purpose, code);
  }
}

// npm run mail:test: one test message through the configured SMTP. Returns the message id or throws a
// MailError carrying the SMTP code.
export async function sendTestEmail(to: string): Promise<string> {
  if (!transport) throw new MailError('test', 'SMTP_HOST_NOT_SET');
  try {
    const info = await transport.sendMail({
      from: from(),
      to,
      subject: 'Monks Internal Management: test email',
      text: `This is a test message from Monks Internal Management (${config.APP_URL}). If you received it, outgoing mail works.

${SIGN_OFF}`,
    });
    return info.messageId;
  } catch (err) {
    throw new MailError('test', smtpCode(err));
  }
}

const SIGN_OFF = 'Monks Internal Management\nHybrid Monks LLP';

export function sendCredentialsEmail(to: string, tempPassword: string, isResend = false): Promise<void> {
  const intro = isResend
    ? 'Your sign-in details for Monks Internal Management have been reset by an administrator.'
    : 'An account has been created for you on Monks Internal Management.';
  return send({
    to,
    subject: isResend ? 'Your new temporary password' : 'Your Monks Internal Management account',
    text: [
      'Hello,',
      '',
      intro,
      '',
      `Sign in at: ${config.APP_URL}`,
      `Email: ${to}`,
      `Temporary password: ${tempPassword}`,
      '',
      'You will be asked to choose a new password the first time you sign in. Any earlier temporary password no longer works.',
      '',
      'If you were not expecting this email, please contact your administrator.',
      '',
      SIGN_OFF,
    ].join('\n'),
  }, 'credentials');
}

export function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${config.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return send({
    to,
    subject: 'Reset your Monks Internal Management password',
    text: [
      'Hello,',
      '',
      'We received a request to reset the password for your Monks Internal Management account.',
      '',
      'Use the link below to choose a new password. It can be used once and expires in 1 hour.',
      '',
      link,
      '',
      'If you did not request this, you can ignore this email; your password will not change.',
      '',
      SIGN_OFF,
    ].join('\n'),
  }, 'password-reset');
}
