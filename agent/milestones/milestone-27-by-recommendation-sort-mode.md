# Milestone 27: byRecommendation Sort Mode

**Goal**: Add `byRecommendation` sort mode that generates personalized feeds using vector similarity to a user's rating history — surface content similar to what they like, regardless of popularity.

**Status**: Not Started
**Estimated Duration**: 1.5 weeks (6-10 hours agent time)
**Dependencies**: M20 (Memory Ratings System, complete), M11 (Basic Sort Modes, complete), M25 (byDiscovery, complete)

---

## Overview

`byRecommendation` builds a preference centroid from embeddings of memories the user rated 4-5 stars, subtracts a weighted negative signal from 1-2 star ratings, then uses `nearVector` to find similar content. Cached in Firestore to avoid recomputing on every request. Falls back to `byDiscovery` when insufficient rating history.

Inspired by SoundCloud's Boost algorithm: find what you like, find things similar to what you like, surface them even if nobody else has heard them.

Design doc: `agent/design/local.by-recommendation-sort-mode.md`
Clarification: 16

---

## Deliverables

1. Preference centroid computation (positive + negative signal)
2. Firestore centroid caching with invalidation on 4-5 star ratings
3. `byRecommendation` value in `sort_mode` enum across search APIs
4. Support in SpaceService and MemoryService
5. Auto-fallback to `byDiscovery` when `insufficientData` (< 5 high ratings)
6. `similarity_pct` field on returned memories (percentage badge)
7. `fallback_sort_mode` indicator in response
8. Unit tests and edge cases
9. Future enhancement task tracked: multi-centroid clustering

---

## Key Decisions (Clarification 16)

- MIN_PROFILE_SIZE: 5
- Positive signal: 4-5 star ratings only
- Negative signal: 1-2 star ratings (subtract weighted centroid)
- Centroid scope: Global (all collections user has rated in)
- Caching: Firestore, invalidate on new 4-5 star rating only
- Vector fetch cap: 500 (most recent highly-rated)
- Min similarity threshold: 0.3
- Exclusions: already-rated memories + user's own memories
- SearchFilters: supported (content type, date range, etc.)
- Search query: supported (like byDiscovery)
- Fallback: auto-fallback to byDiscovery with `fallback_sort_mode` indicator
- Similarity display: percentage (e.g., "92%") via `similarity_pct`
- MVP: single centroid; multi-centroid clustering deferred

---

## Success Criteria

- [ ] `sort_mode: 'byRecommendation'` accepted by space search, space query, and memory search
- [ ] Results ranked by vector similarity to user's preference centroid
- [ ] Negative signal (1-2 star) pushes centroid away from disliked content
- [ ] `similarity_pct` correctly computed and returned per memory
- [ ] Auto-fallback to byDiscovery when user has < 5 highly-rated memories
- [ ] `fallback_sort_mode: 'byDiscovery'` set in response when falling back
- [ ] Centroid cached in Firestore; cache invalidated on new 4-5 star rating
- [ ] User's own memories and already-rated memories excluded from results
- [ ] Min similarity threshold 0.3 enforced
- [ ] Standard SearchFilters work with byRecommendation
- [ ] All unit tests pass
- [ ] Existing sort mode tests unaffected

---

## Tasks

- Task 138: Preference centroid computation and vector arithmetic
- Task 139: Firestore centroid caching service
- Task 140: byRecommendation method in MemoryService
- Task 141: Wire into SpaceService and search APIs
- Task 142: SVC client, OpenAPI spec, and generated types
- Task 143: Unit tests and edge cases
- Task 144: Future — multi-centroid clustering (deferred, tracked)
