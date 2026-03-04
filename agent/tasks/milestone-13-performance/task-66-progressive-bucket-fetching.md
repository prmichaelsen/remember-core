# Task 66: Progressive Bucket Fetching for Search Pipelines

**Milestone**: M13 — Performance
**Status**: Not Started
**Estimated Hours**: 3-4
**Dependencies**: None

---

## Objective

Add progressive fetching to `searchByTimeSlice` and `searchByDensitySlice` so they stop querying additional buckets once sufficient results are collected. Currently both fire all bucket queries unconditionally (14 and 9 respectively).

## Context

For a `limit: 10` request, the first 2-3 buckets often satisfy the limit entirely. The remaining 11-6 queries return results that get discarded during pagination. Progressive fetching queries high-priority buckets first, then only expands if needed.

## Steps

1. Split bucket slices into priority tiers (e.g., first 3-4 buckets = tier 1, rest = tier 2)
2. Query tier 1 with Promise.all
3. If collected results >= 2× limit (conservative threshold), skip tier 2
4. Otherwise query tier 2
5. Apply to both time-slice and density-slice
6. Add tests for early termination and full expansion cases

## Files to Modify

- `src/search/search-by-time-slice.ts`
- `src/search/search-by-time-slice.spec.ts`
- `src/search/search-by-density-slice.ts`
- `src/search/search-by-density-slice.spec.ts`

## Verification

- [ ] `npm run build` compiles
- [ ] All existing search tests pass
- [ ] New tests: early termination when tier 1 sufficient
- [ ] New tests: full expansion when tier 1 insufficient
- [ ] Pagination still works correctly across progressive results
