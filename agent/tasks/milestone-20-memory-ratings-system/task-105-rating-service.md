# Task 105: RatingService

**Milestone**: [M20 - Memory Ratings System](../../milestones/milestone-20-memory-ratings-system.md)
**Estimated Time**: 3-4 hours
**Dependencies**: [Task 104](task-104-weaviate-schema-rating-properties.md)
**Status**: Not Started

---

## Objective

Create RatingService with rate, retract, and getUserRating methods. Individual ratings stored in Firestore, aggregates updated on Weaviate Memory objects.

---

## Context

RatingService is the core business logic for the rating system. It manages individual ratings in Firestore and keeps Weaviate aggregate fields in sync. Uses MemoryIndexService.lookup() (M18) for collection resolution — no caller-provided collectionName needed.

**Design Doc**: [agent/design/local.memory-ratings.md](../../design/local.memory-ratings.md)

---

## Steps

### 1. Create RatingService Class

Create `src/services/rating.service.ts`:

```typescript
class RatingService {
  constructor(params: {
    weaviateClient: WeaviateClient;
    firestore: Firestore;
    firestorePrefix: string;
    memoryIndexService: MemoryIndexService;
    logger?: Logger;
  }) {}
}
```

### 2. Implement rate() Method

Idempotent upsert:
1. Validate rating is integer 1-5
2. Validate userId !== memory author (self-rate rejection)
3. Validate not ghost mode
4. Resolve collection via `memoryIndexService.lookup(memoryId)`
5. Read existing Firestore rating at `{prefix}/memory_ratings/{memoryId}/ratings/{userId}`
6. Write/update Firestore rating doc with `{ rating, created_at, updated_at }`
7. Update Weaviate aggregates:
   - New: `sum += rating, count += 1`
   - Change: `sum += (newRating - oldRating), count unchanged`
8. Recompute `rating_bayesian = (rating_sum + 15) / (rating_count + 5)`
9. Return RatingResult

### 3. Implement retract() Method

1. Read existing Firestore rating (error if not found)
2. Delete Firestore rating doc
3. Update Weaviate: `sum -= oldRating, count -= 1`
4. Recompute `rating_bayesian`

### 4. Implement getUserRating() Method

1. Read Firestore doc at `{prefix}/memory_ratings/{memoryId}/ratings/{userId}`
2. Return MemoryRating or null

### 5. Add Firestore Path Helper

Add to `src/database/firestore/paths.ts`:

```typescript
export function getMemoryRatingPath(prefix: string, memoryId: string, userId: string): string {
  return `${prefix}/memory_ratings/${memoryId}/ratings/${userId}`;
}
```

### 6. Export from Barrel

Add RatingService to `src/services/index.ts` barrel.

---

## Verification

- [ ] rate() creates new rating with correct Firestore doc and Weaviate aggregates
- [ ] rate() updates existing rating (change case) with correct delta math
- [ ] retract() removes rating and decrements aggregates
- [ ] getUserRating() returns rating or null
- [ ] Self-rating rejected (userId === author)
- [ ] Invalid rating (0, 6, 1.5) rejected
- [ ] Collection resolution via MemoryIndexService works
- [ ] Bayesian score computed correctly after each operation
- [ ] Exported from services barrel
- [ ] `tsc --noEmit` clean

---

**Next Task**: [Task 106: byRating Sort Mode](task-106-byrating-sort-mode.md)
**Related Design Docs**: [agent/design/local.memory-ratings.md](../../design/local.memory-ratings.md)
