# Task 95: Add MemoryService.getById with Index Lookup

**Milestone**: [M18 - Memory Index Lookup Table](../../milestones/milestone-18-memory-index-lookup.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 93: MemoryIndexService](task-93-memory-index-service.md), [Task 94: Wire index write](task-94-wire-index-write.md)
**Status**: Not Started

---

## Objective

Add `MemoryService.getById(memoryId)` that resolves any memory by UUID alone using the Firestore index. No collection context needed. Includes legacy fallback for unindexed memories.

---

## Context

This is the method that replaces `MemoryResolutionService.resolve()`. It does: index lookup → get collection name → fetch from Weaviate. For unindexed memories (pre-backfill), it falls back to the legacy 2-try resolution.

---

## Steps

### 1. Define GetByIdResult type

```typescript
export interface GetByIdResult {
  memory: Record<string, unknown> | null;
  collectionName: string | null;
}
```

### 2. Add getById method to MemoryService

```typescript
async getById(memoryId: string): Promise<GetByIdResult> {
  // 1. Try index lookup
  if (this.options?.memoryIndex) {
    const collectionName = await this.options.memoryIndex.lookup(memoryId);
    if (collectionName) {
      const col = this.weaviateClient.collections.get(collectionName);
      const memory = await fetchMemoryWithAllProperties(col, memoryId);
      if (memory?.properties) {
        return {
          memory: { id: memory.uuid, ...memory.properties },
          collectionName,
        };
      }
    }
  }

  // 2. Fallback: legacy resolution (for unindexed memories)
  return this.legacyResolve(memoryId);
}
```

Note: `getById()` needs access to the Weaviate client (not just a single collection). The MemoryService constructor currently takes a single collection. This method needs a `weaviateClient` reference to look up arbitrary collections. Consider:
- Adding optional `weaviateClient` to constructor options
- Or making `getById` a standalone function that takes both deps

Choose the approach that fits the existing codebase patterns best.

### 3. Implement legacy fallback

Port the current `MemoryResolutionService.resolve()` logic as a private method `legacyResolve()` within MemoryService. This is temporary — removed after backfill (task-97).

### 4. Export new types

Add `GetByIdResult` to `src/services/index.ts` barrel.

### 5. Add unit tests

Create or update colocated spec:

- Test getById with indexed memory (index hit → Weaviate fetch)
- Test getById with unindexed memory (index miss → legacy fallback)
- Test getById returns null for nonexistent memory
- Test getById handles soft-deleted memories (index exists, Weaviate returns deleted object)

---

## Verification

- [ ] `MemoryService.getById(memoryId)` exists and works
- [ ] Returns memory + collectionName for indexed memories
- [ ] Falls back to legacy resolution for unindexed memories
- [ ] Returns null for nonexistent memories
- [ ] `GetByIdResult` type exported from barrel
- [ ] All tests pass
- [ ] Build passes

---

## Expected Output

**Files Modified**:
- `src/services/memory.service.ts` — add `getById()`, `legacyResolve()`, `GetByIdResult`
- `src/services/index.ts` — export `GetByIdResult`
- Memory service test file — add getById tests

---

**Next Task**: [Task 96: Backfill migration script](task-96-backfill-migration-script.md)
**Related Design Docs**: [agent/design/local.memory-index-lookup.md](../../design/local.memory-index-lookup.md)
