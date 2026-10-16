import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { query } from './db.js';
import { pendingMigrations } from './migrations.js';
import { sessionMiddleware } from './session.js';
import { apiNotFound, errorHandler } from './middleware/errors.js';
import { checkOrigin, healthLimiter } from './middleware/security.js';
import { requestLog } from './middleware/requestLog.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { employeesRouter } from './routes/employees.js';
import { clientsRouter } from './routes/clients.js';
import { projectsRouter } from './routes/projects.js';
import { commentsRouter, tasksRouter } from './routes/tasks.js';
import { portalRouter } from './routes/portal.js';
import { attendanceRouter } from './routes/attendance.js';
import { presenceRouter, teamRouter } from './routes/presence.js';
import { leavesRouter } from './routes/leaves.js';
import { invoicesRouter } from './routes/invoices.js';
import { settingsRouter } from './routes/settings.js';
import { salaryRouter } from './routes/salary.js';
import { transactionsRouter } from './routes/transactions.js';
import { reportsRouter } from './routes/reports.js';
import { createRouter, mountRouter } from './middleware/access.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');

export const app = express();
// The /api router, exported for the route-matrix test.
export const api = express.Router();

app.disable('x-powered-by');
// Behind a reverse proxy / load balancer that terminates TLS: TRUST_PROXY (default 1 hop) makes req.ip the
// real client address (rate limits, logs) and req.secure follow X-Forwarded-Proto (secure cookies).
if (config.isProduction) app.set('trust proxy', config.trustProxy);

// Content Security Policy for the built SPA: scripts and styles only from this origin (the build has no
// inline script or style element; React style props go through the CSSOM, which CSP does not block), plus
// Google Fonts (index.html loads Plus Jakarta Sans / JetBrains Mono). Images: self, data: (the favicon is
// an inline SVG data URI) and blob:. No frames, plugins or foreign form targets.
const https = config.APP_URL.startsWith('https:');
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
        'script-src': ["'self'"],
        'script-src-attr': ["'none'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        // Only when the public URL is https (the local http rehearsal must not upgrade requests).
        ...(https ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },
    // HSTS only in production over https (a year, subdomains included). Browsers ignore it on http anyway.
    strictTransportSecurity: config.isProduction && https ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'same-origin' },
  }),
);
// Small JSON bodies only (the largest legitimate one is an invoice with 100 lines).
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
// No response compression: it would need a new dependency; the reverse proxy should compress instead.

api.use(requestLog);
api.use(checkOrigin);
api.use(sessionMiddleware);

// Every router is mounted with mountRouter() and every route declares its access (see middleware/access.ts).
const systemRouter = createRouter();

// Liveness: the process is up and can reach the database. Nothing else (no versions, hosts or errors).
systemRouter.get('/health', 'public', healthLimiter, async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await query('SELECT 1');
    res.json({ ok: true, db: 'ok' });
  } catch {
    res.status(503).json({ ok: false, db: 'unavailable' });
  }
});

// Readiness: the database is reachable and every migration file has been applied (the release step ran).
systemRouter.get('/health/ready', 'public', healthLimiter, async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const pending = await pendingMigrations();
    const ready = pending.length === 0;
    res.status(ready ? 200 : 503).json({ ok: ready, db: 'ok', migrations: ready ? 'current' : 'pending' });
  } catch {
    res.status(503).json({ ok: false, db: 'unavailable', migrations: 'unknown' });
  }
});

mountRouter(api, '/', systemRouter);
mountRouter(api, '/auth', authRouter);
mountRouter(api, '/users', usersRouter);
mountRouter(api, '/employees', employeesRouter);
mountRouter(api, '/clients', clientsRouter);
mountRouter(api, '/projects', projectsRouter);
mountRouter(api, '/tasks', tasksRouter);
mountRouter(api, '/comments', commentsRouter);
mountRouter(api, '/portal', portalRouter);
mountRouter(api, '/attendance', attendanceRouter);
mountRouter(api, '/presence', presenceRouter);
mountRouter(api, '/team', teamRouter);
mountRouter(api, '/leaves', leavesRouter);
mountRouter(api, '/invoices', invoicesRouter);
mountRouter(api, '/settings', settingsRouter);
mountRouter(api, '/salary', salaryRouter);
mountRouter(api, '/transactions', transactionsRouter);
mountRouter(api, '/reports', reportsRouter);

// Unknown /api routes: JSON 404, never the SPA.
api.use(apiNotFound);
app.use('/api', api);

if (config.isProduction) {
  // Hashed build assets (/assets/name-HASH.js) never change: cache for a year. Everything else
  // (index.html, the favicon) must be revalidated so a new deploy is picked up immediately.
  app.use(
    '/assets',
    express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '1y', index: false, fallthrough: false }),
  );
  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders: res => res.setHeader('Cache-Control', 'no-cache'),
    }),
  );
  // SPA fallback: every other GET gets index.html (client-side routes like /invoices/123).
  app.get(/^(?!\/(api|assets)(\/|$)).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);
