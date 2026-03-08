# byMyRatings Sort Mode

**Concept**: Personal rating history browser — query and search memories a user has rated, with scoping by collection, star filtering, and a `{ memory, metadata }` response envelope
**Created**: 2026-03-08
**Status**: Design Specification

---

## Overview

`byMyRatings` is a new method on `RatingService` that lets users browse and search their personal rating history. Unlike `byRating` (which sorts a feed by community aggregate quality), `byMyRatings` answers: "What have *I* rated, and how did *I* rate it?"

The feature is Firestore-first: it reads the user's rating docs from the `user_ratings/{userId}/ratings` subcollection (already populated by the dual-write in `RatingService.rate()`), then hydrates the corresponding Memory objects from Weaviate. It supports scoping by collection type (personal, spaces, groups), filtering by star value, two sort options (by personal rating or by when rated), and hybrid search within the rated set.

This is also the first endpoint to use the new `{ memory, metadata }` response envelope pattern, which will be migrated to all other `by*` modes in a separate milestone.

---

## Problem Statement

- **No "my ratings" view**: Users can rate memories but have no way to browse what they've rated. There's no endpoint that answers "show me everything I've rated 5 stars" or "what did I rate recently?"
- **Ratings are write-only from the user's perspective**: The `rate()` and `getUserRating()` methods exist, but only operate on a single memory at a time. No batch/list capability.
- **Scoping gap**: A user rating memories across personal, group, and space collections has no way to see their ratings filtered by context (e.g., "my ratings in this space").
- **Response shape limitation**: Existing `by*` modes return flat `memories[]` arrays with no room for per-item metadata (like the user's personal rating value). A richer envelope is needed.

---

## Solution

### High-Level Approach

1. **Firestore-first**: Read the user's rating docs from `getUserRatingsPath(userId)` using cursor-based pagination
2. **Scope filter**: Filter by `collectionName` stored on each rating doc (matching personal/space/group patterns)
3. **Star filter**: Filter by personal rating value range
4. **Sort**: By personal rating value or by `updated_at` (when rated), in-memory on the Firestore results
5. **Hydrate**: Batch-fetch the page of Memory objects from Weaviate by UUID
6. **Search mode**: When a query is provided, run hybrid search on relevant collections, then intersect with rated ID set

### Response Envelope

`byMyRatings` introduces the `{ memory, metadata }` pattern:

```typescript
interface MyRatingsResult {
  items: Array<{
    memory: Record<string, unknown>;
    metadata: MyRatingMetadata;
  }>;
  total: number;
  offset: number;
  limit: number;
}

interface MyRatingMetadata {
  my_rating: number;        // 1-5, user's personal rating
  rated_at: string;         // ISO timestamp (rating doc updated_at)
  deleted?: boolean;        // true if memory is soft-deleted
  unavailable?: boolean;    // true if memory can't be hydrated from Weaviate
}
```

Other `by*` modes will be migrated to this envelope in a separate milestone (see Future Considerations).

---

## Implementation

### Input Type

```typescript
interface MyRatingsRequest {
  userId: string;
  spaces?: string[];          // space collection IDs to filter by
  groups?: string[];          // group collection IDs to filter by
  // If both empty/omitted: scope is "all" (default)
  // If only spaces provided: only space-scoped ratings
  // If only groups provided: only group-scoped ratings
  // If both provided: ratings from those spaces + groups

  rating_filter?: {
    min?: number;             // 1-5, default 1
    max?: number;             // 1-5, default 5
  };

  sort_by?: 'rating' | 'rated_at';  // default: 'rated_at'
  direction?: 'desc' | 'asc';       // default: 'desc'
  query?: string;                     // text search within rated set
  limit?: number;                     // default: 50
  offset?: number;                    // default: 0
}
```

### Firestore Rating Doc Schema Update

The existing user-rating doc at `getUserRatingsPath(userId)/{memoryId}` currently stores:

```typescript
{ rating: number, created_at: string, updated_at: string, memoryId: string }
```

Add `collectionName`:

```typescript
{
  rating: number,
  created_at: string,
  updated_at: string,
  memoryId: string,
  collectionName: string,   // NEW — Weaviate collection name
}
```

This requires:
1. Update `RatingService.rate()` to resolve and write `collectionName` (it already resolves collection via `MemoryIndexService.lookup()`)
2. Backfill script for existing rating docs (read memoryId → lookup collection → update doc)

### Flow: Browse Mode (No Query)

```
1. queryDocuments(getUserRatingsPath(userId), {
     orderBy: [{ field: sort_field, direction }],
     limit: limit + offset,
   })
2. Filter by scope (collectionName matching spaces/groups arrays)
3. Filter by rating_filter (min/max)
4. Slice [offset, offset+limit] → page of rating docs
5. Batch-fetch Memory objects from Weaviate by UUID
   (group by collectionName for efficient per-collection fetches)
6. Build response: { memory, metadata } per item
   - If Weaviate fetch fails for a UUID: return stub with unavailable: true
   - If memory is soft-deleted: include with deleted: true in metadata
```

**Firestore sort fields**:
- `sort_by: 'rated_at'` → `orderBy: 'updated_at'`
- `sort_by: 'rating'` → `orderBy: 'rating'`

Both are top-level fields on the rating doc, so Firestore can sort natively. Composite index needed for `rating` + `updated_at` if we want secondary sort.

### Flow: Search Mode (With Query)

```
1. queryDocuments(getUserRatingsPath(userId)) → all rating docs
2. Filter by scope (collectionName) and rating_filter
3. Collect rated memory IDs, grouped by collectionName
4. For each relevant collection:
   - Run hybrid search with query text
   - Intersect results with rated IDs for that collection
5. Merge intersected results across collections
6. Apply offset/limit to merged results
7. Attach metadata (my_rating, rated_at) from rating docs
8. Build response
```

In search mode, Weaviate provides the relevance ranking. The Firestore rating docs provide the metadata overlay.

**Note**: Search mode fetches all rating docs (no cursor pagination on Firestore side) because we need the full rated ID set for intersection. This is acceptable because:
- Users with <1000 ratings: fast Firestore read (~100-200ms)
- The Weaviate hybrid search handles the heavy relevance computation
- Pagination applies to the final intersected result, not the Firestore read

### Unavailable Memory Handling

If a rated memory can't be hydrated from Weaviate (deleted collection, data loss, etc.):

```typescript
{
  memory: { id: "abc-123" },
  metadata: {
    my_rating: 4,
    rated_at: "2026-03-01T...",
    unavailable: true
  }
}
```

The frontend renders "Memory unavailable" with the rating still visible.

### RatingService Changes

```typescript
// New method on RatingService
async byMyRatings(input: MyRatingsRequest): Promise<MyRatingsResult> { ... }

// Updated rate() method — add collectionName to dual-write
async rate(input: RateMemoryInput): Promise<RatingResult> {
  // ... existing logic ...
  // Dual-write: user-centric index (UPDATED — add collectionName)
  const userRatingsPath = getUserRatingsPath(userId);
  await setDocument(userRatingsPath, memoryId, {
    ...ratingDoc,
    memoryId,
    collectionName,  // NEW
  } as any);
}
```

### API Surface

| Layer | Method |
|-------|--------|
| RatingService | `byMyRatings(input: MyRatingsRequest): Promise<MyRatingsResult>` |
| REST | `POST /api/svc/v1/memories/by-my-ratings` |
| SVC Client | `client.memories.byMyRatings(userId, input)` |

---

## Benefits

- **Personal rating history**: Users can browse everything they've rated, sorted and filtered by their own ratings
- **Scoped browsing**: Filter ratings by space, group, or personal collection — enables "my ratings in this space" views
- **Star filtering**: "Show me my 5-star picks" or "what did I rate poorly?" — trivial with `rating_filter`
- **Search within ratings**: Hybrid search intersected with rated set — "find that poem I loved" without remembering which collection it's in
- **Response envelope**: `{ memory, metadata }` pattern is extensible and sets the standard for future endpoint migration
- **Firestore-native pagination**: Cursor-based pagination scales with rating volume

---

## Trade-offs

- **Firestore read on every request**: No caching for MVP. A user with 500 ratings reads 500 Firestore docs per request. At <200ms this is acceptable; caching can be added later without API changes.
- **Schema addition on rating doc**: Adding `collectionName` requires a backfill for existing ratings. Mitigated by the backfill being a simple script (read memoryId → MemoryIndexService.lookup → update doc).
- **Search mode reads all rating docs**: No cursor pagination in search mode because we need the full rated ID set for intersection. Acceptable for <1000 ratings.
- **Different response shape**: `byMyRatings` returns `{ items: [{ memory, metadata }] }` while other modes return `{ memories: [] }`. This inconsistency is temporary — other modes will be migrated in a future milestone.
- **Cross-collection queries**: Search mode runs hybrid search on multiple Weaviate collections in parallel. For users who rated across 10+ collections, this is 10+ parallel queries. Mitigated by scope filtering (spaces/groups arrays narrow the collection set).

---

## Dependencies

- **RatingService** (M20, complete): Already has `WeaviateClient`, `MemoryIndexService`, Firestore rating dual-write
- **MemoryIndexService** (M18, complete): UUID → collection resolution for backfill
- **`queryDocuments`** from firebase-admin-sdk-v8: Cursor-based Firestore pagination (`orderBy`, `startAfter`, `limit`)
- **`fetchMemoryWithAllProperties`** from Weaviate client: Batch memory hydration

---

## Testing Strategy

- **Unit tests** (colocated `.spec.ts`):
  - Browse mode: sort by rating, sort by rated_at, asc/desc, pagination (offset/limit)
  - Scope filtering: personal only, specific space, specific group, multiple spaces+groups, all (default)
  - Star filter: exact (5,5), range (3,5), low (1,2), no filter
  - Search mode: query intersects with rated set, relevance ordering preserved
  - Unavailable memories: stub with `unavailable: true` when Weaviate fetch fails
  - Deleted memories: included with `deleted: true` metadata
  - Empty results: user has no ratings
  - Rating doc without collectionName: graceful handling (skip or lookup)
- **Backfill test**: Verify backfill script correctly resolves and writes collectionName
- **SVC client test**: Mock HTTP, verify correct URL/method/body
- **Integration test**: Rate memories across collections, verify byMyRatings returns correct scoped results

---

## Migration Path

1. **Update rating doc schema**: Add `collectionName` to dual-write in `RatingService.rate()`
2. **Backfill script**: Read all user-rating docs, resolve collection via MemoryIndexService, update docs
3. **Implement `byMyRatings`**: New method on RatingService with browse + search modes
4. **Types**: Add `MyRatingsRequest`, `MyRatingsResult`, `MyRatingMetadata` to `rating.types.ts`
5. **OpenAPI spec**: Add `POST /api/svc/v1/memories/by-my-ratings` endpoint
6. **SVC client**: Add `byMyRatings` to MemoriesResource
7. **Export**: Update barrel exports

---

## Key Design Decisions

### Scope & Filtering

| Decision | Choice | Rationale |
|---|---|---|
| Scope parameter | `spaces: string[], groups: string[]` arrays | Future-proof for multi-scope queries; empty = all |
| Default scope | `all` (empty arrays) | Most common use case is "everything I've rated" |
| Collection resolution | Store `collectionName` on rating doc (option A) | O(1) scope filtering at query time vs O(N) lookups |
| Star filter | `rating_filter: { min, max }` in MVP | Nearly free — in-memory filter on Firestore results already loaded |

### Sorting

| Decision | Choice | Rationale |
|---|---|---|
| Sort options | `by_rating` and `by_rated_at` | Covers both "my best picks" and "recently rated" views |
| Default sort | `by_rated_at` desc | Most useful default — "what did I rate recently?" |
| Rating sort basis | User's personal rating, not aggregate `rating_bayesian` | This is "my ratings" — personal value is the point |

### Search

| Decision | Choice | Rationale |
|---|---|---|
| Query strategy | Hybrid search on collections, intersect with rated IDs (option B) | Best relevance ranking; two queries but both are fast |
| Pagination in search mode | On final intersected result | Firestore read is unbounded in search mode; pagination applies after intersection |

### Response & API

| Decision | Choice | Rationale |
|---|---|---|
| Response shape | `{ memory, metadata }` envelope (new pattern) | Extensible; carries per-item context (rating, rated_at, deleted, unavailable) |
| Existing endpoint migration | Separate future milestone (option A) | byMyRatings ships with new pattern; others migrate later |
| Service home | `RatingService.byMyRatings()` | RatingService owns Firestore ratings and already has WeaviateClient + MemoryIndexService |
| REST endpoint | `POST /api/svc/v1/memories/by-my-ratings` | Consistent with `by-rating`, `by-discovery`, etc. |

### Performance & Edge Cases

| Decision | Choice | Rationale |
|---|---|---|
| Caching | Skip for MVP | <200ms Firestore reads for <500 ratings; add TTL cache later if needed |
| Pagination | Firestore cursor-based (`orderBy` + `startAfter` + `limit`) | Design for scale from the start per user request |
| Deleted memories | Include with `deleted: true` metadata | Users want full rating history |
| Inaccessible memories | Stub with `unavailable: true` metadata | Rating data preserved; frontend renders "unavailable" widget |

---

## Future Considerations

- **Response envelope migration** (separate milestone): Migrate all `by*` modes (`byRating`, `byDiscovery`, `byCurated`, etc.) from `{ memories: [] }` to `{ items: [{ memory, metadata }] }`. Breaking API change requiring version bump. Each mode would define its own metadata type (e.g., `byCurated` adds `curated_score` + `curated_breakdown`).
- **Firestore cursor-based pagination for search mode**: Currently search mode reads all rating docs. If users accumulate 5000+ ratings, add cursor pagination with ID-set chunking.
- **TTL cache on rating docs**: In-memory cache with invalidation on `rate()`/`retract()` if Firestore read latency becomes an issue.
- **"Rated by others" view**: Show memories the user authored that have been rated by others (author's perspective on community feedback). Different query — reads `memory_ratings/{memoryId}` not `user_ratings/{userId}`.
- **Rating analytics**: Aggregate stats — "you've rated 347 memories, average rating 3.8, most-rated space: Poetry"

---

**Status**: Design Specification
**Recommendation**: Implement as M37 milestone in remember-core. Also create a tracked future milestone (M38) for response envelope migration across all `by*` endpoints.
**Clarifications**: 22, 23
**Related Documents**:
- `agent/design/local.memory-ratings.md` (rating system foundation)
- `agent/design/local.by-discovery-sort-mode.md` (sibling sort mode)
- `agent/milestones/milestone-20-memory-ratings-system.md` (RatingService, M20)
- `agent/clarifications/clarification-22-by-my-ratings-sort-mode.md`
- `agent/clarifications/clarification-23-by-my-ratings-followup.md`
