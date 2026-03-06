# Task 138: Preference Centroid Computation and Vector Arithmetic

**Milestone**: M27 — byRecommendation Sort Mode
**Status**: Not Started
**Estimated Hours**: 2-3
**Dependencies**: None (foundational)

---

## Objective

Implement the core vector arithmetic for building a user's preference centroid from their rating history. This includes fetching embeddings for highly-rated and low-rated memories across all collections, computing the average vectors, and subtracting the negative signal.

---

## Steps

1. Create `src/services/recommendation.service.ts` with `RecommendationService` class
2. Implement `getUserHighRatings(userId, { minRating: 4, limit: 500 })` — fetch from Firestore rating storage
3. Implement `getUserLowRatings(userId, { maxRating: 2 })` — fetch 1-2 star ratings
4. Implement `getEmbeddingsAcrossCollections(ratings)` — resolve memory UUIDs to collections via memory-index-lookup, fetch embedding vectors from Weaviate
5. Implement `averageVectors(embeddings: number[][])` — compute element-wise average
6. Implement `subtractWeighted(positive, negative, weight)` — `result[i] = positive[i] - weight * negative[i]`, normalize result
7. Implement `computePreferenceCentroid(userId)` — orchestrates steps 2-6, returns the adjusted centroid vector
8. Define `NEGATIVE_WEIGHT = 0.3` constant (tunable)
9. Define `MIN_PROFILE_SIZE = 5` constant
10. Export types: `PreferenceCentroid`, `CentroidComputationResult`

---

## Verification

- [ ] `averageVectors` correctly averages N vectors element-wise
- [ ] `subtractWeighted` produces normalized result vector
- [ ] `computePreferenceCentroid` returns `insufficientData: true` when < 5 high ratings
- [ ] Cross-collection embedding fetch works (memories in different Weaviate collections)
- [ ] Vector fetch capped at 500 most recent highly-rated
- [ ] Negative signal correctly adjusts centroid away from disliked content
