// src/types/result.types.ts
// Pattern: Result Types (core-sdk.types-result.md)

/**
 * Represents a successful result containing a value of type T
 */
export interface Ok<T> {
  readonly success: true;
  readonly value: T;
}

/**
 * Represents a failed result containing an error of type E
 */
export interface Err<E> {
  readonly success: false;
  readonly error: E;
}

/**
 * A value that is either Ok<T> or Err<E>.
 * Use for operations where failure is expected and callers must handle both cases.
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Construct a successful result
 */
export function ok<T>(value: T): Ok<T> {
  return { success: true, value };
}

/**
 * Construct a failed result
 */
export function err<E>(error: E): Err<E> {
  return { success: false, error };
}

/**
 * Type guard: checks if a Result is successful
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.success === true;
}

/**
 * Type guard: checks if a Result is a failure
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.success === false;
}

/**
 * Apply a transform to the Ok value, passing Err through unchanged
 */
export function mapOk<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Apply a transform to the Err value, passing Ok through unchanged
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chain two Result-returning operations
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

/**
 * Unwrap the Ok value or return a default
 */
export function getOrElse<T, E>(result: Result<T, E>, defaultValue: T): T {
  return isOk(result) ? result.value : defaultValue;
}

/**
 * Wrap a synchronous function that might throw into one returning a Result
 */
export function tryCatch<T, E = Error>(
  fn: () => T,
  onError: (e: unknown) => E
): Result<T, E> {
  try {
    return ok(fn());
  } catch (e) {
    return err(onError(e));
  }
}

/**
 * Wrap an async function that might throw into one returning a Result
 */
export async function tryCatchAsync<T, E = Error>(
  fn: () => Promise<T>,
  onError: (e: unknown) => E
): Promise<Result<T, E>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(onError(e));
  }
}
