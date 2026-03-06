# Milestone 25: byDiscovery Sort Mode

**Goal**: Add `byDiscovery` sort mode that interleaves unrated/underrated memories with high-rated ones to solve the cold-start problem in `byRating`.

**Status**: Not Started
**Estimated Duration**: 1 week (4-6 hours agent time)
**Dependencies**: M20 (Memory Ratings System, complete), M11 (Basic Sort Modes, complete)

---

## Overview

`byRating` has a cold-start trap: unrated memories sink to the bottom, never get exposure, never get rated. `byDiscovery` fixes this by interleaving a "discovery pool" (unrated content, sorted by recency) with a "rated pool" (proven content, sorted by Bayesian average) at a 4:1 ratio.

Design doc: `agent/design/local.by-discovery-sort-mode.md`
Clarifications: 14, 15

---

## Deliverables

1. Core interleaving algorithm (`interleaveDiscovery()`)
2. `byDiscovery` value in `sort_mode` enum across search APIs
3. Support in SpaceService (search + query) and MemoryService (personal collections)
4. `is_discovery` boolean flag on returned memories
5. Unit tests covering interleaving, edge cases, pagination

---

## Key Decisions

- Strategy: `recent` (newest unrated first)
- Threshold: `rating_count < 5`
- Ratio: 4:1, hardcoded
- Pagination: fetch both pools, merge in-memory, apply offset/limit
- Scope: spaces, groups, AND personal collections
- Applies to search queries (not just browse)
- No max age, no extra API params

---

## Success Criteria

- [ ] `sort_mode: 'byDiscovery'` accepted by space search, space query, and memory search
- [ ] Every 5th result is a discovery item (when both pools have sufficient items)
- [ ] `is_discovery` flag correctly set on response objects
- [ ] Graceful degradation when one pool is empty
- [ ] Cross-page deduplication works
- [ ] All unit tests pass
- [ ] Existing sort mode tests unaffected

---

## Tasks

- Task 132: Core interleaving algorithm
- Task 133: Wire byDiscovery into SpaceService
- Task 134: Wire byDiscovery into MemoryService
- Task 135: Unit tests and edge cases
