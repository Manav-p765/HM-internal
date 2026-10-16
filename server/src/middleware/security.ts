import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
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

function limiter(limit: number, message: string, skipSuccessfulRequests = false) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.isTest,
    handler: (_req, _res, next) => next(new HttpError(429, message, 'RATE_LIMITED')),
  });
}

// Per IP, per 15 minutes. Login only counts failed attempts.
export const loginLimiter = limiter(10, 'Too many sign-in attempts. Please try again in a few minutes.', true);
export const forgotPasswordLimiter = limiter(5, 'Too many requests. Please try again in a few minutes.');
export const resetPasswordLimiter = limiter(10, 'Too many requests. Please try again in a few minutes.');
