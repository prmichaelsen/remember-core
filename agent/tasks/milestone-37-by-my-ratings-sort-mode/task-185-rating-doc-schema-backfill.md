# Task 185: Rating Doc Schema Update + Backfill

**Objective**: Add `collectionName` to user-rating Firestore docs and backfill existing docs
**Estimated Hours**: 2
**Dependencies**: None
**Design Reference**: [byMyRatings Sort Mode](../../design/local.by-my-ratings-sort-mode.md)

---

## Steps

### 1. Update `RatingService.rate()` dual-write

In `src/services/rating.service.ts`, the dual-write to `getUserRatingsPath(userId)` currently writes:
```typescript
{ ...ratingDoc, memoryId }
```

Update to include `collectionName` (already resolved earlier in the method):
```typescript
{ ...ratingDoc, memoryId, collectionName }
```

The `collectionName` variable is already available from the `MemoryIndexService.lookup()` call on line ~59.

### 2. Create backfill migration script

Create `scripts/migrations/backfill-rating-collection-name.ts`:

1. Initialize Firestore
2. List all user-rating subcollections (query `user_ratings/` top-level docs)
3. For each user's ratings subcollection:
   - Read all rating docs
   - For each doc missing `collectionName`:
     - Use `MemoryIndexService.lookup(memoryId)` to resolve collection
     - Update the doc with `collectionName`
   - Log progress per user
4. Report total updated/skipped/failed

### 3. Add npm script

Add to `package.json` scripts:
```
"migrate:backfill-rating-collection": "node --import tsx/esm scripts/migrations/backfill-rating-collection-name.ts"
```

---

## Verification

- [ ] `RatingService.rate()` writes `collectionName` to user-rating doc
- [ ] Existing rating.service.spec.ts tests still pass
- [ ] Backfill script runs without errors on e1
- [ ] After backfill, all user-rating docs have `collectionName` field
