import type { RequestHandler } from 'express';
import { config } from '../config.js';

// One line per API request: time, method, path (no query string), status, duration, client IP (the real one
// when TRUST_PROXY is set right). Never bodies, headers, cookies, query strings or user input, so passwords,
// reset tokens and search terms can't reach the logs. Health checks are skipped (uptime monitors are noisy).
// On by default in production (LOG_REQUESTS=false turns it off); tests switch it on with setRequestLogging.
let enabled = config.logRequests;
export function setRequestLogging(on: boolean): void {
  enabled = on;
}

export const requestLog: RequestHandler = (req, res, next) => {
  if (!enabled || req.path.startsWith('/health')) return next();
  const started = process.hrtime.bigint();
  // Captured now: routers change req.baseUrl/req.path while the request is handled.
  const route = `${req.baseUrl}${req.path}`;
  res.on('finish', () => {
    const ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
    console.log(`${new Date().toISOString()} ${req.method} ${route} ${res.statusCode} ${ms}ms ${req.ip ?? '-'}`);
  });
  next();
};
