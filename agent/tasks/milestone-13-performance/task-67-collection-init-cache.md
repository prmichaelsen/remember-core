# Task 67: Collection Initialization Cache

**Milestone**: M13 — Performance
**Status**: Not Started
**Estimated Hours**: 2-3
**Dependencies**: None

---

## Objective

Add a process-level TTL cache to `ensureUserCollection()` and `ensurePublicCollection()` so repeated calls for the same collection skip the Weaviate `exists()` check and `reconcileCollectionProperties()` call. Every operation currently pays 100-200ms for schema checks.

## Context

`ensureUserCollection` and `ensurePublicCollection` in `v2-collections.ts` call `client.collections.exists()` and `reconcileCollectionProperties()` on every invocation. These are network round-trips to Weaviate. Collections rarely change — caching with a 60s TTL eliminates most redundant checks.

## Steps

1. Add a module-level `Map<string, { collection: Collection, expiresAt: number }>` cache
2. On cache hit (within TTL), return cached collection directly
3. On cache miss, perform normal ensure + reconcile, cache result
4. Export `clearCollectionCache()` for testing and manual invalidation
5. Deduplicate redundant ensure calls in SpaceService (search calls ensure then gets collection again)
6. Add tests for cache hit, miss, TTL expiry

## Files to Modify

- `src/database/weaviate/v2-collections.ts` — add cache logic
- `src/services/space.service.ts` — remove redundant ensure calls

## Verification

- [ ] `npm run build` compiles
- [ ] All existing tests pass
- [ ] Cache hit avoids Weaviate `exists()` call
- [ ] Cache expires after TTL
- [ ] `clearCollectionCache()` works
