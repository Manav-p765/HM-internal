import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';
import { MailError } from '../services/mail.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

// Validates a request body with zod; throws a 400 with per-field messages on failure.
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const details = result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
    throw new HttpError(400, details[0]?.message ?? 'Invalid request', 'VALIDATION_ERROR', details);
  }
  return result.data;
}

export const apiNotFound: RequestHandler = (req, _res, next) => {
  // The path only: query strings can carry search terms.
  next(new HttpError(404, `Not found: ${req.method} ${req.baseUrl}${req.path}`, 'NOT_FOUND'));
};

// Every error becomes a JSON body without internals: known HttpErrors keep their message and code;
// anything else is logged on the server and answered with a generic 500 (no stack, no SQL, no values).
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    return;
  }
  // The credentials email could not be sent; it is sent inside the DB transaction, so nothing was saved.
  if (err instanceof MailError) {
    res.status(502).json({ error: 'The email could not be sent, so nothing was changed. Try again later.', code: 'MAIL_FAILED' });
    return;
  }
  // Malformed JSON bodies and oversized bodies from express.json()
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body', code: 'VALIDATION_ERROR' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' });
    return;
  }
  // Other client errors raised by middleware (e.g. a missing /assets file from express.static: 404).
  const status = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : 500;
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: status === 404 ? 'Not found' : 'Bad request', code: status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
};
