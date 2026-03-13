# Milestone 77: Ordered Relationships

**Goal**: Add positional ordering to relationship members via `member_order_json`, with a dedicated reorder operation and App client compound operations for script composition
**Duration**: 1-2 weeks
**Dependencies**: None
**Status**: Completed

---

## Overview

Relationships currently connect N memories without positional ordering. This milestone adds a `member_order_json` TEXT property (JSON-encoded `{ memory_id → position }` map) that tracks zero-indexed positions for each member. A dedicated `reorder` operation supports multiple modes (move_to_index, swap, set_order, move_before, move_after) via a discriminated union. The App client gains `insertMemoryAt` (compound: create + add + reorder) and `getOrderedContent` (position-sorted paginated reads).

The driving use case is script composition — a user builds a script from individually authored memory snippets where order is the content's meaning.

Design: `agent/design/local.ordered-relationships.md`
Clarification: `agent/clarifications/clarification-24-ordered-relationships.md`

---

## Deliverables

### 1. Schema & Types
- `member_order_json` TEXT property on relationship documents in Weaviate
- `member_order: Record<string, number>` on Relationship type
- `ReorderOperation` discriminated union type
- `ReorderInput` with optimistic locking (`version` required)

### 2. RelationshipService
- `reorder()` dedicated method with all 5 operation modes
- Auto-ordering on `create()` (members get positions in input order)
- Append-to-end on `add_memory_ids`
- Compact-on-remove for `remove_memory_ids`
- `related_memory_ids` returned sorted by position
- Parsed `member_order` on all read paths (getById, findByMemoryIds, search)
- Lazy backfill for existing relationships without `member_order_json`

### 3. OpenAPI & REST
- `docs/openapi.yaml`: POST `/relationships/:id/reorder`, ReorderOperation schema, member_order on Relationship response
- `docs/openapi-web.yaml`: GET `/relationships/:id/ordered-content` endpoint, `OrderedContentResponse` + `OrderedContentMemory` schemas
- Regenerated types via `npm run generate:types`

### 4. Svc Client
- `client.relationships.reorder(userId, relationshipId, input)`

### 5. App Client
- `client.relationships.insertMemoryAt(userId, input)` — compound: create memory + add to relationship + reorder to position
- `client.relationships.getOrderedContent(userId, relationshipId, options)` — position-sorted paginated reads with `position` field per item

---

## Success Criteria

- [ ] All existing relationship tests still pass (no regressions)
- [ ] `reorder()` supports all 5 operation types with correct position math
- [ ] Optimistic locking: reorder with stale version returns 409
- [ ] `set_order` with mismatched membership returns 409
- [ ] New members auto-appended to end
- [ ] Removed members trigger position compaction
- [ ] `related_memory_ids` sorted by position on read
- [ ] Lazy backfill: relationships without `member_order_json` get default order on first read
- [ ] Svc client `reorder()` calls correct endpoint
- [ ] App client `insertMemoryAt` creates memory + adds + reorders in sequence
- [ ] App client `getOrderedContent` returns position-sorted paginated results
- [ ] OpenAPI specs updated and types regenerated
- [ ] `npx jest` all tests pass
- [ ] `npm run typecheck` passes

---

## Key Files to Create

```
src/services/relationship-reorder.ts          — pure reorder logic (operation handlers + helpers)
src/services/relationship-reorder.spec.ts     — reorder unit tests (26 tests)
src/services/__tests__/e2e/ordered-relationships.e2e.ts — e2e integration tests (21 tests)
```

## Key Files to Modify

```
src/database/weaviate/v2-collections.ts       — member_order_json property
src/types/memory.types.ts                     — member_order field, ReorderOperation type
src/services/relationship.service.ts          — reorder(), create/update/read changes
src/services/relationship.service.spec.ts     — order management tests
src/clients/svc/v1/relationships.ts           — reorder()
src/clients/svc/v1/relationships.spec.ts      — reorder tests
src/app/relationships.ts                      — insertMemoryAt(), getOrderedContent()
src/app/relationships.spec.ts                 — compound operation tests
docs/openapi.yaml                             — reorder endpoint + schemas
docs/openapi-web.yaml                         — ordered content response
```

---

## Tasks

1. [Task 516: Schema & Types](../tasks/milestone-77-ordered-relationships/task-516-schema-and-types.md) — Add member_order_json to Weaviate schema, member_order to Relationship type, ReorderOperation union
2. [Task 517: Reorder Logic](../tasks/milestone-77-ordered-relationships/task-517-reorder-logic.md) — Implement reorder operation handlers (move_to_index, swap, set_order, move_before, move_after)
3. [Task 518: RelationshipService Integration](../tasks/milestone-77-ordered-relationships/task-518-relationship-service-integration.md) — Wire reorder() into service, auto-order on create/update, sorted reads, lazy backfill
4. [Task 519: OpenAPI & Type Generation](../tasks/milestone-77-ordered-relationships/task-519-openapi-type-generation.md) — Update openapi.yaml + openapi-web.yaml, regenerate types
5. [Task 520: Svc Client Reorder](../tasks/milestone-77-ordered-relationships/task-520-svc-client-reorder.md) — Add relationships.reorder() to svc client
6. [Task 521: App Client Compounds](../tasks/milestone-77-ordered-relationships/task-521-app-client-compounds.md) — insertMemoryAt() and getOrderedContent() App client operations

---

## Testing Requirements

- [ ] Unit tests: all 5 reorder operations, edge cases (empty, single member, duplicates)
- [ ] Unit tests: auto-ordering on create, append on add, compact on remove
- [ ] Unit tests: optimistic locking (stale version → 409)
- [ ] Unit tests: set_order membership mismatch → 409
- [ ] Unit tests: lazy backfill for pre-existing relationships
- [ ] Unit tests: Svc client reorder endpoint call
- [ ] Unit tests: App client insertMemoryAt compound flow
- [ ] Unit tests: App client getOrderedContent pagination + position sorting

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| JSON parse overhead on large relationships | Low | Low | Relationships rarely exceed 100 members; JSON parse is O(n) and fast |
| Lazy backfill produces unexpected order | Medium | Medium | Default order follows existing `related_memory_ids` array position — deterministic |
| insertMemoryAt partial failure (memory created but not added) | Low | Low | Orphaned memories are discoverable and harmless; document this behavior |

---

**Next Milestone**: TBD
**Blockers**: None
**Notes**: Independent of M74 (Hierarchical Relationships) — both modify relationships but touch different fields. Can be implemented in parallel.
