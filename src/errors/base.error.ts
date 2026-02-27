// src/errors/base.error.ts
// Pattern: Error Types (core-sdk.types-error.md)

export type ErrorKind =
  | 'validation'
  | 'not_found'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'rate_limit'
  | 'external'
  | 'internal';

export interface ErrorContext {
  [key: string]: unknown;
}

/**
 * Base class for all application errors.
 * Always use a specific subclass — never throw AppError directly.
 */
export abstract class AppError extends Error {
  abstract readonly kind: ErrorKind;

  constructor(
    message: string,
    public readonly context: ErrorContext = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): object {
    return {
      kind: this.kind,
      name: this.name,
      message: this.message,
      context: this.context,
    };
  }
}
