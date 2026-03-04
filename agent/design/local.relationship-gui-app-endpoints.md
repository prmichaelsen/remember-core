# App Client Relationship GUI Endpoints

**Concept**: App-first compound endpoints for relationship-aware memory fetching, serving agentbase.me M46 Relationship GUI Enhancements
**Created**: 2026-03-04
**Status**: Design Specification
**Consumer**: agentbase.me (M46 — Relationship GUI Enhancements)

---

## Overview

Two new App Client compound endpoints that serve the agentbase.me memory view page and relationship view page. These endpoints avoid N+1 fan-out by composing `MemoryService`, `RelationshipService`, and batch memory resolution into single responses. A `relationship_ids` filter on `SearchFilters` enables scoped semantic search within relationships.

This is the remember-core side of the agentbase.me contract defined in `agentbase.me/agent/design/local.relationship-gui-remember-core-contract.md`.

---

## Problem Statement

- agentbase.me's memory view page needs a memory document plus its relationships with preview titles — currently impossible without N+1 separate calls
- The relationship view page needs paginated memory resolution for a single relationship — no endpoint exists
- No way to scope a semantic search to memories within specific relationships
- The App Client (`src/app/`) has no `memories` or `relationships` resource — only profiles and ghost
- agentbase.me M46 tasks 326-328 are blocked on these endpoints

---

## Solution

Three capabilities, all in remember-core:

1. **Endpoint A** — `appClient.memories.get()`: Compound memory fetch with relationship previews
2. **Endpoint B** — `appClient.relationships.getMemories()`: Paginated relationship memory resolution
3. **SearchFilters enhancement** — `relationship_ids?: string[]` filter for scoped search

Both endpoints are App Client methods calling REST routes via `fetch()`. They follow the existing pattern in `src/app/profiles.ts` and `src/app/ghost.ts`.

### Alternatives Considered

- **Svc-only approach** (consumer composes svc calls): Rejected — requires N+1 fan-out for relationship previews, duplicates orchestration logic across consumers
- **GraphQL**: Rejected — remember-core uses REST exclusively, no GraphQL infrastructure
- **Embed relationships in memory search results**: Rejected — violates separation; relationships are a separate concern with their own pagination

---

## Implementation

### Architecture

```
agentbase.me (SSR / API routes)
  │
  ├─ Memory View Page ──► appClient.memories.get(userId, memoryId, { includeRelationships: true })
  │                        → GET /api/app/v1/memories/:memoryId?includeRelationships=true
  │
  ├─ Relationship View ──► appClient.relationships.getMemories(userId, relId, { limit, offset })
  │                        → GET /api/app/v1/relationships/:relationshipId/memories
  │
  └─ Scoped Search ──────► svcClient.memories.search(userId, { filters: { relationship_ids } })
                            → POST /api/svc/v1/memories/search (existing route, new filter)
```

### Endpoint A: Compound Memory with Relationship Previews

**Route**: `GET /api/app/v1/memories/:memoryId`

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `includeRelationships` | boolean | `false` | Include relationships with memory previews |
| `relationshipMemoryLimit` | number | `5` | Max preview memories per relationship (max: 10) |

**Response** (when `includeRelationships=true`):
```typescript
{
  memory: Memory,
  relationships: RelationshipWithPreviews[]
}

interface RelationshipWithPreviews {
  id: string
  relationship_type: string
  observation: string
  strength: number
  confidence: number
  source: 'user' | 'rem' | 'rule'
  memory_count: number                    // total memory_ids.length
  memory_previews: MemoryPreview[]        // up to relationshipMemoryLimit
}

interface MemoryPreview {
  memory_id: string
  title: string                           // Memory.title ?? first 80 chars of content
  author_id: string                       // Memory.owner_id ?? Memory.user_id
  space_ids: string[]
  group_ids: string[]
}
```

**Implementation flow**:
1. `MemoryService.getById(memoryId)` — fetch the memory
2. `RelationshipService.findByMemoryIds({ memory_ids: [memoryId] })` — find all relationships containing this memory
3. For each relationship:
   - Take `memory_ids`, exclude `memoryId` (user is viewing it)
   - Batch-fetch up to `relationshipMemoryLimit` memories via `MemoryService.getById()` per ID
   - Sort previews alphabetically by title
   - Build `MemoryPreview` (title fallback: first 80 chars of content; author_id fallback: `user_id`)
   - Set `memory_count` to full `memory_ids.length`

**Error responses**: 401 (no auth), 404 (not found), 400 (`relationshipMemoryLimit` > 10 or < 1)

**App Client method**:
```typescript
// src/app/memories.ts
export interface MemoriesResource {
  get(
    userId: string,
    memoryId: string,
    options?: {
      includeRelationships?: boolean
      relationshipMemoryLimit?: number
    }
  ): Promise<SdkResponse<MemoryWithRelationships>>
}
```

### Endpoint B: Paginated Relationship Memories

**Route**: `GET /api/app/v1/relationships/:relationshipId/memories`

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | `20` | Page size (max: 50) |
| `offset` | number | `0` | Pagination offset |

**Response**:
```typescript
{
  relationship: RelationshipMetadata,
  memories: Memory[],
  total: number,
  has_more: boolean
}

interface RelationshipMetadata {
  id: string
  relationship_type: string
  observation: string
  strength: number
  confidence: number
  source: 'user' | 'rem' | 'rule'
  memory_count: number
  created_at: string
  updated_at: string
  tags: string[]
}
```

**Implementation flow**:
1. Fetch relationship by ID from Weaviate (needs `RelationshipService.getById()` — new method)
2. Verify `relationship.user_id === authenticated userId`
3. Sort `memory_ids` alphabetically by resolved title (consistent with card previews)
4. Apply `offset` and `limit` to the sorted ID list
5. Batch-fetch those memories via `MemoryService.getById()` per ID
6. Exclude soft-deleted memories, adjust `total`
7. `has_more = total > offset + memories.length`

**Error responses**: 401 (no auth), 404 (not found or wrong user), 400 (limit > 50 or offset < 0)

**App Client method**:
```typescript
// src/app/relationships.ts
export interface RelationshipsResource {
  getMemories(
    userId: string,
    relationshipId: string,
    options?: {
      limit?: number
      offset?: number
    }
  ): Promise<SdkResponse<RelationshipMemoriesResult>>
}
```

### SearchFilters Enhancement: `relationship_ids`

**Type change** in `src/types/search.types.ts`:
```typescript
export interface SearchFilters {
  // ...existing fields unchanged...
  relationship_ids?: string[]   // NEW — filter to memories in these relationships
}
```

**Behavior**:
1. Fetch each relationship by ID
2. Collect all `memory_ids` into a set
3. Apply as Weaviate filter: `id IN collected_memory_ids`
4. Combine with other filters (AND semantics)
5. Non-existent `relationship_ids` contribute nothing (not an error)

**Impact**: No new svc client methods — `svc.memories.search()` already accepts `SearchFilters`. `MemoryService.search()` must handle the new filter field by resolving relationship IDs to memory ID sets.

### New Service Methods Required

**`RelationshipService.getById(relationshipId: string)`**: Fetch a single relationship by UUID. Does not exist today — `findByMemoryIds` searches by member memory IDs, not relationship ID. Implementation: `collection.query.fetchObjectById(relationshipId)`.

### File Structure

```
src/app/
  memories.ts              # NEW — MemoriesResource (get with relationship previews)
  relationships.ts         # NEW — RelationshipsResource (getMemories)
  index.ts                 # MODIFIED — add memories + relationships to AppClient

src/services/
  relationship.service.ts  # MODIFIED — add getById() method

src/types/
  search.types.ts          # MODIFIED — add relationship_ids to SearchFilters

src/services/
  memory.service.ts        # MODIFIED — handle relationship_ids in search()

docs/
  openapi-web.yaml         # MODIFIED — add Endpoint A + B schemas
  openapi.yaml             # MODIFIED — add relationship_ids to SearchFilters schema
```

### AppClient Factory Update

```typescript
// src/app/index.ts — updated
export interface AppClient {
  profiles: ProfilesResource;
  ghost: GhostResource;
  memories: MemoriesResource;          // NEW
  relationships: RelationshipsResource; // NEW
}
```

---

## Benefits

- **Single round-trip**: Memory view page gets memory + relationships + previews in one call
- **Infinite scroll support**: Relationship view page paginates with offset/limit
- **Scoped search**: `relationship_ids` filter enables "search within this relationship" UX
- **Unblocks agentbase.me M46**: Tasks 326-328 are blocked on Endpoints A and B
- **Follows existing patterns**: Same App Client structure as profiles/ghost resources

---

## Trade-offs

- **Memory resolution fan-out**: Endpoint A resolves up to `10 * N_relationships` memories. Mitigated by the 10-preview cap and most memories having few relationships.
- **No batch getById on MemoryService**: Each preview memory is a separate Weaviate fetch. For MVP this is acceptable; future optimization could add a batch method.
- **Alphabetical sort requires full memory resolution**: Endpoint B must fetch all memories to sort by title, then paginate. For relationships with <50 members (split cap), this is fast.
- **`relationship_ids` filter is O(N)**: Resolving relationship IDs to memory ID sets requires N relationship fetches. Acceptable for 1-3 relationships; would need caching for larger sets.

---

## Dependencies

- `MemoryService.getById()` — exists
- `RelationshipService.findByMemoryIds()` — exists (M10)
- `RelationshipService.getById()` — **new** (simple Weaviate fetchObjectById)
- `HttpClient` / `SdkResponse` — exists (src/clients/)
- `assertServerSide()` — exists (src/clients/guard.ts)

---

## Testing Strategy

### Endpoint A (memories.get)
- Memory with 0 relationships → `relationships: []`
- Memory with 3 relationships, limit=5 → up to 5 previews each
- `relationshipMemoryLimit=1` → exactly 1 preview per relationship
- `relationshipMemoryLimit=20` → 400 error
- `includeRelationships=false` → no `relationships` field
- Preview excludes current memory from list
- Title fallback: no-title memory uses content[:80]
- Author fallback: `owner_id` preferred over `user_id`

### Endpoint B (relationships.getMemories)
- 50 memories, limit=20, offset=0 → first 20, `has_more: true`
- offset=40 → last 10, `has_more: false`
- Soft-deleted memories excluded, total adjusted
- Non-existent relationship → 404
- Wrong user → 404 (not 403)

### SearchFilters (relationship_ids)
- `relationship_ids: ['rel-1']` → only memories in rel-1
- `relationship_ids: ['rel-1', 'rel-2']` → union of both
- `relationship_ids: ['nonexistent']` → 0 results (not error)
- Combined with other filters → AND semantics

### App Client
- Mock `fetch()`, verify correct URL/method/query params/headers
- Verify `SdkResponse` shape and `.throwOnError()` behavior

---

## Migration Path

1. Add `RelationshipService.getById()` method
2. Add `relationship_ids` to `SearchFilters` + wire into `MemoryService.search()`
3. Create `src/app/memories.ts` (MemoriesResource)
4. Create `src/app/relationships.ts` (RelationshipsResource)
5. Update `src/app/index.ts` (AppClient factory)
6. Update OpenAPI specs
7. Regenerate types

---

## Future Considerations

- **Batch memory fetch**: `MemoryService.getByIds(ids[])` for efficient multi-memory resolution
- **Server-side relationship search**: Full semantic search scoped to relationship members (vs. client-side fuzzy)
- **Relationship graph traversal**: "Related to related" — follow relationship chains
- **Caching**: Cache relationship → memory_ids mapping for hot relationships

---

**Status**: Design Specification
**Recommendation**: Create a new remember-core milestone (M15) with tasks for: (1) RelationshipService.getById + relationship_ids filter, (2) App Client memories resource (Endpoint A), (3) App Client relationships resource (Endpoint B), (4) OpenAPI specs + tests
**Related Documents**:
- agentbase.me/agent/design/local.relationship-gui-remember-core-contract.md (consumer contract)
- agentbase.me/agent/design/local.relationship-gui-enhancements.md (consumer UI design)
- agentbase.me/agent/clarifications/clarification-25-relationship-gui.md
- agentbase.me/agent/clarifications/clarification-26-relationship-gui-decisions.md
- agent/design/local.client-sdk-architecture.md (App Client architecture)
- agent/design/core-sdk.architecture.md (service layer pattern)
