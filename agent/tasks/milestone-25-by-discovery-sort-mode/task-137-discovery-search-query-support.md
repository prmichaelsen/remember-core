# Task 137: Add Search Query Support to byDiscovery

**Milestone**: M25 — byDiscovery Sort Mode
**Estimated Time**: 1-2 hours
**Dependencies**: Tasks 133, 134 (completed)
**Status**: Not Started

---

## Objective

Fix byDiscovery to support text search queries. Currently both MemoryService.byDiscovery() and SpaceService.byDiscovery() only use `fetchObjects` (browse/list mode). When a `query` string is provided, they should use `hybrid` search instead, so results are ranked by relevance within each pool.

---

## Problem

The design doc (`agent/design/local.by-discovery-sort-mode.md`) specifies "Applies to search queries: Yes, not just browse-mode." However, the implementation only uses `fetchObjects` with sort-based ordering. Neither `DiscoveryModeRequest` nor `DiscoverySpaceInput` accepts a `query` field, making byDiscovery browse-only.

---

## Steps

### 1. Add `query?: string` to DiscoveryModeRequest (MemoryService)

In `src/services/memory.service.ts`:
- Add optional `query` field to `DiscoveryModeRequest` interface
- In `byDiscovery()`, when `query` is provided:
  - Use `collection.query.hybrid(query, ...)` instead of `collection.query.fetchObjects(...)` for both rated and discovery pools
  - Results ranked by relevance (hybrid score), filtered by rating_count threshold
  - When `query` is absent, keep existing `fetchObjects` + sort behavior

### 2. Add `query?: string` to DiscoverySpaceInput (SpaceService)

In `src/services/space.service.ts`:
- Add optional `query` field to `DiscoverySpaceInput` interface
- In `byDiscovery()`, when `query` is provided:
  - Use `collection.query.hybrid(query, ...)` instead of `collection.query.fetchObjects(...)` in `fetchPool`
  - When `query` is absent, keep existing behavior

### 3. Update unit tests

- Test byDiscovery with query on MemoryService (verify hybrid called)
- Test byDiscovery with query on SpaceService (verify hybrid called)
- Test byDiscovery without query still uses fetchObjects (no regression)

### 4. Update OpenAPI spec if needed

- Add optional `query` param to byDiscovery endpoints

---

## Verification

- [ ] `DiscoveryModeRequest.query` optional field added
- [ ] `DiscoverySpaceInput.query` optional field added
- [ ] MemoryService.byDiscovery uses hybrid when query provided
- [ ] SpaceService.byDiscovery uses hybrid when query provided
- [ ] Browse mode (no query) still works with fetchObjects
- [ ] Interleaving algorithm unchanged
- [ ] Tests pass, build compiles
