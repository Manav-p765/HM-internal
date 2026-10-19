import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { hashToken } from '../services/passwords.js';
import { HttpError } from './errors.js';

// CSRF defence on top of the SameSite=Lax cookie. Browsers always send Origin on POST/PATCH/PUT/DELETE, so:
//   - a mutating request from another origin is rejected (403 BAD_ORIGIN);
//   - in production a mutating /api request WITHOUT an Origin header is rejected too (403 ORIGIN_REQUIRED):
//     only browsers use the API, and the only routes a non-browser client needs are the GET health checks;
//   - in development and tests a missing Origin is allowed (curl, supertest).
// GET/HEAD/OPTIONS never change anything and are not checked.
export function createOriginCheck(opts: { allowed: string[]; requireOrigin: boolean }): RequestHandler {
  const allowed = new Set(opts.allowed);
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) {
      if (opts.requireOrigin) throw new HttpError(403, 'Request origin required', 'ORIGIN_REQUIRED');
      return next();
    }
    if (!allowed.has(origin)) throw new HttpError(403, 'Request origin not allowed', 'BAD_ORIGIN');
    next();
  };
}

export const checkOrigin = createOriginCheck({
  // APP_URL's origin; in development also the Vite dev server.
  allowed: config.isProduction ? [config.appOrigin] : [config.appOrigin, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  requireOrigin: config.isProduction,
});

// Every rate limit in the app, in one table (route-matrix.test.ts checks that every public route and every
// route that sends email carries one). Counted per client IP (the real one when TRUST_PROXY is right), per
// signed-in user, or per target email address (so one mailbox can't be flooded from many IPs). In-memory
// counters: per process, reset on restart. Skipped in tests unless a test builds its own with createLimiter.
export interface LimitSpec {
  name: string;
  windowMs: number;
  limit: number;
  by: 'ip' | 'user' | 'email' | 'token';
  message: string;
  skipSuccessfulRequests?: boolean;
}

export type TaggedLimiter = RequestHandler & { rateLimit: LimitSpec };

const MINUTE = 60 * 1000;
const RETRY = 'Too many requests. Please try again in a few minutes.';

export const RATE_LIMITS = {
  login: { name: 'login', windowMs: 15 * MINUTE, limit: 10, by: 'ip', skipSuccessfulRequests: true, message: 'Too many sign-in attempts. Please try again in a few minutes.' },
  logout: { name: 'logout', windowMs: 15 * MINUTE, limit: 60, by: 'ip', message: RETRY },
  forgotPassword: { name: 'forgot-password', windowMs: 15 * MINUTE, limit: 5, by: 'ip', message: RETRY },
  forgotPasswordPerEmail: { name: 'forgot-password-per-email', windowMs: 60 * MINUTE, limit: 3, by: 'email', message: RETRY },
  // The emailed set-password link: checking it (page load) and using it. Per IP, and per token (counted by a
  // prefix of the token's SHA-256, never the token) so one link can't be hammered from many addresses.
  setPasswordCheck: { name: 'set-password-check', windowMs: 15 * MINUTE, limit: 30, by: 'ip', message: RETRY },
  setPasswordCheckPerToken: { name: 'set-password-check-per-token', windowMs: 15 * MINUTE, limit: 10, by: 'token', message: RETRY },
  setPassword: { name: 'set-password', windowMs: 15 * MINUTE, limit: 10, by: 'ip', message: RETRY },
  setPasswordPerToken: { name: 'set-password-per-token', windowMs: 15 * MINUTE, limit: 5, by: 'token', message: RETRY },
  health: { name: 'health', windowMs: MINUTE, limit: 120, by: 'ip', message: RETRY },
  accountMail: { name: 'account-mail', windowMs: 60 * MINUTE, limit: 30, by: 'user', message: 'Too many invites or reset links sent. Please try again later.' },
  portalFeedback: { name: 'portal-feedback', windowMs: 15 * MINUTE, limit: 30, by: 'user', message: 'Too many comments. Please try again later.' },
  heartbeat: { name: 'heartbeat', windowMs: MINUTE, limit: 6, by: 'user', message: 'Too many heartbeats' },
} as const satisfies Record<string, LimitSpec>;

export function createLimiter(spec: LimitSpec, opts: { skipInTests?: boolean } = {}): TaggedLimiter {
  const skipInTests = opts.skipInTests ?? true;
  const handler = rateLimit({
    windowMs: spec.windowMs,
    limit: spec.limit,
    skipSuccessfulRequests: spec.skipSuccessfulRequests ?? false,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => skipInTests && config.isTest,
    ...(spec.by === 'user' ? { keyGenerator: req => `user:${req.user?.id ?? 'anonymous'}` } : {}),
    ...(spec.by === 'email'
      ? {
          keyGenerator: req => {
            const email = (req.body as { email?: unknown } | undefined)?.email;
            return `email:${typeof email === 'string' ? email.trim().toLowerCase() : ''}`;
          },
        }
      : {}),
    ...(spec.by === 'token'
      ? {
          // The token from ?token= (check) or the body (set). Keyed by a hash prefix: the counter store never
          // holds a usable token.
          keyGenerator: req => {
            const raw = (req.body as { token?: unknown } | undefined)?.token ?? req.query.token;
            return `token:${typeof raw === 'string' ? hashToken(raw).slice(0, 16) : 'none'}`;
          },
        }
      : {}),
    handler: (_req, _res, next) => next(new HttpError(429, spec.message, 'RATE_LIMITED')),
  });
  return Object.assign(handler, { rateLimit: spec });
}

export const loginLimiter = createLimiter(RATE_LIMITS.login);
export const logoutLimiter = createLimiter(RATE_LIMITS.logout);
export const forgotPasswordLimiter = createLimiter(RATE_LIMITS.forgotPassword);
export const forgotPasswordPerEmailLimiter = createLimiter(RATE_LIMITS.forgotPasswordPerEmail);
export const setPasswordCheckLimiter = createLimiter(RATE_LIMITS.setPasswordCheck);
export const setPasswordCheckPerTokenLimiter = createLimiter(RATE_LIMITS.setPasswordCheckPerToken);
export const setPasswordLimiter = createLimiter(RATE_LIMITS.setPassword);
export const setPasswordPerTokenLimiter = createLimiter(RATE_LIMITS.setPasswordPerToken);
export const healthLimiter = createLimiter(RATE_LIMITS.health);
export const accountMailLimiter = createLimiter(RATE_LIMITS.accountMail);
export const portalFeedbackLimiter = createLimiter(RATE_LIMITS.portalFeedback);
export const heartbeatLimiter = createLimiter(RATE_LIMITS.heartbeat);
