# Task 144: Future Enhancement — Multi-Centroid Clustering

**Milestone**: M27 — byRecommendation Sort Mode
**Status**: Deferred
**Estimated Hours**: 4-6
**Dependencies**: Task 138, Task 140 (MVP must be complete first)

---

## Objective

Enhance byRecommendation to support multiple preference centroids via K-means clustering of the user's highly-rated embeddings. This captures diverse tastes (e.g., a user who likes both "cooking recipes" and "software architecture") better than a single averaged centroid.

---

## Description

A single centroid averages all preferences into one point in embedding space. For users with diverse interests, this centroid lands "between" their interests and may match neither well. Multi-centroid clustering:

1. Cluster the user's highly-rated embeddings into K groups (K-means or similar)
2. Compute one centroid per cluster
3. Run K separate `nearVector` queries
4. Merge and deduplicate results across clusters
5. Rank by best similarity across any cluster

This is explicitly deferred from MVP per clarification-16 decision. Tracked here for future planning.

---

## Rough Steps (when picked up)

1. Implement K-means or mini-batch K-means for embedding vectors
2. Determine optimal K (heuristic based on rating count, or elbow method)
3. Modify `computePreferenceCentroid` to return multiple centroids
4. Update `byRecommendation` to run multiple nearVector queries and merge
5. Handle cache invalidation for multi-centroid (store array of centroids)
6. Add tests for diverse-taste scenarios

---

## Verification

- [ ] Multi-centroid produces better results for users with diverse ratings
- [ ] Single-interest users still work (K=1 degenerates to single centroid)
- [ ] Performance acceptable (K queries instead of 1)
- [ ] Cache invalidation works for centroid arrays
