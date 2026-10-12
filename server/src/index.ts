import { config } from './config.js';
import { pool } from './db.js';
import { assertMailConfigured } from './services/mail.js';
import { app } from './app.js';

// Fail loudly at startup rather than on the first invite or password reset.
assertMailConfigured();

const server = app.listen(config.PORT, () => {
  console.log(`Server listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
  if (!config.SMTP_HOST) {
    console.log('SMTP_HOST is not set: emails will be printed to this console instead of being sent.');
  }
});

const shutdown = () => {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
