# Task 38: Build Shared Client Infrastructure

**Milestone**: M9 — Client SDKs
**Status**: Not Started
**Estimated Hours**: 4
**Dependencies**: Task 37

---

## Objective

Create the shared HTTP transport, Supabase-style response types, and browser guard used by both the svc and app clients.

## Context

Both client SDKs share: fetch-based HTTP transport, auth handling (either/or pattern), `SdkResponse<T>` with `{ data, error }` + `.throwOnError()`, and the server-side browser guard.

## Steps

1. Create `src/clients/http.ts`:
   - `HttpClientConfig` interface: `baseUrl`, `auth?` (serviceToken + jwtOptions), `getAuthToken?` callback
   - `HttpClient` class/function: constructs URLs, attaches auth headers, calls `fetch()`
   - Resolution: `getAuthToken` > `auth.serviceToken` > error
   - `jsonwebtoken` imported dynamically (optional peer dep)

2. Create `src/clients/response.ts`:
   - `SdkResponse<T>` interface: `{ data: T | null; error: RememberError | null }`
   - `RememberError` interface: `{ code: string; message: string; status: number; context?: Record<string, unknown> }`
   - `throwOnError()` method: throws `RememberError` if error exists, returns `data` (non-null)
   - `createResponse<T>(data, error)` helper
   - `fromHttpResponse<T>(response: Response)` helper: maps HTTP status to RememberError

3. Create `src/clients/guard.ts`:
   - Reuse `assertServerSide()` logic from `src/web/guard.ts`

4. Write colocated tests:
   - `src/clients/http.spec.ts` — mock fetch, verify URL/method/body/headers, auth patterns
   - `src/clients/response.spec.ts` — SdkResponse shape, throwOnError, error mapping

## Verification

- [ ] `HttpClient` correctly constructs URLs and attaches auth
- [ ] Both auth patterns work (serviceToken JWT, getAuthToken callback)
- [ ] `SdkResponse` returns `{ data, error }` shape
- [ ] `.throwOnError()` throws `RememberError` when error present
- [ ] `.throwOnError()` returns typed `data` when no error
- [ ] Browser guard throws in browser-like environment
- [ ] Tests pass
