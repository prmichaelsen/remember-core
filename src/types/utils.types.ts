// src/types/utils.types.ts
// Pattern: Generic Utility Types (core-sdk.types-generic.md)

/**
 * Makes all properties optional recursively.
 * Use for test fixture factories and config merge helpers.
 */
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

/**
 * Adds null to a type
 */
export type Nullable<T> = T | null;

/**
 * Adds undefined to a type
 */
export type Optional<T> = T | undefined;

/**
 * Adds null and undefined to a type
 */
export type Maybe<T> = T | null | undefined;

/**
 * Gets the resolved value of a Promise
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Gets the return type of an async function
 */
export type AsyncReturnType<T extends (...args: any[]) => Promise<any>> =
  Awaited<ReturnType<T>>;

/**
 * Makes specific keys required, leaves the rest optional
 */
export type RequireFields<T, K extends keyof T> =
  Omit<T, K> & Required<Pick<T, K>>;

/**
 * Makes specific keys optional, leaves the rest required
 */
export type OptionalFields<T, K extends keyof T> =
  Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Gets the value types of T as a union
 */
export type Values<T> = T[keyof T];

/**
 * A type that can be instantiated with `new`
 */
export type Constructor<T = object, Args extends any[] = any[]> = new (...args: Args) => T;

/**
 * Makes all properties and nested properties readonly.
 * Use for config objects and frozen state that should not be mutated.
 */
export type Immutable<T> = {
  readonly [K in keyof T]: T[K] extends object ? Immutable<T[K]> : T[K];
};
