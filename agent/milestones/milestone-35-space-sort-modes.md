# Milestone 35: SpaceService Sort Modes

**Goal**: Add 5 sort modes to SpaceService (byTime, byRating, byProperty, byBroad, byRandom) matching existing MemoryService equivalents, operating on space/group collections with moderation filtering and cross-collection deduplication.

**Status**: Not Started
**Estimated Duration**: 0.5 weeks
**Dependencies**: M11 (Basic Sort Modes), M20 (Memory Ratings), M28 (byProperty), M31 (byBroad/byRandom)

---

## Overview

SpaceService currently implements `byDiscovery` and `byRecommendation` sort modes for space/group collections. MemoryService has 5 additional sort modes (byTime, byRating, byProperty, byBroad, byRandom) that are not yet available for space/group searches. The remember-mcp `search_space_by` tool defines all 6 modes but returns stub errors for the 5 missing ones.

Each new SpaceService method follows the same cross-collection pattern established by `byDiscovery`:
1. Accept `spaces?: string[]` and `groups?: string[]` parameters
2. Validate space/group IDs
3. Permission-check non-approved moderation filters
4. Use `buildBaseFilters()` per collection
5. Search across space + group collections
6. Deduplicate results cross-collection via `dedupeBySourceId()`
7. Return with `spaces_searched` / `groups_searched` metadata

All 5 modes are mechanical ports of the MemoryService equivalents adapted to the SpaceService cross-collection pattern. No new algorithms or infrastructure needed.

---

## Deliverables

1. Input/result type interfaces for all 5 space sort modes
2. SpaceService.byTime() method
3. SpaceService.byRating() method
4. SpaceService.byProperty() method
5. SpaceService.byBroad() method
6. SpaceService.byRandom() method
7. Barrel exports from `services/index.ts`
8. Unit tests

---

## Key Decisions

- Input types mirror MemoryService equivalents but add `spaces?: string[]`, `groups?: string[]`, `moderation_filter?: ModerationFilter`, `include_comments?: boolean`, `dedupe?: DedupeOptions`
- No `deleted_filter` or `ghost_context` on space modes (spaces use retract model, not soft-delete; no ghost filtering in public spaces)
- Result types include `spaces_searched` and `groups_searched` metadata (same as existing space search results)
- byBroad imports `sliceContent` from memory.service.ts (already exported)
- byRandom uses Weaviate pool fetch (same as MemoryService) — no Firestore index needed for space collections

---

## Success Criteria

- [ ] All 5 sort modes implemented on SpaceService
- [ ] Each mode validates space/group IDs and checks moderation permissions
- [ ] Cross-collection search + dedup works correctly
- [ ] Input/result types exported from services barrel
- [ ] Unit tests cover each mode (happy path + validation + multi-collection)
- [ ] All existing tests pass

---

## Tasks

- Task 176: Space sort mode types + byTime + byRating methods
- Task 177: SpaceService byProperty + byBroad + byRandom methods
- Task 178: Unit tests + barrel exports
