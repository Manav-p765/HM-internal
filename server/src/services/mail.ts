import nodemailer from 'nodemailer';
import { config } from '../config.js';

interface Mail {
  to: string;
  subject: string;
  text: string;
}

// Test runs collect mail here instead of sending it.
export const testOutbox: Mail[] = [];

const transport = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    })
  : null;

// Called at startup: production must be able to send mail (new accounts and resets depend on it).
export function assertMailConfigured(): void {
  if (!config.isProduction) return;
  const missing = (['SMTP_HOST', 'SMTP_FROM'] as const).filter(key => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing mail configuration in production: ${missing.join(', ')}`);
  }
}

async function send(mail: Mail): Promise<void> {
  if (config.isTest) {
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
  await transport.sendMail({ from: config.SMTP_FROM, ...mail });
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
  });
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
  });
}
