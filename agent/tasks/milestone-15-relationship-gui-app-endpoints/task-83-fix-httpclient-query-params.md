# Task 83: Fix HttpClient Query Params Not Appended to URL

**Milestone**: [M15 - Relationship GUI App Endpoints](../milestones/milestone-15-relationship-gui-app-endpoints.md)
**Estimated Time**: 30 minutes
**Dependencies**: None
**Status**: Not Started

---

## Objective

Fix a bug in `HttpClient.request()` where the `params` field from `RequestOptions` is accepted but never appended to the request URL as query parameters. This causes all GET requests with query params (like `includeRelationships=true`) to silently drop their parameters.

---

## Context

The App Client SDK's `memories.get()` correctly builds `params: { includeRelationships: 'true', relationshipMemoryLimit: '5' }` and passes them to `http.request('GET', path, { userId, params })`. However, `HttpClient.request()` in `src/clients/http.ts` line 48 constructs the URL as `${this.baseUrl}${path}` without ever reading `options.params`.

This was discovered during e2e testing of the relationship GUI endpoints. Cloud Run logs confirmed the REST service receives requests at `/api/app/v1/memories/:memoryId` with **no query string**, so the controller always returns `{ relationships: [] }`. The agentbase.me SSR then falls back to the svc-only client path which has no relationship support.

**Impact**: All App Client SDK endpoints that use query params are broken. Currently affects:
- `memories.get()` — `includeRelationships` and `relationshipMemoryLimit` params dropped
- `relationships.getMemories()` — `limit` and `offset` params dropped

---

## Steps

### 1. Fix HttpClient.request() to Append Query Params

In `src/clients/http.ts`, modify the URL construction:

```typescript
// Before (line 48):
const url = `${this.baseUrl}${path}`;

// After:
const queryString = options?.params && Object.keys(options.params).length > 0
  ? '?' + new URLSearchParams(options.params).toString()
  : '';
const url = `${this.baseUrl}${path}${queryString}`;
```

### 2. Add Unit Test

Add a test to verify params are serialized into the URL:

```typescript
it('should append params as query string', async () => {
  // Mock fetch, call http.request with params, verify URL includes ?key=value
});
```

### 3. Verify Existing Tests Pass

```bash
npm test
```

### 4. Publish Patch Version

Bump version and publish so remember-rest-service and agentbase.me can pick up the fix.

---

## Verification

- [ ] `HttpClient.request()` appends `params` to URL as query string
- [ ] Empty or undefined params do not add trailing `?`
- [ ] Unit test covers params serialization
- [ ] All existing tests pass
- [ ] `memories.get()` with `includeRelationships=true` sends correct URL

---

## Expected Output

**Files Modified**:
- `src/clients/http.ts`: Add query string construction from `options.params`

**Files Created**:
- Test file or test case for HttpClient params behavior

---

## Notes

- This is a critical bug blocking all relationship GUI features on agentbase.me
- The `RequestOptions.params` interface already correctly types params as `Record<string, string>`
- The SVC client SDK uses `URLSearchParams` inline (not via `RequestOptions.params`), so it is not affected
- Only the App Client SDK routes use `params` via `RequestOptions`
