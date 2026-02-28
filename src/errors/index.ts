// src/errors/index.ts
// Pattern: Error Types (core-sdk.types-error.md)

export { AppError } from './base.error.js';
export type { ErrorKind, ErrorContext } from './base.error.js';
export {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ExternalError,
  InternalError,
} from './app-errors.js';

import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ExternalError,
  InternalError,
} from './app-errors.js';

/**
 * Union of all typed application errors.
 * Use this in catch blocks and Result<T, E> type parameters.
 */
export type AppErrorUnion =
  | ValidationError
  | NotFoundError
  | UnauthorizedError
  | ForbiddenError
  | ConflictError
  | RateLimitError
  | ExternalError
  | InternalError;

/**
 * HTTP status codes for each error kind.
 * Use in REST adapters to map errors to responses.
 */
export const HTTP_STATUS: Record<AppErrorUnion['kind'], number> = {
  validation:   400,
  unauthorized: 401,
  forbidden:    403,
  not_found:    404,
  conflict:     409,
  rate_limit:   429,
  external:     502,
  internal:     500,
};

/**
 * Type guard: checks if a value is a typed AppError
 */
export function isAppError(value: unknown): value is AppErrorUnion {
  return value instanceof Error && 'kind' in value;
}
