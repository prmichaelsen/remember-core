# Milestone 18: Memory Index Lookup Table

**Goal**: Replace MemoryResolutionService guesswork with a Firestore lookup table for O(1) cross-collection memory resolution
**Duration**: 1 week
**Dependencies**: None (all prerequisites exist)
**Status**: Not Started

---

## Overview

Every memory lives in a Weaviate collection scoped by owner type, but callers provide wrong collection context >90% of the time. This milestone adds a Firestore index (`memory_index`) mapping memory UUIDs to collection names, folds resolution into `MemoryService.getById()`, and deprecates `MemoryResolutionService`.

---

## Deliverables

### 1. MemoryIndexService
- Firestore-backed service with `index()`, `lookup()` methods
- `MemoryIndexEntry` type: `{ collection_name, created_at }`
- Path helper in `firestore/paths.ts`
- Colocated unit tests

### 2. MemoryService Integration
- Index write in `MemoryService.create()` (after Weaviate success)
- New `MemoryService.getById(memoryId)` method using index lookup
- Legacy fallback for unindexed memories during migration window

### 3. Backfill Migration Script
- Script that scans all Weaviate collections and writes index entries
- Handles `Memory_users_*`, `Memory_groups_*`, `Memory_spaces_public`

### 4. MemoryResolutionService Deprecation
- Migrate all callers to `MemoryService.getById()`
- Delete `memory-resolution.service.ts`
- Remove `MemorySource` type and related exports

### 5. Barrel & Documentation Updates
- Updated `services/index.ts` barrel exports
- Updated OpenAPI spec if applicable
- Updated migration guide

---

## Success Criteria

- [ ] `MemoryIndexService.index()` writes Firestore doc on memory create
- [ ] `MemoryIndexService.lookup()` returns collection name for a UUID
- [ ] `MemoryService.getById()` resolves any memory by UUID alone (no collection context)
- [ ] Backfill script indexes all existing memories across all collection types
- [ ] `MemoryResolutionService` deleted, no remaining references
- [ ] All existing tests pass
- [ ] New colocated unit tests for index service and getById
- [ ] Build passes, no type errors

---

## Tasks

1. [Task 93: MemoryIndexService](../tasks/milestone-18-memory-index-lookup/task-93-memory-index-service.md)
2. [Task 94: Wire index write into MemoryService.create](../tasks/milestone-18-memory-index-lookup/task-94-wire-index-write.md)
3. [Task 95: Add MemoryService.getById with index lookup](../tasks/milestone-18-memory-index-lookup/task-95-memory-service-getbyid.md)
4. [Task 96: Backfill migration script](../tasks/milestone-18-memory-index-lookup/task-96-backfill-migration-script.md)
5. [Task 97: Deprecate MemoryResolutionService](../tasks/milestone-18-memory-index-lookup/task-97-deprecate-memory-resolution-service.md)

---

## Testing Requirements

- [ ] Unit tests for MemoryIndexService (index, lookup, miss)
- [ ] Unit tests for MemoryService.getById (indexed, unindexed fallback, soft-deleted)
- [ ] Unit tests for backfill script logic
- [ ] Existing test suites continue passing

---

## Design Doc

[agent/design/local.memory-index-lookup.md](../design/local.memory-index-lookup.md)
