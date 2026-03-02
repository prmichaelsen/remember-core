# Task 56: Replace Weaviate listAll() with Firestore collection registry

**Milestone**: Unassigned (future performance enhancement)
**Estimated Time**: 3-4 hours
**Dependencies**: M10 (REM module must exist)
**Status**: Not Started

---

## Objective

Replace `listMemoryCollections()` which calls `weaviateClient.collections.listAll()` with a Firestore-backed collection registry. At scale (millions of users = millions of collections), `listAll()` is prohibitively slow and returns far more data than needed.

---

## Context

Currently `src/rem/rem.collections.ts` enumerates all Weaviate collections via `client.collections.listAll()` and filters by pattern. This works fine with a handful of collections but becomes a bottleneck at scale:

- 1M users = 1M+ `Memory_users_*` collections + groups + spaces
- `listAll()` returns full schema metadata for every collection
- Called every hourly REM cycle — wasteful

The fix is a lightweight Firestore registry that gets a write when `ensureUserCollection()` / `ensureGroupCollection()` creates a new collection, and REM reads from that instead.

---

## Steps

### 1. Add Firestore collection registry paths

In `src/database/firestore/paths.ts`:

```typescript
export function getCollectionRegistryPath(): string {
  return `${BASE}.collection_registry`;
}
```

Documents in this collection: `{ collection_name, collection_type, created_at, owner_id? }`

### 2. Write to registry on collection creation

Update `ensureUserCollection()`, `ensureGroupCollection()`, and `ensureSpacesCollection()` in `src/database/weaviate/v2-collections.ts` to write a registry document when creating a new collection (not on reconcile/existing).

### 3. Update `listMemoryCollections()` in `src/rem/rem.collections.ts`

Replace `client.collections.listAll()` with a Firestore query against the registry. Support pagination if needed.

### 4. Add `removeCollectionFromRegistry()` for cleanup

If collections are ever deleted, provide a way to remove the registry entry.

### 5. Update tests

- Update `rem.collections.spec.ts` to mock Firestore registry instead of `listAll()`
- Add tests for registry write on collection creation

---

## Verification

- [ ] `listMemoryCollections()` reads from Firestore, not Weaviate `listAll()`
- [ ] `ensureUserCollection()` writes to registry on creation
- [ ] `ensureGroupCollection()` writes to registry on creation
- [ ] `ensureSpacesCollection()` writes to registry on creation
- [ ] Existing collections are not re-registered on reconcile
- [ ] Tests updated and passing
- [ ] Build compiles

---

## Notes

- Low priority — current approach works fine while collection count is small
- Registry writes are rare (only on first collection creation per user/group)
- Registry reads are cheap (Firestore query vs Weaviate full schema dump)
- Consider backfill script for existing collections when this is implemented
