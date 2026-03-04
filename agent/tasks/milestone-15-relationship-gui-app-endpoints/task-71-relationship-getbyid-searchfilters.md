# Task 71: RelationshipService.getById + relationship_ids Filter

**Milestone**: [M15 - Relationship GUI App Endpoints](../../milestones/milestone-15-relationship-gui-app-endpoints.md)
**Estimated Time**: 2-3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add `RelationshipService.getById()` method for fetching a single relationship by UUID, and add `relationship_ids?: string[]` to `SearchFilters` with wiring into `MemoryService.search()`.

---

## Context

Endpoint B (relationship view page) needs to fetch a relationship by its UUID — no such method exists on `RelationshipService` today. The `relationship_ids` SearchFilters enhancement enables scoped semantic search within specific relationships (P1 feature for agentbase.me, but simple enough to include now).

---

## Steps

### 1. Add `getById()` to RelationshipService

In `src/services/relationship.service.ts`:

```typescript
async getById(relationshipId: string): Promise<GetRelationshipResult> {
  const result = await this.collection.query.fetchObjectById(relationshipId, {
    returnProperties: [
      'user_id', 'memory_ids', 'relationship_type', 'observation',
      'strength', 'confidence', 'source', 'tags',
      'created_at', 'updated_at', 'version',
    ],
  });

  if (!result) {
    return { found: false };
  }

  return {
    found: true,
    relationship: { id: relationshipId, ...result.properties },
  };
}
```

Define `GetRelationshipResult` type and export from barrel.

### 2. Add `relationship_ids` to SearchFilters

In `src/types/search.types.ts`, add to the `SearchFilters` interface:

```typescript
relationship_ids?: string[]  // Filter to memories in these relationships
```

### 3. Wire `relationship_ids` into MemoryService.search()

In `src/services/memory.service.ts`, in the `search()` method where filters are applied:

1. Check if `input.filters?.relationship_ids` is provided
2. For each relationship ID, fetch via `RelationshipService.getById()` or direct Weaviate query
3. Collect all `memory_ids` into a Set
4. Apply as a Weaviate `ContainsAny` filter on the `id` field (or equivalent)
5. If no memory IDs found (all relationships empty/nonexistent), return empty results

Note: MemoryService currently doesn't have a reference to RelationshipService. Two options:
- Pass RelationshipService as an optional constructor param
- Resolve relationship_ids to memory_ids in the caller (App Client or REST handler) before calling search

Prefer the second approach — keep MemoryService decoupled. The `relationship_ids` filter gets resolved to a `memory_ids` set by the caller, then passed as a concrete Weaviate filter.

### 4. Add Weaviate ID filter support

Ensure the search filter builder can handle an `id IN [...]` filter. Check if existing filter utilities in `src/utils/filters.ts` support this or if a new filter type is needed.

### 5. Unit Tests

Colocated tests in existing spec files:

- `RelationshipService.getById()` — found, not found
- `relationship_ids` in SearchFilters — type compiles correctly
- Filter resolution — single relationship, multiple, nonexistent, empty

---

## Verification

- [ ] `RelationshipService.getById(id)` returns relationship when found
- [ ] `RelationshipService.getById(id)` returns `{ found: false }` when not found
- [ ] `GetRelationshipResult` type exported from services barrel
- [ ] `SearchFilters.relationship_ids` field exists and is optional string[]
- [ ] Weaviate ID filter works for memory ID set filtering
- [ ] Unit tests pass
- [ ] All existing tests pass
- [ ] Build compiles without errors

---

**Next Task**: [Task 72](task-72-app-endpoint-b-relationship-memories.md)
**Related Design Docs**: [Relationship GUI App Endpoints](../../design/local.relationship-gui-app-endpoints.md)
