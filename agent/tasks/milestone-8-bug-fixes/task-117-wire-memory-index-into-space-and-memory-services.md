# Task 117: Wire MemoryIndexService into SpaceService and Make Required in MemoryService

**Milestone**: [M8 - Bug Fixes](../milestones/milestone-8-bug-fixes.md)
**Estimated Time**: 1-2 hours
**Dependencies**: None (MemoryIndexService already exists)
**Status**: Completed (2026-03-06)

---

## Objective

Make MemoryIndexService a required dependency in both MemoryService and SpaceService so that all memory creation and publish/revise operations write to the Firestore memory index. Currently SpaceService has no awareness of MemoryIndexService, and MemoryService treats it as optional — causing published memories to be missing from the index (root cause of task-116).

---

## Context

Investigation of UUID `ffff46cb-7e5e-5499-a43b-d02821aadfd9` confirmed:
- Memory exists in `Memory_spaces_public` (published to `the_void`)
- Memory is **not** in the Firestore memory index
- `MemoryIndexService.lookup()` returns null, causing 404s on `GET /memories/:id`

Two gaps identified:
1. **SpaceService.publish** copies memories to `Memory_spaces_public` with a new composite UUID but never writes to the memory index
2. **MemoryService** accepts `memoryIndex` as optional — it should be required so index writes are guaranteed

---

## Steps

### 1. Make MemoryIndexService Required in MemoryService

Update the `MemoryService` constructor to require `memoryIndex` instead of optional.

- Change `options?.memoryIndex?: MemoryIndexService` to a required parameter
- Remove the `if (this.options?.memoryIndex)` guards around index writes in `create()` and `resolveById()`
- Update all existing callers/tests to pass a MemoryIndexService (or mock)

### 2. Add MemoryIndexService to SpaceService

Wire MemoryIndexService into SpaceService constructor.

- Add `memoryIndex: MemoryIndexService` as a required constructor parameter
- After publish writes the memory to `Memory_spaces_public`, call `memoryIndex.index(uuid, 'Memory_spaces_public')`
- After revise writes the updated memory, call `memoryIndex.index(uuid, collectionName)` (in case collection changed)

### 3. Update SpaceService Tests

- Update SpaceService constructor calls to pass a mock MemoryIndexService
- Add test: publish indexes the new UUID in `Memory_spaces_public`
- Add test: revise re-indexes the UUID

### 4. Update MemoryService Tests

- Update all MemoryService constructor calls to pass a mock MemoryIndexService (no longer optional)
- Verify existing index-write tests still pass

### 5. Verify Build and Full Test Suite

- `tsc --noEmit` clean
- All tests pass

---

## Verification

- [x] MemoryIndexService is a required parameter in MemoryService constructor
- [x] MemoryIndexService is a required parameter in SpaceService constructor
- [x] SpaceService.publish writes to memory index after inserting into space collection
- [ ] SpaceService.revise writes to memory index after updating in space collection (skipped — same UUID, collection unchanged)
- [x] MemoryService.create always writes to memory index (no conditional guard)
- [x] All existing tests updated to pass MemoryIndexService
- [x] New tests cover publish index writes
- [x] `tsc --noEmit` passes
- [x] Full test suite passes (763 tests, 60 suites)

---

## Expected Output

**Files Modified**:
- `src/services/memory.service.ts` — memoryIndex required, remove optional guards
- `src/services/space.service.ts` — add memoryIndex param, index on publish/revise
- `src/services/space.service.spec.ts` — mock memoryIndex, new tests
- `src/services/memory.service.spec.ts` — update constructor calls (if needed)
- Any other test files that construct MemoryService or SpaceService

---

## Notes

- This is the root cause fix for task-116 (MemoryIndexService.lookup() returns null)
- After this fix, a backfill script should be run to index existing published memories that are missing from the index
- remember-rest-service will also need to pass MemoryIndexService when constructing SpaceService

---

**Related Tasks**: [task-116](../unassigned/task-116-rca-memory-index-lookup-returns-null.md)
