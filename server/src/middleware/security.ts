import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { HttpError } from './errors.js';

const allowedOrigins = new Set([config.appOrigin]);
if (!config.isProduction) {
  // Vite dev server
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://127.0.0.1:3000');
}

// CSRF defence on top of the SameSite=Lax cookie: browsers always send Origin on cross-site
// POST/PATCH/DELETE, so a mismatching Origin is rejected. Requests with no Origin header
// (curl, server-to-server) are not browser-driven and are let through.
export const checkOrigin: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin)) {
    throw new HttpError(403, 'Request origin not allowed', 'BAD_ORIGIN');
  }
  next();
};

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
