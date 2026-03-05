# Memory Index Lookup Table

**Concept**: Firestore lookup table mapping memory UUIDs to Weaviate collection names, enabling O(1) cross-collection memory resolution
**Created**: 2026-03-05
**Status**: Proposal

---

## Overview

Every memory in remember-core lives in a Weaviate collection scoped by owner type: `Memory_users_{userId}`, `Memory_groups_{groupId}`, or `Memory_spaces_public`. To fetch a memory by ID, you must know which collection it lives in. Today, `MemoryResolutionService` handles this with a 2-try fallback (try indicated collection, then try user's own collection), but callers provide the wrong collection context >90% of the time — making the fallback the common path, not the exception.

This design replaces that guesswork with a Firestore index: write the memory's collection on create, read it on resolve. `MemoryResolutionService` is deprecated and its functionality is folded into `MemoryService.getById()`.

---

## Problem Statement

- **Weaviate collections are siloed**: There is no global "get by ID" across collections. You must query a specific collection by name.
- **Callers rarely know the right collection**: LLM agents construct memory references with incorrect or missing `author`/`space`/`group` context >90% of the time.
- **MemoryResolutionService is a band-aid**: The 2-try fallback only covers user → user's-own-collection. It doesn't try group or space collections, so memories in those collections are unreachable if the caller passes wrong context.
- **Cross-collection features are hard**: REM, import jobs, and future features that operate across collections must enumerate or guess which collection a memory belongs to.
- **Unnecessary abstraction**: MemoryResolutionService exists solely because MemoryService couldn't resolve without collection context. With an index, MemoryService can — no reason for a separate service.

---

## Solution

A Firestore collection (`memory_index`) that maps each memory UUID to its Weaviate collection name. Written on create, read on any by-ID resolve. `MemoryResolutionService` is deprecated — its logic folds into a new `MemoryService.getById()` method.

### Architecture

```
  Caller: memoryService.getById("abc-123")
       │
       ▼
  ┌─────────────────────┐
  │  Firestore           │
  │  memory_index/abc-123│ → { collection_name: "Memory_users_xyz" }
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────────┐
  │  Weaviate                │
  │  Memory_users_xyz        │ → fetch object abc-123
  └─────────────────────────┘
```

No guessing. No fallback chain. No separate resolution service. One Firestore read → one Weaviate fetch.

### Alternative Approaches Considered

1. **Keep MemoryResolutionService as-is**: Rejected — >90% wrong-context rate means the fallback is the hot path, and it doesn't cover group/space collections.
2. **Keep MemoryResolutionService as thin index wrapper**: Rejected — with the index, MemoryService can resolve directly. A separate service adds indirection for no benefit.
3. **Encode collection in the ID format**: e.g. `users_xyz:mem456`. Rejected — changes every ID in the system, breaks existing consumers.
4. **Single global Weaviate collection**: Rejected — loses per-tenant isolation, makes multi-tenant filtering more complex and error-prone.
5. **Weaviate cross-collection search**: Not supported by Weaviate — each collection is independent.

---

## Implementation

### Schema

```typescript
// Firestore: memory_index/{memoryUuid}
interface MemoryIndexEntry {
  collection_name: string;   // e.g. "Memory_users_abc123"
  created_at: string;        // ISO 8601 timestamp
}
```

Path: `{firestorePrefix}/memory_index/{memoryUuid}`

The document ID is the memory's Weaviate UUID (the UUID v5 derived from the composite ID).

### Write Path (MemoryService.create)

```typescript
// In MemoryService.create(), after successful Weaviate insert:
await firestore
  .collection(`${prefix}/memory_index`)
  .doc(memoryUuid)
  .set({
    collection_name: collectionName,
    created_at: new Date().toISOString(),
  });
```

Write Firestore **after** Weaviate succeeds. If Firestore write fails, the memory exists but is unindexed — the legacy fallback (retained temporarily) handles this during the migration window.

### Delete Path

No index cleanup on delete. Weaviate deletes are soft deletes — the object still exists with a deleted flag. The index entry must remain so soft-deleted memories can still be resolved to their collection.

### Read Path (MemoryService.getById)

New method on `MemoryService` that replaces `MemoryResolutionService.resolve()`:

```typescript
// New method on MemoryService
async getById(memoryId: string): Promise<GetMemoryResult> {
  // 1. Look up collection from index
  const doc = await this.firestore
    .collection(`${this.prefix}/memory_index`)
    .doc(memoryId)
    .get();

  if (!doc.exists) {
    return { memory: null, collectionName: null };
  }

  const { collection_name } = doc.data() as MemoryIndexEntry;
  const col = this.weaviateClient.collections.get(collection_name);
  const memory = await fetchMemoryWithAllProperties(col, memoryId);

  if (!memory?.properties) {
    return { memory: null, collectionName: null };
  }

  return {
    memory: { id: memory.uuid, ...memory.properties },
    collectionName: collection_name,
  };
}
```

No `MemorySource` parameter. No fallback chain. Just UUID in, memory out.

### MemoryResolutionService Deprecation

`MemoryResolutionService` is removed after migration:

| Phase | State |
|-------|-------|
| Pre-backfill | `getById()` added with index lookup. `MemoryResolutionService` retained as temporary fallback for unindexed memories. |
| Post-backfill | All memories indexed. `MemoryResolutionService` deleted. Callers migrate to `MemoryService.getById()`. |

Callers that currently use `MemoryResolutionService`:
- REST endpoints that accept memory IDs → switch to `memoryService.getById()`
- REM service → switch to `memoryService.getById()`
- Any code passing `MemorySource` context → drop the parameter, use bare UUID

---

## Benefits

- **O(1) resolution**: One Firestore read instead of 1-2 Weaviate queries with guessing
- **Collection-agnostic callers**: No need to pass author/space/group context — just the UUID
- **Full coverage**: Works for user, group, and space collections (current fallback only tries user collections)
- **Simpler API surface**: One service, one method. No separate MemoryResolutionService, no MemorySource type
- **Simpler consumer API**: REST endpoints and SDK methods can accept bare memory IDs
- **Enables future features**: Universal "get memory" endpoint, cross-collection batch operations, memory sharing

---

## Trade-offs

- **Extra write per create**: One Firestore document write per memory create. At $0.18/100K writes, negligible. Mitigated by Firestore's speed (~5ms writes).
- **Extra read per resolve**: One Firestore read per by-ID lookup. At $0.06/100K reads, negligible. Faster than the current 2-Weaviate-query fallback.
- **Consistency gap**: If Weaviate write succeeds but Firestore write fails, the index is incomplete. Mitigated by temporary legacy fallback during migration window, and by the fact that Firestore writes rarely fail.
- **Migration effort**: Existing memories need backfill. One-time script that scans all Weaviate collections and writes index entries.
- **Index growth**: Entries are never deleted (soft deletes keep the Weaviate object). Over time the index grows monotonically. Mitigated by Firestore's scale — millions of small docs are trivial.

---

## Dependencies

- **Firestore** (already a dependency): `memory_index` collection under existing prefix
- **MemoryService**: Write hook on create, new `getById()` method
- **Migration script**: One-time backfill of existing memories

---

## Testing Strategy

- **Unit tests**: Mock Firestore, verify write-on-create, getById index lookup + Weaviate fetch
- **Index miss tests**: Verify getById returns null when index entry is missing
- **Soft-delete tests**: Verify index entry still resolves soft-deleted memories correctly
- **Consistency tests**: Verify behavior when Firestore write fails after Weaviate create
- **Migration tests**: Verify backfill script correctly indexes existing memories across all collection types

---

## Migration Path

1. **Add index write to `MemoryService.create()`**: New memories get indexed from this point forward
2. **Add `MemoryService.getById()`**: Index lookup → Weaviate fetch. Falls back to legacy `MemoryResolutionService` for unindexed memories during transition
3. **Backfill script**: Scan all Weaviate collections (`Memory_users_*`, `Memory_groups_*`, `Memory_spaces_public`), write index entries for every memory
4. **Migrate callers**: Switch all `MemoryResolutionService.resolve()` callers to `MemoryService.getById()`
5. **Delete `MemoryResolutionService`**: Remove `src/services/memory-resolution.service.ts`, remove exports from barrel, remove `MemorySource` type
6. **Simplify REST/SDK**: Remove `author`/`space`/`group` context params from by-ID endpoints

---

## Future Considerations

- **Batch lookups**: `getByIds(uuids: string[])` for bulk operations (Firestore `getAll()` supports up to 500 docs per call)
- **Collection metadata**: Could extend index entries with `owner_id`, `collection_type` for richer queries without hitting Weaviate
- **Hard-delete cleanup**: If hard deletes are ever added, wire index removal into that path
- **Cache layer**: In-memory LRU cache on top of Firestore for hot-path resolution (likely unnecessary given Firestore's speed)
- **Universal memory endpoint**: `GET /api/svc/v1/memories/:id` that needs no collection context — enabled directly by this index

---

**Status**: Proposal
**Recommendation**: Implement as a new milestone. Low risk, high impact given >90% wrong-context rate.
**Related Documents**:
- `src/services/memory-resolution.service.ts` (to be deprecated)
- `src/collections/composite-ids.ts` (UUID v5 generation)
- `src/collections/dot-notation.ts` (collection naming)
- `agent/design/core-sdk.architecture.md` (service layer pattern)
