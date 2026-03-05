# Task 94: Wire Index Write into MemoryService.create

**Milestone**: [M18 - Memory Index Lookup Table](../../milestones/milestone-18-memory-index-lookup.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 93: MemoryIndexService](task-93-memory-index-service.md)
**Status**: Not Started

---

## Objective

Wire `MemoryIndexService.index()` into `MemoryService.create()` so that every newly created memory is automatically indexed in Firestore.

---

## Context

After task-93 creates the index service, this task integrates it into the write path. The index write happens after Weaviate insert succeeds. If the Firestore write fails, the memory exists but is unindexed — the legacy fallback handles this gracefully.

---

## Steps

### 1. Add MemoryIndexService as optional dependency

Update `MemoryService` constructor to accept an optional `MemoryIndexService`:

```typescript
constructor(
  private collection: any,
  private logger: Logger,
  private options?: {
    memoryIndex?: MemoryIndexService;
  }
)
```

Optional so existing consumers aren't broken.

### 2. Wire index write into create()

After successful Weaviate insert in `create()`, call:

```typescript
if (this.options?.memoryIndex) {
  try {
    await this.options.memoryIndex.index(memoryUuid, collectionName);
  } catch (err) {
    this.logger.warn?.(`[MemoryService] Index write failed for ${memoryUuid}: ${err}`);
    // Non-fatal — memory exists in Weaviate, just unindexed
  }
}
```

The collection name needs to be available in create(). Check how it's currently obtained — it may need to be passed in or derived from the collection reference.

### 3. Update existing tests

Ensure existing `MemoryService` tests still pass with the optional dependency absent.

### 4. Add new tests for index write

Add tests to `src/services/__tests__/memory.service.spec.ts` (or the colocated spec if it exists):

- Test that create() calls `memoryIndex.index()` when provided
- Test that create() succeeds even when index write fails
- Test that create() works without memoryIndex (backwards compat)

---

## Verification

- [ ] `MemoryService` constructor accepts optional `memoryIndex`
- [ ] `create()` writes to index after Weaviate insert
- [ ] Index write failure is non-fatal (logged, not thrown)
- [ ] Existing tests pass unchanged
- [ ] New tests cover index write path
- [ ] Build passes

---

## Expected Output

**Files Modified**:
- `src/services/memory.service.ts` — add optional memoryIndex dep, wire into create()
- Memory service test file — add index write tests

---

**Next Task**: [Task 95: Add MemoryService.getById](task-95-memory-service-getbyid.md)
**Related Design Docs**: [agent/design/local.memory-index-lookup.md](../../design/local.memory-index-lookup.md)
