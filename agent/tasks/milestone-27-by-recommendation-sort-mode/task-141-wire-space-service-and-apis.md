# Task 141: Wire into SpaceService and Search APIs

**Milestone**: M27 — byRecommendation Sort Mode
**Status**: Not Started
**Estimated Hours**: 1-2
**Dependencies**: Task 140

---

## Objective

Add `byRecommendation` support to SpaceService search/query methods and REST API endpoints, following the same pattern used for byDiscovery in M25.

---

## Steps

1. Add `byRecommendation` to SpaceService `searchSpace()` sort mode dispatch
2. Add `byRecommendation` to SpaceService `querySpace()` sort mode dispatch
3. Add `byRecommendation` to REST controller sort mode validation
4. Ensure `similarity_pct` and `fallback_sort_mode` fields pass through to API response
5. Ensure `is_discovery` is NOT set on byRecommendation results (different from byDiscovery)
6. Test that search query parameter works with byRecommendation (hybrid: text query narrows candidates, then sort by recommendation)

---

## Verification

- [ ] `sort_mode: 'byRecommendation'` accepted by space search endpoint
- [ ] `sort_mode: 'byRecommendation'` accepted by space query endpoint
- [ ] `similarity_pct` included in response per memory
- [ ] `fallback_sort_mode` included in response when falling back
- [ ] Search query parameter narrows results correctly
- [ ] Existing sort modes unaffected
