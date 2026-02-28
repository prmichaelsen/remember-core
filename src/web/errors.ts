// src/web/errors.ts
// Web SDK error types — plain objects matching OpenAPI ErrorResponse.error schema

import type { ErrorKind } from '../errors/base.error.js';

export type { ErrorKind };

/**
 * Plain-object error shape matching the OpenAPI error envelope.
 * Unlike AppError (class hierarchy), WebSDKError is a serializable value type
 * suitable for Result<T, WebSDKError> discriminated unions.
 */
export interface WebSDKError {
  readonly kind: ErrorKind;
  readonly message: string;
  readonly context: Record<string, unknown>;
}

/**
 * Create a WebSDKError with the given kind, message, and optional context.
 */
export function createError(
  kind: ErrorKind,
  message: string,
  context: Record<string, unknown> = {},
): WebSDKError {
  return { kind, message, context };
}

// --- Convenience factories ---

export function notFound(resource: string, id: string): WebSDKError {
  return createError('not_found', `${resource} not found: ${id}`, { resource, id });
}

export function validation(message: string, fields?: Record<string, string[]>): WebSDKError {
  return createError('validation', message, fields ? { fields } : {});
}

export function unauthorized(message = 'Authentication required'): WebSDKError {
  return createError('unauthorized', message);
}

export function forbidden(message = 'Access denied'): WebSDKError {
  return createError('forbidden', message);
}

export function conflict(message: string): WebSDKError {
  return createError('conflict', message);
}

export function internal(message = 'Internal server error'): WebSDKError {
  return createError('internal', message);
}
