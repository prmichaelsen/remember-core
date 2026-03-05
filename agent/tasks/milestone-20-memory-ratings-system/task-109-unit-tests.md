# Task 109: Unit Tests

**Milestone**: [M20 - Memory Ratings System](../../milestones/milestone-20-memory-ratings-system.md)
**Estimated Time**: 3-4 hours
**Dependencies**: [Task 105](task-105-rating-service.md), [Task 106](task-106-byrating-sort-mode.md), [Task 108](task-108-svc-client-openapi-spec.md)
**Status**: Not Started

---

## Objective

Write comprehensive colocated unit tests for RatingService, byRating sort mode, and SVC client rating methods.

---

## Context

Tests are colocated with source files using `.spec.ts` suffix. Never use `__tests__/` directories. Mock Weaviate and Firestore following existing patterns in the codebase.

---

## Steps

### 1. RatingService Tests

Create `src/services/rating.service.spec.ts`:

- **rate (new)**: Creates Firestore doc, updates Weaviate aggregates (sum, count, bayesian)
- **rate (change)**: Updates existing rating, correct delta on sum, count unchanged
- **retract**: Removes Firestore doc, decrements aggregates
- **getUserRating**: Returns rating or null
- **validation**: Rejects rating outside 1-5 (0, 6, 1.5, negative)
- **self-rate rejection**: Rejects when userId === memory author
- **ghost rejection**: Rejects when ghost context active
- **aggregate math**: Verify sum/count/bayesian after sequences:
  - rate(3) → rate(5) → retract → rate(1) (multi-step)
  - retract last rating (count goes to 0, bayesian resets to 3.0)
- **collection resolution**: Uses MemoryIndexService.lookup()

### 2. byRating Sort Tests

Add to `src/services/memory.service.spec.ts` (or colocated with sort methods):

- Sort descending returns highest bayesian first
- Sort ascending returns lowest bayesian first
- Pagination (limit/offset)
- Filters apply correctly
- `rating_avg` computed (null when count < 5, correct value when >= 5)

### 3. SVC Client Rating Tests

Add to `src/clients/svc/v1/memories.spec.ts`:

- `rate()` sends correct PUT request
- `retractRating()` sends correct DELETE request
- `getMyRating()` sends correct GET request
- Error responses mapped to SdkResponse

---

## Verification

- [ ] RatingService tests cover rate/change/retract/validation/rejection
- [ ] Aggregate math verified across multi-step sequences
- [ ] byRating sort tests cover desc/asc/pagination/filters
- [ ] SVC client tests cover all 3 new methods
- [ ] All tests colocated (`.spec.ts` next to source)
- [ ] All existing tests still pass
- [ ] `npx jest --config config/jest.config.js` passes

---

**Next Task**: [Task 110: Documentation](task-110-documentation.md)
**Related Design Docs**: [agent/design/local.memory-ratings.md](../../design/local.memory-ratings.md)
