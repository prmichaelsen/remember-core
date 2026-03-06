# Task 134: Wire byDiscovery into MemoryService

**Milestone**: M25 — byDiscovery Sort Mode
**Estimated Time**: 0.5-1 hour
**Dependencies**: Task 132
**Status**: Not Started

---

## Objective

Integrate the `byDiscovery` sort mode into `MemoryService.search()` so personal collections also support discovery interleaving.

---

## Context

Per clarification 14/15, byDiscovery should work on personal collections too — surfacing the user's own unrated memories alongside their rated ones. The implementation mirrors the SpaceService pattern but queries the user's own collection.

---

## Steps

### 1. Update `searchMemories()` to handle `byDiscovery`

When `sort_mode === 'byDiscovery'`:
1. Two parallel queries against the user's collection:
   - **Rated**: `rating_count >= 5`, sort by `rating_bayesian` DESC
   - **Discovery**: `rating_count < 5`, sort by `created_at` DESC
2. Call `interleaveDiscovery()` with both pools
3. Map to response format with `is_discovery` flag

### 2. Update search input/output types

Ensure `sort_mode` accepts `'byDiscovery'` in memory search input and `is_discovery` is on the result type.

---

## Verification

- [ ] `searchMemories({ sort_mode: 'byDiscovery' })` returns interleaved results
- [ ] Personal collection queries work correctly
- [ ] `is_discovery` flag present
- [ ] Existing sort modes unaffected
