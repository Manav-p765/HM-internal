import { config } from './config.js';
import { pool, waitForDatabase } from './db.js';
import { pendingMigrations } from './migrations.js';
import { assertMailConfigured, mailTransportName } from './services/mail.js';
import { app } from './app.js';

// Fail loudly at startup rather than on the first invite or password reset.
assertMailConfigured();

// A container may start before Postgres accepts connections: wait (about a minute) instead of crashing.
await waitForDatabase();

// Migrations are a separate release step (npm run db:migrate / the container's "migrate" command); they never
// run on boot. Starting with pending ones is allowed (e.g. during a rolling deploy) but loud, and
// /api/health/ready reports not ready until they are applied.
const pending = await pendingMigrations();
if (pending.length > 0) {
  console.warn(`WARNING: ${pending.length} migration(s) not applied (${pending.join(', ')}). Run the migrate release step.`);
}

const server = app.listen(config.PORT, () => {
  console.log(`Server listening on port ${config.PORT} (${config.NODE_ENV})`);
  const mail = mailTransportName();
  if (mail === 'console') {
    console.log('Neither RESEND_API_KEY nor SMTP_HOST is set: emails will be printed to this console instead of being sent.');
  } else {
    console.log(`Mail goes out through ${mail === 'resend' ? 'Resend (HTTPS API)' : 'SMTP'}.`);
  }
});

// Graceful shutdown (SIGTERM from the container runtime, SIGINT from a terminal): stop accepting new
// connections, let in-flight requests finish (up to SHUTDOWN_GRACE_MS), then close the database pool.
const SHUTDOWN_GRACE_MS = 10_000;
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received: closing the server`);
  const force = setTimeout(() => {
    console.error('Requests still open after the grace period; exiting');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  force.unref();
  server.close(err => {
    pool
      .end()
      .catch(() => {})
      .finally(() => {
        console.log('Server closed');
        process.exit(err ? 1 : 0);
      });
  });
  // Keep-alive connections with no request in flight would otherwise hold close() open.
  server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
