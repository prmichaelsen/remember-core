# Milestone 6: Ghost/Trust Integration into MemoryService

**Status**: Not Started
**Estimated Duration**: 0.5 weeks
**Dependencies**: M5 (Trust & Ghost System — complete)

---

## Goal

Wire ghost/trust filtering into MemoryService's search, query, and findSimilar methods so that remember-mcp's 3 deferred tools (search_memory, query_memory, ghost_config) can migrate to remember-core.

## Context

M5 extracted all ghost/trust building blocks from remember-mcp into remember-core:
- `buildTrustFilter()` — builds Weaviate filter by accessor trust level
- `formatMemoryForPrompt()` — redacts content by trust tier
- `GhostModeContext` on `AuthContext` — carries accessor trust info
- Ghost exclusion logic — excludes `content_type:'ghost'` from default searches

However, `MemoryService.search()`, `MemoryService.query()`, and `MemoryService.findSimilar()` don't accept ghost_context parameters. The trust filtering and ghost exclusion currently happen inline in remember-mcp's tool handlers, preventing migration.

All building blocks exist — this milestone just wires them together.

## Deliverables

1. **Extended input types**: `SearchMemoryInput`, `QueryMemoryInput`, `FindSimilarInput` gain optional ghost_context parameter
2. **Ghost filtering in MemoryService**: search/query/findSimilar apply `buildTrustFilter()` and ghost content exclusion when ghost_context is present
3. **Tests**: Unit tests for ghost-integrated search/query/findSimilar
4. **Updated migration guide**: Document ghost_context parameter for consumers

## Success Criteria

- [ ] `MemoryService.search({ ..., ghost_context })` applies trust filter and ghost exclusion
- [ ] `MemoryService.query({ ..., ghost_context })` applies trust filter and ghost exclusion
- [ ] `MemoryService.findSimilar({ ..., ghost_context })` applies ghost exclusion (no post-filter needed)
- [ ] Default behavior unchanged (no ghost_context = no ghost filtering)
- [ ] All existing tests pass (backwards compatible)
- [ ] New tests cover ghost-integrated paths
- [ ] remember-mcp can migrate search_memory, query_memory, ghost_config tools after this
