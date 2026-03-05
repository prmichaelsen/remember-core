# Task 97: Deprecate MemoryResolutionService

**Milestone**: [M18 - Memory Index Lookup Table](../../milestones/milestone-18-memory-index-lookup.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 95: MemoryService.getById](task-95-memory-service-getbyid.md), [Task 96: Backfill script](task-96-backfill-migration-script.md)
**Status**: Not Started

---

## Objective

Delete `MemoryResolutionService`, remove `MemorySource` type, migrate all callers to `MemoryService.getById()`, and remove the legacy fallback from getById.

---

## Context

After the backfill script (task-96) runs, all memories have index entries. The legacy fallback in `getById()` and the entire `MemoryResolutionService` are no longer needed. This task cleans them up.

---

## Steps

### 1. Find all callers of MemoryResolutionService

Search the codebase for:
- `MemoryResolutionService`
- `MemorySource`
- `ResolvedMemory`
- `.resolve(` on resolution service instances

### 2. Migrate callers to MemoryService.getById()

Replace each usage with `memoryService.getById(memoryId)`. The result shape is similar — `{ memory, collectionName }`.

### 3. Remove legacy fallback from getById

Remove `legacyResolve()` private method from MemoryService. `getById()` now only uses the index — returns null if index miss.

### 4. Delete MemoryResolutionService

- Delete `src/services/memory-resolution.service.ts`
- Remove exports from `src/services/index.ts`
- Remove `MemorySource`, `ResolvedMemory` type exports

### 5. Update barrel exports

Clean up `src/services/index.ts` — remove all MemoryResolutionService-related exports.

### 6. Verify build and tests

- Run `npm run build` — no type errors
- Run `npm test` — all tests pass
- Search for any remaining references to deleted types

---

## Verification

- [ ] `src/services/memory-resolution.service.ts` deleted
- [ ] `MemoryResolutionService` not referenced anywhere in codebase
- [ ] `MemorySource` type not referenced anywhere
- [ ] `ResolvedMemory` type not referenced anywhere
- [ ] `legacyResolve()` removed from MemoryService
- [ ] All callers migrated to `MemoryService.getById()`
- [ ] Barrel exports updated
- [ ] Build passes
- [ ] All tests pass

---

## Expected Output

**Files Deleted**:
- `src/services/memory-resolution.service.ts`

**Files Modified**:
- `src/services/index.ts` — remove MemoryResolutionService exports
- `src/services/memory.service.ts` — remove legacyResolve()
- Any files that imported MemoryResolutionService — migrated to MemoryService.getById()

---

**Related Design Docs**: [agent/design/local.memory-index-lookup.md](../../design/local.memory-index-lookup.md)
