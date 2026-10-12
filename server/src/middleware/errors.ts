import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';

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
  next(new HttpError(404, `Not found: ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    return;
  }
  // Malformed JSON bodies from express.json()
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body', code: 'VALIDATION_ERROR' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
};
