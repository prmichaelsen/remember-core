# Milestone 37: byMyRatings Sort Mode

**Goal**: Personal rating history browser on RatingService — browse and search memories a user has rated, with collection scoping, star filtering, and the new `{ memory, metadata }` response envelope
**Duration**: 1-2 weeks
**Dependencies**: M20 (Memory Ratings), M18 (Memory Index Lookup)
**Status**: Not Started
**Design Reference**: [byMyRatings Sort Mode](../design/local.by-my-ratings-sort-mode.md)

---

## Overview

Add a `byMyRatings()` method to `RatingService` that lets users browse and search their personal rating history. Unlike `byRating` (community aggregate sort), `byMyRatings` answers "What have I rated, and how did I rate it?"

The feature is Firestore-first: reads the user's rating docs from `user_ratings/{userId}/ratings`, filters by scope/star value, paginates via Firestore cursors, then hydrates Memory objects from Weaviate. Supports hybrid search within the rated set.

This is also the first endpoint to use the `{ memory, metadata }` response envelope pattern.

---

## Deliverables

### 1. Rating Doc Schema Update
- Add `collectionName` to user-rating doc dual-write in `RatingService.rate()`
- Backfill script for existing rating docs

### 2. byMyRatings Method
- `RatingService.byMyRatings(input: MyRatingsRequest): Promise<MyRatingsResult>`
- Browse mode: Firestore cursor pagination → scope/star filter → Weaviate hydration
- Search mode: hybrid search on relevant collections → intersect with rated IDs

### 3. Types
- `MyRatingsRequest`, `MyRatingsResult`, `MyRatingMetadata` in `rating.types.ts`

### 4. API + Client
- OpenAPI spec: `POST /api/svc/v1/memories/by-my-ratings`
- SVC client: `client.memories.byMyRatings(userId, input)`

### 5. Tests
- Unit tests for byMyRatings (browse, search, scope, star filter, edge cases)
- SVC client test

---

## Success Criteria

- [ ] `RatingService.rate()` writes `collectionName` to user-rating doc
- [ ] Backfill script resolves and writes collectionName for existing rating docs
- [ ] `byMyRatings` browse mode returns paginated rated memories sorted by rating or rated_at
- [ ] `byMyRatings` scope filtering works (personal, spaces, groups, all)
- [ ] `byMyRatings` star filter works (min/max rating range)
- [ ] `byMyRatings` search mode intersects hybrid search results with rated ID set
- [ ] Response uses `{ memory, metadata }` envelope with my_rating, rated_at, deleted, unavailable
- [ ] Unavailable memories return stubs with `unavailable: true`
- [ ] SVC client `byMyRatings` method works
- [ ] All new tests pass, existing tests unbroken

---

## Key Files to Create/Modify

```
src/
├── types/
│   └── rating.types.ts              # ADD MyRatingsRequest, MyRatingsResult, MyRatingMetadata
├── services/
│   ├── rating.service.ts            # ADD byMyRatings(), UPDATE rate() dual-write
│   └── rating.service.spec.ts       # ADD byMyRatings tests
├── clients/
│   └── svc/v1/
│       ├── memories.ts              # ADD byMyRatings method
│       └── memories.spec.ts         # ADD byMyRatings test
scripts/
└── migrations/
    └── backfill-rating-collection-name.ts  # NEW backfill script
docs/
└── openapi.yaml                     # ADD by-my-ratings endpoint
```

---

## Tasks

| Task | Name | Est. Hours |
|------|------|-----------|
| 185 | Rating Doc Schema Update + Backfill | 2 |
| 186 | MyRatings Types + Browse Mode | 4 |
| 187 | Search Mode (Hybrid Intersection) | 3 |
| 188 | Edge Cases (Unavailable, Deleted, Empty) | 2 |
| 189 | OpenAPI Spec + SVC Client | 2 |
| 190 | Unit Tests | 3 |

---

## Testing Requirements

- [ ] Browse mode: sort by rating, sort by rated_at, asc/desc, pagination
- [ ] Scope filtering: personal, specific space, specific group, multiple, all
- [ ] Star filter: exact, range, low, none
- [ ] Search mode: query intersects with rated set, relevance ordering
- [ ] Unavailable memories: stub with unavailable: true
- [ ] Deleted memories: included with deleted: true
- [ ] Empty results: user has no ratings
- [ ] SVC client: correct URL/method/body

---

**Next Milestone**: M38 — Response Envelope Migration
**Blockers**: None
**Notes**: First endpoint to use `{ memory, metadata }` response envelope. M38 will migrate other `by*` modes to this pattern.
