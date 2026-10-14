import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { query } from './db.js';
import { sessionMiddleware } from './session.js';
import { apiNotFound, errorHandler } from './middleware/errors.js';
import { checkOrigin } from './middleware/security.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { employeesRouter } from './routes/employees.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');

export const app = express();

if (config.isProduction) {
  // Behind a reverse proxy / load balancer terminating TLS.
  app.set('trust proxy', 1);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // index.html loads Plus Jakarta Sans / JetBrains Mono from Google Fonts.
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'blob:'],
      },
    },
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const api = express.Router();
api.use(checkOrigin);
api.use(sessionMiddleware);

api.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    console.error('Health check DB query failed', err);
    res.status(503).json({ ok: false, error: 'database unavailable' });
  }
});

api.use('/auth', authRouter);
api.use('/users', usersRouter);
api.use('/employees', employeesRouter);

api.use(apiNotFound);
app.use('/api', api);

if (config.isProduction) {
  app.use(express.static(clientDist, { index: false }));
  // SPA fallback: every GET outside /api and /assets gets index.html (missing assets stay 404).
  app.get(/^(?!\/(api|assets)(\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);
