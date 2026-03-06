# Task 139: Firestore Centroid Caching Service

**Milestone**: M27 — byRecommendation Sort Mode
**Status**: Not Started
**Estimated Hours**: 1-2
**Dependencies**: Task 138 (centroid computation)

---

## Objective

Implement Firestore-based caching for preference centroids so they don't need to be recomputed on every request. Cache invalidation triggers only when the user submits a new 4-5 star rating.

---

## Steps

1. Define Firestore document structure for cached centroids:
   - Collection path: `preference_centroids/{userId}`
   - Fields: `centroid: number[]`, `profileSize: number`, `computedAt: Timestamp`, `version: number`
2. Add `getCachedCentroid(userId)` to RecommendationService — read from Firestore, return null on miss
3. Add `cacheCentroid(userId, centroid, profileSize)` — write to Firestore
4. Add `invalidateCentroid(userId)` — delete cached centroid doc
5. Wire invalidation into rating submission flow — when a user submits a 4-5 star rating, call `invalidateCentroid(userId)`
6. Add Firestore paths constant for centroid collection

---

## Verification

- [ ] Cached centroid returned on second call without recomputation
- [ ] Cache miss triggers full centroid computation
- [ ] New 4-5 star rating invalidates cached centroid
- [ ] 1-2 star or 3 star ratings do NOT invalidate cache
- [ ] Centroid doc has correct schema in Firestore
