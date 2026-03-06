# Task 143: Unit Tests and Edge Cases

**Milestone**: M27 — byRecommendation Sort Mode
**Status**: Not Started
**Estimated Hours**: 2-3
**Dependencies**: Task 138, Task 139, Task 140, Task 141

---

## Objective

Comprehensive unit tests for the byRecommendation sort mode covering centroid computation, caching, vector search integration, edge cases, and fallback behavior.

---

## Steps

1. Create `src/services/recommendation.service.spec.ts` (colocated):
   - `averageVectors` with 1, 2, 10, 100 vectors
   - `subtractWeighted` with various weights
   - `computePreferenceCentroid` with insufficient data (< 5 ratings)
   - `computePreferenceCentroid` with only positive signal (no 1-2 star ratings)
   - `computePreferenceCentroid` with both positive and negative signals
   - Cross-collection embedding fetch (memories in different collections)
   - Vector fetch cap at 500

2. Centroid caching tests:
   - Cache hit returns stored centroid
   - Cache miss triggers computation
   - 4-5 star rating invalidates cache
   - 3 star rating does NOT invalidate cache
   - 1-2 star rating does NOT invalidate cache

3. MemoryService byRecommendation tests:
   - Standard flow: centroid -> nearVector -> ranked results
   - `similarity_pct` correctly computed
   - Results below 0.3 threshold filtered out
   - Already-rated memories excluded
   - User's own memories excluded
   - Fallback to byDiscovery when insufficient data
   - `fallback_sort_mode` set correctly on fallback
   - Empty results when no similar content found
   - SearchFilters applied correctly

4. Edge cases:
   - User with exactly 5 high ratings (MIN_PROFILE_SIZE boundary)
   - User with 4 high ratings (just below threshold)
   - User with all ratings in one collection, searching another
   - All nearVector results already rated (empty after exclusion)
   - All nearVector results below similarity threshold
   - User with only negative ratings (no positive centroid)

---

## Verification

- [ ] All centroid computation tests pass
- [ ] All caching tests pass
- [ ] All MemoryService byRecommendation tests pass
- [ ] All edge case tests pass
- [ ] Existing sort mode tests unaffected
- [ ] Tests colocated with source files (`.spec.ts`)
