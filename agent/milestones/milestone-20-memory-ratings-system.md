# Milestone 20: Memory Ratings System

**Goal**: Add 1-5 star rating system on memories with Bayesian aggregation and byRating sort mode
**Duration**: 1-2 weeks
**Dependencies**: M18 (Memory Index Lookup), M11 (Basic Sort Modes)
**Status**: Not Started

---

## Overview

A rating system that lets authenticated users rate memories on a 1-5 star scale. Ratings serve as a backend quality signal for ranking — not a user-facing clout system. Aggregate ratings are never displayed to users who don't own the memory. The system enables a `byRating` sort mode that uses Bayesian averaging to fairly rank memories regardless of how many ratings they have.

This is the "Phase 2" feature referenced in milestone-11 (Basic Sort Modes) under "User ratings and reputation system".

**Design Doc**: [agent/design/local.memory-ratings.md](../design/local.memory-ratings.md)
**Clarifications**: clarification-8, clarification-9, clarification-10

---

## Deliverables

### 1. Weaviate Schema Update
- `rating_sum` (INT) — cumulative sum of all 1-5 ratings
- `rating_count` (INT) — number of ratings received
- `rating_bayesian` (NUMBER) — pre-computed `(rating_sum + 15) / (rating_count + 5)`
- New memories default: `rating_sum: 0, rating_count: 0, rating_bayesian: 3.0`

### 2. RatingService
- `rate()` — submit or update a rating (idempotent upsert)
- `retract()` — remove a rating entirely
- `getUserRating()` — get current user's rating for a memory
- Individual ratings stored in Firestore (`memory_ratings/{uuid}/ratings/{userId}`)
- Aggregate updates on Weaviate Memory object

### 3. byRating Sort Mode
- New `byRating()` method on MemoryService
- Weaviate native sort by `rating_bayesian`
- Unrated memories (Bayesian = 3.0) sort in middle
- Supports pagination and standard filters

### 4. REST API + SVC Client
- `PUT /api/svc/v1/memories/:id/rating` — rate/update
- `DELETE /api/svc/v1/memories/:id/rating` — retract
- `GET /api/svc/v1/memories/:id/rating` — get my rating
- SVC client: `memories.rate()`, `.retractRating()`, `.getMyRating()`

### 5. OpenAPI Spec + Type Generation
- Rating schemas in OpenAPI spec
- Memory schema updated with aggregate fields
- Regenerated SVC client types

---

## Success Criteria

- [ ] RatingService rate/change/retract all work correctly
- [ ] Weaviate aggregates (sum, count, bayesian) update atomically
- [ ] Self-rating prevented (author cannot rate own memory)
- [ ] Ghost-mode users cannot rate
- [ ] byRating sort mode returns memories ordered by Bayesian score
- [ ] REST endpoints return correct status codes (200, 403, 404)
- [ ] SVC client methods type-safe and functional
- [ ] OpenAPI spec complete and types regenerated
- [ ] All unit tests pass
- [ ] `tsc --noEmit` clean
- [ ] Existing 726 tests unaffected

---

## Key Files to Create

```
src/
  services/
    rating.service.ts
    rating.service.spec.ts
  types/
    rating.types.ts
docs/
  openapi.yaml (update)
```

---

## Tasks

1. [Task 104: Weaviate Schema — Rating Properties](../tasks/milestone-20-memory-ratings-system/task-104-weaviate-schema-rating-properties.md) — Add 3 new Memory properties
2. [Task 105: RatingService](../tasks/milestone-20-memory-ratings-system/task-105-rating-service.md) — Core rate/retract/getUserRating logic
3. [Task 106: byRating Sort Mode](../tasks/milestone-20-memory-ratings-system/task-106-byrating-sort-mode.md) — MemoryService sort by Bayesian score
4. [Task 107: REST Endpoints](../tasks/milestone-20-memory-ratings-system/task-107-rest-endpoints.md) — PUT/DELETE/GET rating routes
5. [Task 108: SVC Client + OpenAPI Spec](../tasks/milestone-20-memory-ratings-system/task-108-svc-client-openapi-spec.md) — SDK methods and type generation
6. [Task 109: Unit Tests](../tasks/milestone-20-memory-ratings-system/task-109-unit-tests.md) — Comprehensive test coverage
7. [Task 110: Documentation](../tasks/milestone-20-memory-ratings-system/task-110-documentation.md) — CHANGELOG, README, migration guide

---

## Testing Requirements

- [ ] RatingService unit tests: rate new, rate change, retract, validation (1-5 range, self-rate rejection, ghost rejection), aggregate math
- [ ] byRating sort tests: Weaviate mock with sort by rating_bayesian, pagination, below-threshold behavior
- [ ] Aggregate math tests: verify sum/count/bayesian after rate/change/retract sequences
- [ ] SVC client tests: colocated .spec.ts for rate(), retractRating(), getMyRating()

---

## Documentation Requirements

- [ ] CHANGELOG entry for new version
- [ ] README updated with rating service section
- [ ] Migration guide updated with rating endpoints
- [ ] OpenAPI spec updated with rating schemas

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Firestore/Weaviate consistency gap | Medium | Low | Write Firestore first, then Weaviate; eventual consistency acceptable |
| Self-rating bypass | Medium | Low | Server-side validation in RatingService, not just REST layer |

---

**Next Milestone**: TBD
**Blockers**: None — all dependencies (M18, M11) are complete
**Notes**: Additive changes only — no breaking changes, no migrations needed
