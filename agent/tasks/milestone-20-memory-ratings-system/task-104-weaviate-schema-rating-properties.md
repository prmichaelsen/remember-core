# Task 104: Weaviate Schema — Rating Properties

**Milestone**: [M20 - Memory Ratings System](../../milestones/milestone-20-memory-ratings-system.md)
**Estimated Time**: 1-2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add three new properties to the Weaviate Memory schema for rating aggregation, and update the Memory TypeScript type and MemoryService.create() defaults.

---

## Context

The rating system requires denormalized aggregate fields on each Memory object in Weaviate so that `byRating` can use native Weaviate sort (same pattern as `relationship_count` for `byDensity`). Individual ratings live in Firestore; aggregates live in Weaviate.

**Design Doc**: [agent/design/local.memory-ratings.md](../../design/local.memory-ratings.md)

---

## Steps

### 1. Add Rating Types

Create `src/types/rating.types.ts` with:

```typescript
interface RateMemoryInput {
  memoryId: string;
  userId: string;
  rating: number; // 1-5
}

interface RatingResult {
  previousRating: number | null;
  newRating: number;
  ratingCount: number;
  ratingAvg: number | null;
}

interface MemoryRating {
  rating: number;       // 1-5
  created_at: string;   // ISO 8601
  updated_at: string;   // ISO 8601
}
```

Export from `types/index.ts` barrel.

### 2. Update Memory Interface

Add to Memory type in `src/types/memory.types.ts`:

```typescript
rating_sum: number;
rating_count: number;
rating_bayesian: number;
rating_avg: number | null; // derived: count >= 5 ? sum / count : null
```

### 3. Update Weaviate Schema

Add to `COMMON_MEMORY_PROPERTIES` in `src/database/weaviate/v2-collections.ts`:

```typescript
{ name: 'rating_sum', dataType: ['int'] },
{ name: 'rating_count', dataType: ['int'] },
{ name: 'rating_bayesian', dataType: ['number'] },
```

### 4. Update MemoryService.create() Defaults

In `src/services/memory.service.ts`, initialize new memories with:

```typescript
rating_sum: 0,
rating_count: 0,
rating_bayesian: 3.0,  // (0 + 15) / (0 + 5) = 3.0
```

### 5. Update MemoryService Read Paths

In all read methods (getById, resolveById, search, byTime, byDensity, findSimilar, query), compute `rating_avg` as a derived field:

```typescript
rating_avg: memory.rating_count >= 5 ? memory.rating_sum / memory.rating_count : null
```

### 6. Update ALL_MEMORY_PROPERTIES

Add `rating_sum`, `rating_count`, `rating_bayesian` to the fetch property list.

---

## Verification

- [ ] Memory interface has `rating_sum`, `rating_count`, `rating_bayesian`, `rating_avg` fields
- [ ] Weaviate schema includes 3 new properties
- [ ] New memories created with correct defaults (0, 0, 3.0)
- [ ] `rating_avg` computed at read time (null when count < 5)
- [ ] Rating types exported from types barrel
- [ ] `tsc --noEmit` clean
- [ ] Existing tests still pass

---

**Next Task**: [Task 105: RatingService](task-105-rating-service.md)
**Related Design Docs**: [agent/design/local.memory-ratings.md](../../design/local.memory-ratings.md)
