import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { pool, query } from './db.js';
import { sessionMiddleware } from './session.js';
import { apiNotFound, errorHandler } from './middleware/errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');

const app = express();

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

api.use(apiNotFound);
app.use('/api', api);

if (config.isProduction) {
  app.use(express.static(clientDist, { index: false }));
  // SPA fallback: every non-/api GET gets index.html.
  app.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

const server = app.listen(config.PORT, () => {
  console.log(`Server listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
});

const shutdown = () => {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
