// Sends one test email through the configured SMTP server and prints the result.
// Usage: npm run mail:test -- --to someone@example.com
//        (in the production container: docker compose ... run --rm app mail-test --to someone@example.com)
// Prints the message id on success, or the SMTP error code on failure (never the password or the full
// server response). Exit code 0 on success, 1 on failure.
import { z } from 'zod';
import { config } from '../config.js';
import { MailError, sendTestEmail } from '../services/mail.js';

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

console.log(`SMTP ${config.SMTP_HOST ?? '(not set)'}:${config.SMTP_PORT} as ${config.SMTP_USER ? 'an authenticated user' : 'no user'}, from ${config.SMTP_FROM ?? '(not set)'}`);
try {
  const id = await sendTestEmail(to.data);
  console.log(`OK: test email accepted by the SMTP server (message id ${id}).`);
} catch (err) {
  if (err instanceof MailError) {
    console.error(`FAILED: the SMTP server refused or could not be reached (code ${err.code}).`);
  } else {
    console.error('FAILED: unexpected error while sending.');
  }
  process.exitCode = 1;
}
