// examples/rest/error-handler.ts
// Pattern: Adapter REST (core-sdk.adapter-rest.md)
//
// Centralized Express error handler. Register last, after all routes.
// Maps AppError subclasses to HTTP status codes using the HTTP_STATUS map.
// Never leaks stack traces to clients.

import { Request, Response, NextFunction } from 'express';
import { isAppError, HTTP_STATUS } from '../../src/errors';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (isAppError(err)) {
    const status = HTTP_STATUS[err.kind];
    const body: Record<string, unknown> = {
      error: {
        kind: err.kind,
        message: err.message,
      },
    };

    // Include structured fields for validation errors
    if (err.kind === 'validation') {
      (body.error as Record<string, unknown>).fields = err.fields;
    }

    // Include retry hint for rate limit errors
    if (err.kind === 'rate_limit') {
      (body.error as Record<string, unknown>).retryAfterSeconds = err.retryAfterSeconds;
    }

    res.status(status).json(body);
    return;
  }

  // Unknown error — log server-side, never expose internals to client
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      kind: 'internal',
      message: 'Internal server error',
    },
  });
}
