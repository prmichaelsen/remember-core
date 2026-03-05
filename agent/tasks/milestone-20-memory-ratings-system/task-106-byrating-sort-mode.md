# Task 106: byRating Sort Mode

**Milestone**: [M20 - Memory Ratings System](../../milestones/milestone-20-memory-ratings-system.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 104](task-104-weaviate-schema-rating-properties.md)
**Status**: Not Started

---

## Objective

Add `byRating()` method to MemoryService that sorts memories by Bayesian average score using Weaviate native sort, following the same pattern as `byTime()` and `byDensity()`.

---

## Context

The byRating sort mode uses the pre-computed `rating_bayesian` field stored in Weaviate. This avoids runtime computation and enables native Weaviate sorting. Unrated memories have `rating_bayesian = 3.0` (the prior mean) and naturally sort in the middle.

**Design Doc**: [agent/design/local.memory-ratings.md](../../design/local.memory-ratings.md)

---

## Steps

### 1. Define Input/Output Types

Add to `src/types/rating.types.ts` or `src/types/memory.types.ts`:

```typescript
interface RatingModeRequest {
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

### 2. Implement byRating() on MemoryService

Follow the same pattern as `byTime()` and `byDensity()`:

```typescript
async byRating(collectionName: string, request: RatingModeRequest): Promise<RatingModeResult> {
  const collection = this.weaviateClient.collections.get(collectionName);
  const result = await collection.query.fetchObjects({
    sort: collection.sort.byProperty('rating_bayesian', request.direction ?? 'desc'),
    limit: request.limit,
    offset: request.offset,
    filters: buildFilters(request.filters),
  });
  // Map results, compute rating_avg
}
```

### 3. Export Types

Export `RatingModeRequest` and `RatingModeResult` from types barrel.

---

## Verification

- [ ] byRating('desc') returns highest-rated memories first
- [ ] byRating('asc') returns lowest-rated memories first
- [ ] Unrated memories (bayesian = 3.0) sort in middle
- [ ] Pagination (limit/offset) works correctly
- [ ] SearchFilters apply correctly
- [ ] `rating_avg` computed on returned memories
- [ ] Follows same code pattern as byTime/byDensity
- [ ] `tsc --noEmit` clean

---

**Next Task**: [Task 107: REST Endpoints](task-107-rest-endpoints.md)
**Related Design Docs**: [agent/design/local.memory-ratings.md](../../design/local.memory-ratings.md)
