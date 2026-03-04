# Milestone 15: Relationship GUI App Endpoints

**Status**: not_started
**Estimated**: 1 week
**Dependencies**: None (all primitives exist: MemoryService, RelationshipService, HttpClient, App Client)
**Design**: agent/design/local.relationship-gui-app-endpoints.md
**Consumer**: agentbase.me M46 — Relationship GUI Enhancements

---

## Goal

Add two App Client compound endpoints and a SearchFilters enhancement to remember-core, enabling the agentbase.me relationship GUI. Endpoint A serves the memory view page (memory + relationship previews). Endpoint B serves the relationship view page (paginated memory resolution). The `relationship_ids` filter enables scoped semantic search.

## Deliverables

### 1. Service Layer
- `RelationshipService.getById(relationshipId)` method
- `relationship_ids?: string[]` on `SearchFilters`
- `MemoryService.search()` wired to resolve `relationship_ids` into memory ID sets

### 2. App Client Resources
- `src/app/memories.ts` — `MemoriesResource` with `get()` (Endpoint A)
- `src/app/relationships.ts` — `RelationshipsResource` with `getMemories()` (Endpoint B)
- Updated `src/app/index.ts` — `AppClient` factory with `memories` + `relationships`

### 3. OpenAPI Specs
- `docs/openapi-web.yaml` — Endpoint A + B request/response schemas
- `docs/openapi.yaml` — `relationship_ids` on SearchFilters schema
- Regenerated types for both specs

### 4. Tests
- Unit tests for `RelationshipService.getById()`
- Unit tests for `relationship_ids` filter in `MemoryService.search()`
- Unit tests for `MemoriesResource.get()` (mock fetch)
- Unit tests for `RelationshipsResource.getMemories()` (mock fetch)
- All existing tests continue to pass

## Success Criteria

- [ ] `appClient.memories.get(userId, memoryId, { includeRelationships: true })` returns memory + relationship previews
- [ ] `appClient.relationships.getMemories(userId, relId, { limit, offset })` returns paginated memories
- [ ] `relationship_ids` filter on SearchFilters scopes search to relationship members
- [ ] `RelationshipService.getById()` fetches single relationship by UUID
- [ ] Preview titles sorted alphabetically, current memory excluded
- [ ] Title fallback (content[:80]) and author_id fallback (owner_id ?? user_id) work
- [ ] OpenAPI specs define both endpoints with full schemas
- [ ] Generated types match response shapes
- [ ] Unit tests pass for all new code
- [ ] All 536+ existing tests continue to pass

## Tasks

| ID | Name | Est. Hours | Dependencies |
|----|------|-----------|-------------|
| task-71 | RelationshipService.getById + relationship_ids filter | 2-3 | None |
| task-72 | App Client Endpoint B — relationships.getMemories | 2-3 | task-71 |
| task-73 | App Client Endpoint A — memories.get with relationship previews | 3-4 | task-71 |
| task-74 | AppClient factory + OpenAPI specs + tests | 2-3 | task-72, task-73 |

## Testing Requirements

- [ ] RelationshipService.getById — found, not found, wrong user
- [ ] relationship_ids filter — single, multiple, nonexistent, combined with other filters
- [ ] Endpoint A — 0 relationships, N relationships, limit enforcement, title/author fallback
- [ ] Endpoint B — pagination, has_more, deleted memories excluded, wrong user → 404
- [ ] App Client methods — correct URL, method, query params, headers, SdkResponse shape

---

**Next Milestone**: TBD
**Blockers**: None
**Notes**: Unblocks agentbase.me M46 tasks 326-328 (relationship view page, fuzzy search, API fallback)
