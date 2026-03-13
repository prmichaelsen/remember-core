# Ordered Relationships

**Concept**: Positional ordering for relationship members via a `member_order` map, with a dedicated `reorder` operation and App client compound operations for script composition
**Created**: 2026-03-13
**Status**: Proposal

---

## Overview

Relationships today connect N memories without positional ordering — `related_memory_ids` is an unordered array. This design adds a `member_order_json` property (JSON-encoded `{ memory_id → position }` map) that tracks zero-indexed positions for each member. Ordering is default behavior on all relationship types (all new members get a position), but consumers don't have to use it.

The driving use case is script composition: a user builds a script from individually authored memory snippets, and the order of those snippets is the content's meaning. Without positional ordering, the relationship can only express "these snippets belong together" but not "snippet A comes before snippet B."

---

## Problem Statement

- **No sequence semantics**: A relationship with 10 memory IDs has no way to express their intended order. Consumers must sort by `created_at` (which reflects when the memory was created, not where it belongs in the sequence).
- **Script composition is broken**: A user writing a script as ordered snippets has no way to reorder them. The relationship is a bag, not a list.
- **App can't render ordered content**: The `getMemories` App client operation returns memories in whatever order Weaviate returns them. There's no "give me these memories in the author's intended order."

---

## Solution

### Data Model

Add a single new TEXT property `member_order_json` to relationship documents in Weaviate. This stores a JSON-encoded map from memory ID to zero-indexed position:

```json
{"mem-abc": 0, "mem-def": 1, "mem-ghi": 2}
```

**Key decisions** (from clarification-24):
- `related_memory_ids` remains the source-of-truth for membership. `member_order_json` is an overlay.
- No `ordered` boolean flag — presence of `member_order_json` is sufficient, and it's always populated for new relationships.
- Ordering is available for any `relationship_type`, not restricted to specific types.
- Zero-indexed integers.

### Reorder Operation

A dedicated `reorder` method on RelationshipService (not folded into `update`). Uses a discriminated union for the operation type:

```typescript
type ReorderOperation =
  | { type: 'move_to_index'; memory_id: string; index: number }
  | { type: 'swap'; memory_id_a: string; memory_id_b: string }
  | { type: 'set_order'; ordered_memory_ids: string[] }
  | { type: 'move_before'; memory_id: string; before: string }
  | { type: 'move_after'; memory_id: string; after: string };

interface ReorderInput {
  relationship_id: string;
  operation: ReorderOperation;
  version: number;  // optimistic locking — required
}
```

### Automatic Order Management

- **On create**: Members get positions in the order they're provided (first = 0, second = 1, etc.).
- **On add_memory_ids**: New members are appended to the end.
- **On remove_memory_ids**: Remaining positions are compacted (no gaps).

### Retrieval

- `getById` and `findByMemoryIds` both return a parsed `member_order: Record<string, number>` field (not the raw JSON string).
- `related_memory_ids` is returned sorted by position when `member_order` exists.

### Conflict Handling

- **`set_order` membership mismatch**: 409 Conflict with message detailing missing/extra IDs.
- **Stale version on reorder**: 409 Conflict. Clients must send the current `version` and retry on conflict.

---

## Implementation

### 1. Schema Migration

Add `member_order_json` to the relationship document properties in `src/database/weaviate/v2-collections.ts`:

```typescript
{
  name: 'member_order_json',
  dataType: 'TEXT' as const,
  description: 'JSON map of memory_id → zero-indexed position',
  indexFilterable: false,
  indexSearchable: false,
}
```

Not indexed — we never filter or search by position. It's only read when fetching a relationship.

### 2. RelationshipService Changes

**New method**: `reorder(userId, input: ReorderInput): Promise<Relationship>`

```typescript
async reorder(userId: string, input: ReorderInput): Promise<Relationship> {
  const rel = await this.getById(userId, input.relationship_id);
  if (!rel) throw new NotFoundError('Relationship not found');
  if (rel.version !== input.version) throw new ConflictError('Version mismatch — re-fetch and retry');

  const currentOrder = parseMemberOrder(rel.member_order_json);
  const newOrder = applyOperation(currentOrder, input.operation, rel.related_memory_ids);

  // Write back
  await this.adapter.update(userId, input.relationship_id, {
    member_order_json: JSON.stringify(newOrder),
    version: rel.version + 1,
    updated_at: new Date().toISOString(),
  });

  return this.getById(userId, input.relationship_id);
}
```

**Modified methods**:
- `create` — populate `member_order_json` from the order of `memory_ids` input
- `update` (add_memory_ids) — append new IDs to end of order
- `update` (remove_memory_ids) — remove from order, compact
- `getById` / `findByMemoryIds` / `search` — parse `member_order_json` into `member_order` field, sort `related_memory_ids` by position

### 3. Svc Client — `reorder`

```typescript
// client.relationships.reorder(userId, relationshipId, input)
// POST /api/svc/v1/relationships/:id/reorder
```

1:1 REST mirror. Returns the updated relationship.

### 4. App Client — `insertMemoryAt`

Compound operation: create a memory + insert it at a specific position in an existing relationship.

```typescript
interface InsertMemoryAtInput {
  relationship_id: string;
  content: string;
  position: number;              // where to insert (shifts others right)
  tags?: string[];
  context_summary?: string;
  version: number;               // optimistic lock on the relationship
}

interface InsertMemoryAtResult {
  memory_id: string;             // the newly created memory
  relationship: RelationshipMetadata;  // updated relationship with new order
}
```

**Under the hood** (calls svc REST):
1. `POST /api/svc/v1/memories` — create the memory
2. `PATCH /api/svc/v1/relationships/:id` — add the new memory ID
3. `POST /api/svc/v1/relationships/:id/reorder` — `move_to_index` to the requested position

If step 2 or 3 fails, the memory still exists (no rollback) — this is acceptable since orphaned memories are harmless and discoverable. The compound saves 3 round trips vs doing it manually.

```typescript
// client.relationships.insertMemoryAt(userId, input)
```

### 5. App Client — `getOrderedContent`

Fetch a relationship's members in position order with full content inlined. Paginated.

```typescript
interface GetOrderedContentInput {
  relationship_id: string;
  limit?: number;       // default 20
  offset?: number;      // default 0, applied to the ordered list
}

interface OrderedContentItem {
  memory_id: string;
  position: number;
  content: string;
  tags: string[];
  created_at: string;
}

interface GetOrderedContentResponse {
  relationship: RelationshipMetadata;
  items: OrderedContentItem[];    // sorted by position
  total: number;
  has_more: boolean;
}
```

**Under the hood**:
1. `GET /api/app/v1/relationships/:id/memories?limit=N&offset=M` — existing endpoint, but enhanced to return items sorted by `member_order` and include `position` field

This is an enhancement to the existing `getMemories` App client method rather than a wholly new endpoint. The response shape gains a `position` field per item and guarantees position-order sorting.

```typescript
// client.relationships.getOrderedContent(userId, relationshipId, { limit, offset })
```

**Pagination note**: `offset` and `limit` apply to the position-sorted list. Requesting `offset=5, limit=10` returns items at positions 5–14. This is straightforward since positions are dense (no gaps after compaction).

### File Changes

```
src/database/weaviate/v2-collections.ts   — add member_order_json property
src/types/memory.types.ts                 — add member_order to Relationship type
src/services/relationship.service.ts      — reorder(), order management in create/update
src/services/relationship.service.spec.ts — reorder tests, order management tests
src/clients/svc/v1/relationships.ts       — add reorder()
src/clients/svc/v1/relationships.spec.ts  — reorder tests
src/app/relationships.ts                  — add insertMemoryAt(), enhance getMemories→getOrderedContent
src/app/relationships.spec.ts             — compound operation tests
docs/openapi.yaml                         — POST /relationships/:id/reorder endpoint, ReorderOperation schema, member_order on Relationship response
docs/openapi-web.yaml                     — position field on /relationships/:id/memories items, updated OrderedContentItem schema
```

---

## Benefits

- **Sequence semantics**: Relationships can express "A then B then C", not just "A, B, C are related"
- **Script composition**: Users can build, reorder, and insert into ordered content
- **Backward compatible**: Existing unordered relationships work unchanged — `member_order` is populated lazily or on first reorder
- **Paginated ordered reads**: `getOrderedContent` supports large ordered collections without loading everything
- **Optimistic locking**: Prevents silent reorder conflicts

---

## Trade-offs

- **JSON in a TEXT field**: `member_order_json` is not queryable or indexable in Weaviate. This is fine — we never need to filter by position. But it means order can only be read after fetching the full document.
- **Three svc calls for insertMemoryAt**: The App client compound operation makes 3 sequential REST calls. A future `/api/app/v1/` server-side endpoint could reduce this to 1.
- **Compaction cost**: Removing a member from a large ordered relationship requires rewriting all positions. For relationships with <1000 members this is negligible (JSON parse + serialize).
- **Backfill**: Existing relationships have no `member_order_json`. On first read, we can generate a default order from the existing `related_memory_ids` array order (or `created_at` of each memory).

---

## Dependencies

- Clarification 24 (completed) — all design decisions
- `local.hierarchical-relationships.md` — related but independent. Hierarchical relationships add `relationship_ids` for parent-child grouping; ordered relationships add positional ordering to `memory_ids`. Both can coexist.
- `local.client-sdk-architecture.md` — App/Svc client patterns

---

## Testing Strategy

- **Unit tests (RelationshipService)**: Each reorder operation type (move_to_index, swap, set_order, move_before, move_after), auto-ordering on create, append on add, compact on remove, version conflict rejection, set_order membership mismatch 409
- **Unit tests (Svc client)**: reorder() calls correct endpoint with correct body
- **Unit tests (App client)**: insertMemoryAt compound flow (mock 3 calls), getOrderedContent pagination and position sorting
- **Integration/live tests**: Create relationship → reorder → verify order persisted → add member → verify appended → remove member → verify compacted

---

## Migration Path

1. Schema migration: add `member_order_json` to v2-collections (handled by `ensureCollection` reconciliation)
2. RelationshipService: add `reorder()`, modify `create`/`update` for automatic order management
3. Parsing layer: add `member_order` to relationship read path
4. OpenAPI specs: update `docs/openapi.yaml` with reorder endpoint + ReorderOperation schema + member_order on Relationship response; update `docs/openapi-web.yaml` with position field on relationship memories response
5. REST endpoint: `POST /api/svc/v1/relationships/:id/reorder` on remember-rest-service
6. Regenerate types: `npm run generate:types` to pick up OpenAPI changes
7. Svc client: add `relationships.reorder()`
8. App client: add `insertMemoryAt()`, enhance `getMemories` → `getOrderedContent` with position-sorted pagination
9. Backfill (lazy): on first read of a relationship without `member_order_json`, generate default order from array position

---

## Key Design Decisions

### Data Model

| Decision | Choice | Rationale |
|---|---|---|
| Storage format | JSON-encoded TEXT property (`member_order_json`) | Weaviate has no native map type; JSON string is simple and sufficient since we never query by position |
| Membership source-of-truth | `related_memory_ids` stays authoritative | Separates "who's in" from "what order" — existing code unchanged |
| Positions | Zero-indexed integers | Standard, dense after compaction |
| Ordering scope | Default on all relationship types | No artificial restriction — any relationship can be ordered |
| No `ordered` flag | Infer from `member_order_json` presence | Less schema surface, no state to sync |

### Operations

| Decision | Choice | Rationale |
|---|---|---|
| Reorder API | Dedicated `reorder()` method | Keeps `update` clean; reorder has distinct validation (version lock, membership check) |
| Operation types | Discriminated union (move_to_index, swap, set_order, move_before, move_after) | Single method, multiple modes — extensible without API surface growth |
| Append on add | New members go to end | Least surprising default |
| Compact on remove | Dense positions, no gaps | Simplifies pagination and position math |
| Conflict: stale version | 409 with optimistic locking | `version` already exists; prevents silent reorder overwrites |
| Conflict: set_order mismatch | 409 with missing/extra IDs | Forces caller to reconcile stale membership before reordering |

### Clients

| Decision | Choice | Rationale |
|---|---|---|
| Both clients from day one | Yes | Low implementation cost; avoids gap where one client can reorder but the other can't |
| App: insertMemoryAt | Compound: create memory + add to relationship + reorder | Saves 3 manual round trips for the primary script-building workflow |
| App: getOrderedContent | Enhanced getMemories with position field + position-sorted pagination | Natural evolution of existing endpoint; no new route needed |

---

## Future Considerations

- **Server-side `/api/app/v1/relationships/:id/insert`**: Single endpoint for insertMemoryAt, eliminating 3-call compound
- **Bulk reorder**: Accept multiple operations in one call for drag-and-drop reordering
- **`spliceMemories`**: Array splice semantics — remove range + insert new content at position
- **`duplicateOrdered`**: Clone a relationship with all members and positions (fork a script)
- **`getFullScript`**: Non-paginated convenience method that concatenates all ordered content into a single string (for export/preview)

---

**Status**: Proposal
**Recommendation**: Implement as standalone milestone
**Related Documents**:
- `agent/clarifications/clarification-24-ordered-relationships.md`
- `agent/design/local.client-sdk-architecture.md`
- `agent/design/local.hierarchical-relationships.md`
