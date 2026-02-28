// src/web/result.ts
// Web SDK Result type — { ok, data/error } discriminated union matching OpenAPI conventions

import type { WebSDKError } from './errors.js';
import { createError } from './errors.js';

/**
 * Discriminated union for all web SDK return values.
 * Use `if (result.ok)` to narrow — data is available on success, error on failure.
 */
export type Result<T, E = WebSDKError> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: E };

/**
 * Construct a successful Result.
 */
export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

/**
 * Construct a failed Result.
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard: narrows Result to the success branch.
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; data: T } {
  return result.ok;
}

/**
 * Transform the data inside a successful Result; pass errors through unchanged.
 */
export function mapOk<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U,
): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.data));
  }
  return result;
}

/**
 * Wrap an async function that might throw into a Result<T, WebSDKError>.
 * Caught exceptions are converted to internal errors.
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
): Promise<Result<T, WebSDKError>> {
  try {
    return ok(await fn());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(createError('internal', message, {
      original_error: e instanceof Error ? e.name : typeof e,
    }));
  }
}
