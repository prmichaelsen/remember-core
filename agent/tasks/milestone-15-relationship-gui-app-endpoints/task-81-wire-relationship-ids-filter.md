# Task 81: Wire relationship_ids Filter in Search Pipeline

**Milestone**: [M15 - Relationship GUI App Endpoints](../../milestones/milestone-15-relationship-gui-app-endpoints.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 71](task-71-relationship-getbyid-searchfilters.md)
**Status**: Not Started

---

## Objective

Implement the `relationship_ids` filter that was typed but not wired in task-71. Enable scoped semantic search within specific relationships by resolving relationship IDs to memory ID sets and filtering Weaviate results.

---

## Context

Task-71 added `relationship_ids?: string[]` to `SearchFilters` and documented the design decision: "Keep MemoryService decoupled from RelationshipService. The `relationship_ids` filter gets resolved to a `memory_ids` set by the caller, then passed as a concrete Weaviate filter."

Currently, if a consumer passes `filters: { relationship_ids: ['rel-1'] }`, the filter is silently ignored — `buildDocTypeFilters()` in `src/utils/filters.ts` has no handling for it.

The intended use case is scoped search: "search for 'camping' but only within this relationship's memories." This is a P1 feature for agentbase.me relationship view pages.

**Two approaches** (per task-71 design):
1. **Caller resolves** (preferred): REST handler calls `RelationshipService.getById()` for each ID, collects `memory_ids`, passes as a Weaviate ID filter. MemoryService stays decoupled.
2. **Filter builder resolves**: Add `relationship_ids` handling directly in `buildDocTypeFilters()`. Requires MemoryService to depend on RelationshipService (rejected in task-71).

This task implements approach 1: add a `memory_ids` filter to `SearchFilters` (concrete ID set), wire it in the filter builder, and document that callers must pre-resolve `relationship_ids` → `memory_ids`.

---

## Steps

### 1. Add `memory_ids` to SearchFilters

In `src/types/search.types.ts`, add:

```typescript
memory_ids?: string[];  // Pre-resolved set of memory IDs to filter by (e.g. from relationship_ids)
```

### 2. Wire `memory_ids` in `buildDocTypeFilters()`

In `src/utils/filters.ts`, add handling for `memory_ids`:

- If `filters.memory_ids` is a non-empty array, add a Weaviate `byId().containsAny(memory_ids)` filter (or equivalent ID membership filter)
- Verify Weaviate client supports ID-based filtering; if not, use `byProperty('_id')` or an alternative approach
- Combine with existing filters via AND

### 3. Update OpenAPI specs

Add `memory_ids` to `SearchFilters` schema in both `docs/openapi.yaml` and `docs/openapi-web.yaml`.

### 4. Regenerate types

```bash
npm run generate:types
```

### 5. Unit tests

Add tests in the existing filter test file:
- `memory_ids` filter applied when non-empty array provided
- `memory_ids` filter omitted when empty or undefined
- `memory_ids` combined with other filters (AND)
- Empty `memory_ids` returns no results (or is skipped)

### 6. Integration note for REST handlers

Document in the task completion notes that REST handlers should:
1. Extract `relationship_ids` from search request
2. Call `RelationshipService.getById()` for each → collect `memory_ids` into Set
3. Pass resolved `memory_ids` in `SearchFilters.memory_ids`
4. Remove `relationship_ids` before passing to `MemoryService.search()` (or let it be ignored)

---

## Verification

- [ ] `SearchFilters.memory_ids` field exists (optional string[])
- [ ] `buildDocTypeFilters()` handles `memory_ids` filter
- [ ] Weaviate ID membership filter works correctly
- [ ] OpenAPI specs updated in both tiers
- [ ] Generated types include `memory_ids`
- [ ] Unit tests for filter wiring pass
- [ ] All existing tests pass
- [ ] `npm run typecheck` passes

---

**Related Design Docs**: [Relationship GUI App Endpoints](../../design/local.relationship-gui-app-endpoints.md)
**Notes**:
- `relationship_ids` on SearchFilters remains as a documentation/intent field — callers resolve it to `memory_ids`
- MemoryService stays decoupled from RelationshipService per task-71 design decision
