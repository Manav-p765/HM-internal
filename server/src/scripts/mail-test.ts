// Sends one test email through the configured transport (Resend when RESEND_API_KEY is set, else SMTP)
// and prints the result.
// Usage: npm run mail:test -- --to someone@example.com
//        (in the production container: docker compose ... run --rm app mail-test --to someone@example.com;
//         on Render: the Shell tab, or a one-off job running "hm-entrypoint mail-test --to ...")
// Prints the message id on success, or the provider's error code on failure (never the API key, the SMTP
// password or the full provider response). Exit code 0 on success, 1 on failure.
import { z } from 'zod';
import { config } from '../config.js';
import { fromHeader, MAIL_TIMEOUT_MS, MailError, mailTransportName, sendTestEmail } from '../services/mail.js';

const toIndex = process.argv.indexOf('--to');
const to = z
  .string()
  .trim()
  .pipe(z.email())
  .safeParse(toIndex === -1 ? undefined : process.argv[toIndex + 1]);
if (!to.success) {
  console.error('Usage: npm run mail:test -- --to someone@example.com');
  process.exit(1);
}

const transport = mailTransportName();
if (transport === 'resend') {
  console.log(`Resend HTTPS API (key set), from ${fromHeader() ?? '(SMTP_FROM not set)'}, timeout ${MAIL_TIMEOUT_MS / 1000} s`);
} else if (transport === 'smtp') {
  console.log(
    `SMTP ${config.SMTP_HOST}:${config.SMTP_PORT} as ${config.SMTP_USER ? 'an authenticated user' : 'no user'}, from ${fromHeader() ?? '(SMTP_FROM not set)'}, timeout ${MAIL_TIMEOUT_MS / 1000} s`,
  );
} else {
  console.error('FAILED: no mail transport is configured (set RESEND_API_KEY, or SMTP_HOST and its credentials).');
  process.exit(1);
}

try {
  const id = await sendTestEmail(to.data);
  console.log(`OK: test email accepted by ${transport === 'resend' ? 'Resend' : 'the SMTP server'} (message id ${id}).`);
} catch (err) {
  if (err instanceof MailError) {
    const hint =
      err.code === 'TIMEOUT'
        ? ' No answer in time: on hosts that block SMTP (Render free tier) use RESEND_API_KEY.'
        : err.code.startsWith('RESEND_401') || err.code.startsWith('RESEND_403')
          ? ' Check the API key and that the sending domain is verified in Resend.'
          : '';
    console.error(`FAILED: the provider refused the message or could not be reached (code ${err.code}).${hint}`);
  } else {
    console.error('FAILED: unexpected error while sending.');
  }
  process.exitCode = 1;
}
