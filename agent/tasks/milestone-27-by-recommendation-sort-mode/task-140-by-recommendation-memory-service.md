# Task 140: byRecommendation Method in MemoryService

**Milestone**: M27 — byRecommendation Sort Mode
**Status**: Not Started
**Estimated Hours**: 2-3
**Dependencies**: Task 138, Task 139

---

## Objective

Implement the `byRecommendation` sort mode method in MemoryService following the sort mode method pattern. Uses the preference centroid to perform `nearVector` search, excludes rated and own memories, applies similarity threshold, and falls back to byDiscovery when insufficient data.

---

## Steps

1. Define `RecommendationModeRequest` type:
   - `userId`, `collectionName`, `limit?`, `offset?`, `filters?`, `query?`
2. Define `RecommendationModeResult` type:
   - `memories: RecommendedMemory[]`, `profileSize`, `insufficientData`, `fallback_sort_mode?`, `total`, `offset`, `limit`
3. Define `RecommendedMemory` extending Memory with `similarity_pct: number`
4. Add `byRecommendation(input)` method to MemoryService:
   - Get or compute centroid (via RecommendationService)
   - If insufficient data, delegate to `byDiscovery` and set `fallback_sort_mode: 'byDiscovery'`
   - Build exclusion filter: already-rated IDs + user's own memories (by author field)
   - Merge with standard SearchFilters if provided
   - Execute `nearVector(centroid, { limit, filters, returnMetadata: ['distance'] })`
   - Map results: `similarity_pct = Math.round((1 - distance) * 100)`
   - Filter by min similarity threshold (0.3 = 30%)
   - Return result
5. Add `sort_mode: 'byRecommendation'` to the SortMode enum/type
6. Wire into existing sort mode dispatch (switch/if in search methods)

---

## Verification

- [ ] `byRecommendation` returns memories ranked by similarity to centroid
- [ ] `similarity_pct` correctly computed (0-100 range)
- [ ] Results with similarity < 30% filtered out
- [ ] Already-rated memories excluded
- [ ] User's own memories excluded
- [ ] Auto-fallback to byDiscovery when < 5 high ratings
- [ ] `fallback_sort_mode` set in response on fallback
- [ ] Standard SearchFilters applied correctly
- [ ] Ghost/trust filtering applied (via existing pipeline)
