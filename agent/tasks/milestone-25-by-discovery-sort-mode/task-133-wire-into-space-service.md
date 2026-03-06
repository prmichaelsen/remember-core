# Task 133: Wire byDiscovery into SpaceService

**Milestone**: M25 — byDiscovery Sort Mode
**Estimated Time**: 1-2 hours
**Dependencies**: Task 132
**Status**: Not Started

---

## Objective

Integrate the `byDiscovery` sort mode into `SpaceService.search()` and `SpaceService.query()` so that space/group searches support discovery interleaving.

---

## Context

SpaceService already supports `byTime`, `byDensity`, and `byRating` sort modes. This task adds `byDiscovery` which executes two parallel Weaviate queries (rated + discovery pools) and merges results using `interleaveDiscovery()`.

The existing `discovery_count` field on published memories is already in the Weaviate schema.

---

## Steps

### 1. Update `searchSpace()` to handle `byDiscovery`

When `sort_mode === 'byDiscovery'`:
1. Execute two parallel Weaviate queries:
   - **Rated**: `rating_count >= 5`, sort by `rating_bayesian` DESC
   - **Discovery**: `rating_count < 5`, sort by `created_at` DESC
2. Fetch generously from both pools (e.g., limit * 2 each)
3. Call `interleaveDiscovery()` with both pools, offset, and limit
4. Map results to response format, including `is_discovery` flag

### 2. Update `querySpace()` to handle `byDiscovery`

Same two-query pattern, but with vector search + filters applied to both queries.

### 3. Update search/query input types

Ensure `sort_mode` accepts `'byDiscovery'` in `SearchSpaceInput` and `QuerySpaceInput`.

### 4. Update response types

Add `is_discovery?: boolean` to the space search/query result memory type.

---

## Verification

- [ ] `searchSpace({ sort_mode: 'byDiscovery' })` returns interleaved results
- [ ] `querySpace({ sort_mode: 'byDiscovery' })` returns interleaved results
- [ ] `is_discovery` flag present on response objects
- [ ] Existing sort modes unaffected
- [ ] Works with group searches
- [ ] Pool exhaustion handled gracefully
