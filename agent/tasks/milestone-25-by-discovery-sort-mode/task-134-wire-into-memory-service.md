# Task 134: Wire byDiscovery into SpaceService

**Milestone**: M25 — byDiscovery Sort Mode
**Estimated Time**: 1-2 hours
**Dependencies**: Task 132
**Status**: Not Started

---

## Objective

Add `byDiscovery` sort mode support to SpaceService search and query, so shared spaces/groups also support discovery interleaving.

---

## Context

SpaceService.search() currently sorts by relevance score. Adding byDiscovery support means either:
- Adding a `sort_mode` parameter to SearchSpaceInput
- Or creating a separate `byDiscovery()` method on SpaceService

The approach should match how the REST API exposes this (may need a separate endpoint or a param on existing search).

---

## Steps

### 1. Add sort_mode or byDiscovery method to SpaceService

When byDiscovery is requested for spaces:
- Execute two parallel queries against space/group collections with rating filters
- Merge with interleaveDiscovery()

### 2. Update SpaceService search/query input types

### 3. Update SVC spaces client if needed

### 4. Update OpenAPI spec for spaces endpoint

---

## Verification

- [ ] Space search supports byDiscovery
- [ ] Group search supports byDiscovery
- [ ] is_discovery flag on space results
- [ ] Existing space search unaffected
