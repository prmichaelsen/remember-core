# Task 26: Foundation — Result Type, WebSDKError, Browser Guard

**Milestone**: M7 — Web Client SDK
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: None

---

## Objective

Create the foundational types and utilities that all web SDK use-case modules depend on: the `Result<T, E>` discriminated union, `WebSDKError` type aligned with the OpenAPI error envelope, and the `assertServerSide()` browser guard.

## Context

The design doc specifies that all web SDK functions return `Result<T, E>` instead of throwing errors. The error shape must match the OpenAPI `ErrorResponse.error` schema exactly (8 error kinds). The browser guard prevents accidental import in client-side code.

## Steps

1. Create `src/web/result.ts`:
   - `Result<T, E = WebSDKError>` discriminated union (`{ ok: true; data: T } | { ok: false; error: E }`)
   - `ok<T>(data: T): Result<T, never>` helper
   - `err<E>(error: E): Result<never, E>` helper
   - `tryCatch<T>(fn: () => Promise<T>): Promise<Result<T, WebSDKError>>` wrapper
   - `mapOk<T, U>(result: Result<T>, fn: (data: T) => U): Result<U>` utility
   - `isOk<T>(result: Result<T>): result is { ok: true; data: T }` type guard

2. Create `src/web/errors.ts`:
   - `ErrorKind` type: 8 values matching OpenAPI `ErrorResponse.error.kind`
   - `WebSDKError` interface: `{ kind: ErrorKind; message: string; context: Record<string, unknown> }`
   - `createError(kind, message, context?)` factory
   - Convenience factories: `notFound(resource, id)`, `validation(message, fields?)`, `unauthorized()`, `forbidden()`, `conflict(message)`, `internal(message)`

3. Create `src/web/guard.ts`:
   - `assertServerSide()` — throws descriptive error if `typeof window !== 'undefined'`
   - Called at module load time in `src/web/index.ts`

## Verification

- [ ] `Result<T, E>` type narrows correctly with `if (result.ok)` pattern
- [ ] `tryCatch` catches thrown errors and wraps in `WebSDKError`
- [ ] `ErrorKind` has exactly 8 values matching OpenAPI spec
- [ ] `assertServerSide()` throws with descriptive message mentioning credentials
- [ ] All types export cleanly from barrel
- [ ] Build passes with no type errors

## Files

- Create: `src/web/result.ts`, `src/web/errors.ts`, `src/web/guard.ts`
