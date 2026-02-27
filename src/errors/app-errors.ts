// src/errors/app-errors.ts
// Pattern: Error Types (core-sdk.types-error.md)

import { AppError } from './base.error';

/**
 * Input validation failed — HTTP 400
 */
export class ValidationError extends AppError {
  readonly kind = 'validation' as const;

  constructor(
    message: string,
    public readonly fields: Record<string, string[]> = {}
  ) {
    super(message, { fields });
  }
}

/**
 * Resource not found — HTTP 404
 */
export class NotFoundError extends AppError {
  readonly kind = 'not_found' as const;

  constructor(
    public readonly resource: string,
    public readonly id: string
  ) {
    super(`${resource} not found: ${id}`, { resource, id });
  }
}

/**
 * Not authenticated — HTTP 401
 */
export class UnauthorizedError extends AppError {
  readonly kind = 'unauthorized' as const;

  constructor(message = 'Authentication required') {
    super(message);
  }
}

/**
 * Authenticated but not permitted — HTTP 403
 */
export class ForbiddenError extends AppError {
  readonly kind = 'forbidden' as const;

  constructor(
    message = 'Access denied',
    public readonly requiredRole?: string
  ) {
    super(message, { requiredRole });
  }
}

/**
 * Resource state conflict — HTTP 409
 */
export class ConflictError extends AppError {
  readonly kind = 'conflict' as const;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, context);
  }
}

/**
 * Too many requests — HTTP 429
 */
export class RateLimitError extends AppError {
  readonly kind = 'rate_limit' as const;

  constructor(public readonly retryAfterSeconds: number) {
    super(`Rate limit exceeded. Retry after ${retryAfterSeconds}s`, {
      retryAfterSeconds,
    });
  }
}

/**
 * External service failed (upstream API, database) — HTTP 502
 */
export class ExternalError extends AppError {
  readonly kind = 'external' as const;

  constructor(
    message: string,
    public readonly service: string
  ) {
    super(message, { service });
  }
}

/**
 * Unexpected internal error — HTTP 500
 */
export class InternalError extends AppError {
  readonly kind = 'internal' as const;

  constructor(message = 'Internal server error') {
    super(message);
  }
}
