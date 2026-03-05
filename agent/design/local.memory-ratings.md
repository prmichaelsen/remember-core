# Memory Ratings System

**Concept**: 1-5 star rating system on memories for backend quality ranking, with Bayesian aggregation and a byRating sort mode
**Created**: 2026-03-05
**Status**: Design Specification

---

## Overview

A rating system that lets authenticated users rate memories on a 1-5 star scale. Ratings serve as a backend quality signal for ranking — not a user-facing clout system. Aggregate ratings are never displayed to users who don't own the memory. The system enables a `byRating` sort mode that uses Bayesian averaging to fairly rank memories regardless of how many ratings they have.

This is the "Phase 2" feature referenced in milestone-11 (Basic Sort Modes) under "User ratings and reputation system".

---

## Problem Statement

- **No quality signal**: Currently, sort modes (Smart, Time, Density) have no way to distinguish high-quality memories from low-quality ones. A one-line throwaway memory ranks equally with a well-crafted, useful one.
- **Cold start for new content**: Engagement-based algorithms (views, clicks) can't evaluate content that hasn't been seen yet. Explicit ratings from users who encounter memories provide a quality signal independent of virality.
- **Foundation for future ranking**: Advanced sort modes (byDiscovery, byRecommendation) need a quality signal to build on. Ratings provide that foundation.

---

## Solution

### High-Level Approach

1. Users rate memories 1-5 stars (one rating per user per memory)
2. Individual ratings stored in Firestore (for change/retract support)
3. Aggregate fields denormalized on Memory object in Weaviate (for sort performance)
4. Pre-computed Bayesian score enables Weaviate native sort
5. New `byRating` sort mode on MemoryService
6. REST endpoints + SVC client methods for rating operations

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scale | 1-5 stars | Familiar, granular enough, integer arithmetic |
| Self-rating | Prohibited | Authors shouldn't inflate their own content |
| Access | ACL-gated | If you can see it, you can rate it |
| Ghosts | Cannot rate | Ghosts have no agency |
| Weighting | None (MVP) | Future reputation scheme, not trust-based |
| Mutability | Change + retract | Both feasible with sum/count storage |
| Bayesian avg | In MVP | Nearly free — pre-computed from existing fields |
| Min threshold | 5 ratings | Below threshold, avg is null in API responses |
| Purpose | Backend quality signal | Not displayed as clout to other users |
| Trust effect | None | Trust system is orthogonal to ratings |

### Alternative Approaches Considered

1. **Binary thumbs up/down**: Simpler but too coarse — can't distinguish "okay" from "great".
2. **0.0-1.0 continuous**: Most flexible but hardest to present in any UI, unfamiliar to users.
3. **Trust-weighted ratings**: Rejected for MVP — requires the reputation scheme which is not yet designed. The storage format (sum + count) trivially extends to weighted sums later.
4. **Store rating_avg instead of rating_sum**: Rejected — floating-point drift over many updates. Integer sum + count is exact and extends to weighted.

---

## Implementation

### Schema — Weaviate (Memory Object)

Three new properties added to `COMMON_MEMORY_PROPERTIES`:

```typescript
// Added to Memory interface in memory.types.ts
rating_sum: number;       // INT — cumulative sum of all 1-5 ratings
rating_count: number;     // INT — number of ratings received
rating_bayesian: number;  // NUMBER — pre-computed (rating_sum + 15) / (rating_count + 5)
```

Derived (not stored in Weaviate, computed by MemoryService):
```typescript
rating_avg: number | null;  // rating_count >= 5 ? rating_sum / rating_count : null
```

Bayesian formula uses constant priors:
- `prior_avg` = 3.0 (midpoint of 1-5 scale)
- `prior_count` = 5 (matches min threshold)
- `rating_bayesian = (rating_sum + 3.0 * 5) / (rating_count + 5)`

New memories initialize with `rating_sum: 0, rating_count: 0, rating_bayesian: 0.6` (the Bayesian score of zero real ratings: `15/5 = 3.0` — wait, `(0 + 15) / (0 + 5) = 3.0`).

### Schema — Firestore (Individual Ratings)

```typescript
// Firestore: {prefix}/memory_ratings/{memoryUuid}/ratings/{raterUserId}
interface MemoryRating {
  rating: number;       // 1-5
  created_at: string;   // ISO 8601
  updated_at: string;   // ISO 8601
}
```

Document ID = rater's userId — enforces one rating per user per memory.

### RatingService

New service following existing DI pattern:

```typescript
interface RateMemoryInput {
  memoryId: string;       // Weaviate UUID
  userId: string;         // rater's user ID
  rating: number;         // 1-5
  collectionName: string; // Weaviate collection (TODO: use memory-index-lookup)
}

interface RatingResult {
  previousRating: number | null;
  newRating: number;
  ratingCount: number;
  ratingAvg: number | null;
}

class RatingService {
  constructor(params: {
    weaviateClient: WeaviateClient;
    firestore: Firestore;
    firestorePrefix: string;
    logger?: Logger;
  }) {}

  /**
   * Submit or update a rating. Idempotent upsert.
   * 1. Read existing Firestore rating (if any)
   * 2. Write/update Firestore rating doc
   * 3. Update Weaviate aggregates:
   *    - If new: sum += rating, count += 1
   *    - If change: sum += (newRating - oldRating), count unchanged
   * 4. Recompute rating_bayesian
   */
  async rate(input: RateMemoryInput): Promise<RatingResult>;

  /**
   * Retract a rating entirely.
   * 1. Read existing Firestore rating (must exist)
   * 2. Delete Firestore rating doc
   * 3. Update Weaviate: sum -= oldRating, count -= 1
   * 4. Recompute rating_bayesian
   */
  async retract(memoryId: string, userId: string, collectionName: string): Promise<void>;

  /**
   * Get the current user's rating for a memory.
   */
  async getUserRating(memoryId: string, userId: string): Promise<MemoryRating | null>;
}
```

### Aggregate Update Logic

**Rate (new)**:
```
rating_sum += rating
rating_count += 1
rating_bayesian = (rating_sum + 15) / (rating_count + 5)
```

**Rate (change)**:
```
rating_sum += (new_rating - old_rating)
// rating_count unchanged
rating_bayesian = (rating_sum + 15) / (rating_count + 5)
```

**Retract**:
```
rating_sum -= old_rating
rating_count -= 1
rating_bayesian = (rating_sum + 15) / (rating_count + 5)
```

### byRating Sort Mode

New method on MemoryService, same pattern as `byTime` and `byDensity`:

```typescript
interface RatingModeRequest {
  collectionName: string;
  direction?: 'desc' | 'asc';  // default: desc
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
}

interface RatingModeResult {
  memories: Memory[];
  total: number;
}
```

Uses Weaviate native sort by `rating_bayesian`:
```typescript
collection.query.fetchObjects({
  sort: collection.sort.byProperty('rating_bayesian', 'desc'),
  limit,
  offset,
  filters: buildFilters(filters),
});
```

Unrated memories (rating_bayesian = 3.0, the prior mean) naturally sort in the middle. Memories with count < 5 have their Bayesian score dominated by the prior, pulling them toward 3.0. High-rated memories with many ratings rise above; poorly-rated memories sink below.

### REST API

```
PUT    /api/svc/v1/memories/:id/rating   — body: { rating: 1-5 }
DELETE /api/svc/v1/memories/:id/rating
GET    /api/svc/v1/memories/:id/rating   — returns { rating } or 404
```

Singular `/rating` — always the current user's single rating. Aggregate data (`rating_avg`, `rating_count`) returned on the Memory object in all responses.

### SVC Client SDK

Methods on existing `MemoriesResource`:

```typescript
// client.memories.rate(memoryId, rating)
async rate(memoryId: string, rating: number): Promise<SdkResponse<void>>;

// client.memories.retractRating(memoryId)
async retractRating(memoryId: string): Promise<SdkResponse<void>>;

// client.memories.getMyRating(memoryId)
async getMyRating(memoryId: string): Promise<SdkResponse<{ rating: number }>>;
```

No App Client compound operations for MVP.

### Validation Rules

- `rating` must be integer 1-5 (reject 0, decimals, out of range)
- Author cannot rate own memory (check `memory.author === userId`, reject with 403)
- Ghost-mode users cannot rate (reject if ghost context active)
- User must have ACL access to the memory (existing ACL check)

---

## Benefits

- **Quality signal**: First mechanism to distinguish good content from noise
- **Fair ranking**: Bayesian average prevents gaming by single ratings
- **Foundation**: Enables future byDiscovery and byRecommendation sort modes
- **Minimal schema**: Two integer fields + one float, no migrations needed
- **Consistent pattern**: Follows relationship_count denormalization pattern
- **Extends to weighted**: Sum + count storage trivially becomes weighted_sum + total_weight

---

## Trade-offs

- **Extra Firestore writes**: One Firestore write per rating + one Weaviate update. At Remember's scale, negligible.
- **Consistency gap**: If Weaviate update succeeds but Firestore write fails (or vice versa), aggregates may be temporarily inconsistent. Mitigated by write ordering (Firestore first, then Weaviate) and eventual consistency via periodic reconciliation (future).
- **Bayesian constant prior**: Using 3.0 instead of actual global average means the prior is approximate. Sufficient for MVP; dynamic prior is a future enhancement.
- **No weighting**: All ratings carry equal weight regardless of rater quality. Acceptable for MVP; reputation-based weighting is a future feature.
- **Collection resolution**: RatingService needs to know which Weaviate collection the memory lives in. Depends on memory-index-lookup (in flight). Temporary workaround: caller passes `collectionName`.

---

## Dependencies

- **Weaviate**: Schema update (3 new properties on Memory collections)
- **Firestore**: New `memory_ratings` collection
- **Memory-index-lookup** (in flight): For collection resolution in RatingService
- **Existing services**: MemoryService (for byRating sort mode), ACL checks (for access gating)

---

## Testing Strategy

- **Unit tests (RatingService)**: rate new, rate change, retract, validation (1-5 range, self-rate rejection, ghost rejection), aggregate math correctness
- **Unit tests (byRating sort)**: Weaviate mock with sort by `rating_bayesian`, below-threshold behavior, pagination
- **Aggregate math tests**: Verify sum/count/bayesian after sequences of rate/change/retract operations, edge cases (retract last rating, rate after retract)
- **SVC client tests**: Colocated `.spec.ts` for `rate()`, `retractRating()`, `getMyRating()` methods

---

## Migration Path

1. **Add Weaviate properties**: `rating_sum` (INT, default 0), `rating_count` (INT, default 0), `rating_bayesian` (NUMBER, default 3.0) via existing "add property if missing" pattern in collection initialization. No backfill needed.
2. **Add RatingService**: New service, no changes to existing services.
3. **Add byRating to MemoryService**: New method, no changes to existing methods.
4. **Add REST endpoints**: New routes, no changes to existing routes.
5. **Add SVC client methods**: New methods on MemoriesResource, no breaking changes.
6. **Update OpenAPI spec**: New rating schemas + endpoints + Memory schema update.

---

## Future Considerations

- **Weighted ratings (reputation scheme)**: Replace equal-weight ratings with reputation-based weights. Storage extends naturally: `rating_sum` becomes `rating_weighted_sum`, `rating_count` becomes `rating_total_weight`. Requires designing the reputation system first.
- **Rating moderation**: Allow moderators to remove/override abusive ratings. Separate from existing memory moderation.
- **Dynamic Bayesian prior**: Replace constant 3.0 with computed global average. Requires periodic job to scan all rated memories and update `prior_avg`. When prior changes, all `rating_bayesian` values need backfill.
- **Combined sort modes (byPopularity)**: Factor in both rating and density (relationship count) for a combined quality score.
- **byDiscovery sort mode**: Algorithmic interleaving of unrated/underrated memories with high-rated ones to help new content gain traction. Requires its own design doc.
- **byRecommendation sort mode**: Personalized vector search based on user's rating history. Surfaces content similar to what a user has rated highly, regardless of engagement. Similar to SoundCloud Boost. Requires user rating history analysis + vector search orchestration. Requires its own design doc.

---

**Status**: Design Specification
**Recommendation**: Implement as a new milestone (M18). Low risk, additive changes only, no migrations.
**Related Documents**:
- `agent/clarifications/clarification-8-memory-ratings-system.md`
- `agent/clarifications/clarification-9-memory-ratings-followup.md`
- `agent/clarifications/clarification-10-memory-ratings-final-summary.md`
- `agent/milestones/milestone-11-basic-sort-modes.md` (Phase 2 reference)
- `agent/design/local.memory-index-lookup.md` (dependency for collection resolution)
