# Task 63: Pool Weaviate Collection Initialization

**Milestone**: Unassigned
**Estimated Time**: 2-3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Cache the result of `ensureUserCollection()` so that repeated requests for the same user skip the Weaviate existence check and schema reconciliation. The Weaviate client is already a module-level singleton, but every request currently calls `ensureUserCollection()` which hits Weaviate with `collections.exists()` + `reconcileCollectionProperties()`.

---

## Context

In production (remember-mcp-server on Cloud Run), each authenticated request creates a new server instance via `createRememberServer(accessToken, userId, opts)`. This calls `ensureUserCollection(client, userId)` which:

1. Calls `client.collections.exists(collectionName)` — network round-trip to Weaviate
2. If exists, calls `reconcileCollectionProperties(client, collectionName, COMMON_MEMORY_PROPERTIES)` — another round-trip
3. If not exists, creates the collection — expensive but rare

For returning users (the common case), steps 1-2 are redundant after the first request. This adds latency on every connection without providing value, since collections rarely change once created.

### Current Architecture

```
src/database/weaviate/client.ts:
  - Module-level singleton: let client: WeaviateClient | null
  - initWeaviateClient(config) — lazy init, returns cached client
  - getWeaviateClient() — returns cached client or throws

src/database/weaviate/v2-collections.ts:
  - ensureUserCollection(client, userId) — checks exists + reconciles every time
  - createUserCollectionSchema(userId) — returns schema definition
  - reconcileCollectionProperties() — adds missing properties

Services receive collection instances via constructor:
  - MemoryService(collection, userId, logger)
  - RelationshipService(collection, userId, logger)
  - SpaceService(client, collection, userId, ..., logger)
```

### What "Pooling" Actually Means Here

Not connection pooling (the client is already a singleton). Rather, **collection readiness caching** — remembering that a given user's collection has been verified/reconciled so we don't re-check on every request.

---

## Steps

### 1. Add a Collection Ready Cache

Add a `Set<string>` or `Map<string, number>` (with TTL) to track which collections have been verified in this process lifecycle.

**File**: `src/database/weaviate/v2-collections.ts`

```typescript
// Collections verified in this process lifecycle
// Key: collection name, Value: timestamp when verified
const verifiedCollections = new Map<string, number>();
const VERIFY_TTL_MS = 5 * 60 * 1000; // Re-verify every 5 minutes

function isCollectionVerified(name: string): boolean {
  const verifiedAt = verifiedCollections.get(name);
  if (!verifiedAt) return false;
  if (Date.now() - verifiedAt > VERIFY_TTL_MS) {
    verifiedCollections.delete(name);
    return false;
  }
  return true;
}

function markCollectionVerified(name: string): void {
  verifiedCollections.set(name, Date.now());
}
```

### 2. Update ensureUserCollection to Use Cache

Wrap the existing logic with a cache check:

```typescript
export async function ensureUserCollection(
  client: WeaviateClient,
  userId: string
): Promise<boolean> {
  const collectionName = `Memory_users_${userId}`;

  // Skip existence check if recently verified
  if (isCollectionVerified(collectionName)) {
    return false; // Already exists, no creation needed
  }

  const exists = await client.collections.exists(collectionName);
  if (exists) {
    await reconcileCollectionProperties(client, collectionName, COMMON_MEMORY_PROPERTIES);
    markCollectionVerified(collectionName);
    return false;
  }

  const schema = createUserCollectionSchema(userId);
  await client.collections.create(schema);
  markCollectionVerified(collectionName);
  return true;
}
```

### 3. Apply Same Pattern to ensurePublicCollection

If `ensurePublicCollection()` exists and follows the same pattern, apply the same caching.

### 4. Add Cache Invalidation Export

Expose a way to force re-verification (useful for tests and schema migrations):

```typescript
export function invalidateCollectionCache(collectionName?: string): void {
  if (collectionName) {
    verifiedCollections.delete(collectionName);
  } else {
    verifiedCollections.clear();
  }
}
```

### 5. Update Tests

- Add tests verifying that `ensureUserCollection` skips the check on second call
- Add tests verifying TTL expiration triggers re-check
- Add tests for `invalidateCollectionCache`
- Verify existing tests still pass (mock collection won't be affected)

### 6. Consider: Cache Collection References Too

Evaluate whether caching `client.collections.get(collectionName)` return values is worthwhile. This is likely a cheap local reference (not a network call), but worth confirming.

---

## Verification

- [ ] `ensureUserCollection()` only hits Weaviate once per user per TTL window
- [ ] Second call for same user returns immediately (no network round-trip)
- [ ] TTL expiration causes re-verification
- [ ] `invalidateCollectionCache()` forces re-check
- [ ] New collections are still created correctly (first-time users)
- [ ] Schema reconciliation still runs on first check per TTL window
- [ ] All existing tests pass
- [ ] New unit tests cover cache hit, cache miss, TTL expiry, and invalidation

---

## Expected Output

**Files Modified**:
- `src/database/weaviate/v2-collections.ts` — Add cache logic around `ensureUserCollection()`

**Files Created**:
- None (or test additions to existing test file)

**Exports Added**:
- `invalidateCollectionCache(collectionName?: string): void`

---

## Common Issues and Solutions

### Issue 1: Stale cache after schema change
**Symptom**: New properties not added to existing collections after a remember-core version bump
**Solution**: TTL ensures re-verification within 5 minutes. For immediate effect, call `invalidateCollectionCache()` or restart the process.

### Issue 2: Cache grows unbounded in long-lived processes
**Symptom**: Memory increases over time with many unique users
**Solution**: The Map entries are tiny (string + number). Even 100K users = ~10MB. If needed, add an LRU eviction or periodic sweep.

### Issue 3: Tests leak cache state
**Symptom**: Tests pass individually but fail together
**Solution**: Call `invalidateCollectionCache()` in test setup/teardown.

---

## Notes

- The Weaviate client itself is already a singleton — this is not connection pooling
- This is a **process-level** cache — it resets on Cloud Run cold starts, which is fine
- The 5-minute TTL is a conservative default; could be longer for production stability
- This optimization matters most for SSE-based MCP servers where connections are frequent
- No API changes for consumers — purely internal optimization

---

**Next Task**: None (standalone optimization)
**Related**: remember-mcp-server performance discussion
**Estimated Completion Date**: TBD
