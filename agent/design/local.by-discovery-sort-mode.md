# byDiscovery Sort Mode

**Concept**: Algorithmic sort mode that intentionally interleaves unrated/underrated memories with high-rated ones to help new content gain traction
**Created**: 2026-03-05
**Updated**: 2026-03-06
**Status**: Ready to implement

---

## Overview

The `byRating` sort mode ranks memories by quality — but it has a cold-start problem. New memories with zero ratings sink to the bottom, never gaining exposure to earn ratings in the first place. `byDiscovery` solves this by deliberately interleaving unrated or underrated memories into the feed alongside proven high-quality content.

This is analogous to how social platforms "boost" new content to gather initial engagement signals, except here the signal is explicit star ratings rather than implicit engagement metrics.

---

## Problem Statement

- **Cold-start trap**: `byRating` sorts unrated memories to the bottom. Users browsing by rating never see new content. New content never gets rated. The rich get richer.
- **Quality content buried**: A well-written memory with 0 ratings is invisible in `byRating` mode, even though it might be excellent. It needs exposure to prove itself.
- **Engagement-based algorithms fail here**: Traditional solutions (click tracking, view counts) measure engagement, not quality. A memory can be highly viewed but low quality. Remember's rating system measures quality directly — but only after someone rates it.
- **Uneven rating distribution**: In practice, a small fraction of memories will ever be rated. Most memories remain unrated indefinitely. A sort mode that only surfaces rated content ignores the majority of the corpus.

---

## Decisions (from clarifications 14-15)

| Decision | Answer |
|----------|--------|
| Discovery strategy (MVP) | `recent` — newest unrated first |
| Discovery threshold | `rating_count < 5` |
| Interleaving ratio | 4:1, hardcoded (every 5th item is discovery) |
| Ratio as API param | No, hardcoded for MVP |
| Discovery exhaustion | Fill remaining slots with rated content |
| Rated exhaustion | Fill remaining slots with discovery content |
| Sort mode API | New `byDiscovery` value in existing `sort_mode` enum |
| Extra API params | None for MVP — `sort_mode: 'byDiscovery'` is sufficient |
| `is_discovery` flag | Yes, boolean on each returned memory |
| Applies to search queries | Yes, not just browse-mode |
| Scope | Spaces, groups, AND personal collections |
| Pagination | Fetch both pools fully, merge in-memory, apply offset to merged result |
| Cross-page dedup | Yes, no repeats across pages |
| Max age for discovery | No limit |
| Discovery impressions | Use existing `discovery_count` field (already in Weaviate schema) |

---

## Solution

### High-Level Approach

`byDiscovery` produces a feed that mixes two pools:
1. **Rated pool**: Memories with `rating_count >= 5` (proven quality), sorted by `rating_bayesian` DESC
2. **Discovery pool**: Memories with `rating_count < 5` (unproven), sorted by `created_at` DESC (recency)

The interleaving ratio is 4:1 — every 5th memory is from the discovery pool.

### Interleaving Strategy

```
Position 1: Rated (highest Bayesian)
Position 2: Rated (2nd highest)
Position 3: Rated (3rd highest)
Position 4: Rated (4th highest)
Position 5: Discovery (most recent unrated)
Position 6: Rated (5th highest)
...
Position 10: Discovery (2nd most recent unrated)
```

### Pool Exhaustion

When one pool runs out:
- **Discovery pool empty**: Remaining slots filled with rated content (feed becomes pure `byRating`)
- **Rated pool empty**: Remaining slots filled with discovery content (feed becomes pure `byTime` for unrated)

### `is_discovery` Flag

Each memory in the response includes `is_discovery: boolean`. Consumers can use this for:
- UI badges ("New" / "Undiscovered") to encourage rating
- Analytics tracking (discovery → rating conversion)
- Client-side filtering if needed

---

## Implementation

### API Surface

`byDiscovery` is a new value in the existing `sort_mode` enum:

```typescript
type SortMode = 'byTime' | 'byDensity' | 'byRating' | 'byDiscovery';
```

No additional parameters for MVP. The consumer requests:

```typescript
searchSpace({ sort_mode: 'byDiscovery', limit: 20 });
// or
searchMemories({ sort_mode: 'byDiscovery', limit: 20 });
```

### Internal Interface

```typescript
interface DiscoveryMemory extends Memory {
  is_discovery: boolean;
}
```

The `discoveryRatio` (4) and strategy (`recent`) are internal constants, not exposed to the API.

### Query Strategy

Two parallel Weaviate queries:
1. **Rated query**: `rating_count >= 5`, sort by `rating_bayesian` DESC, fetch generously (limit × 2 or all available)
2. **Discovery query**: `rating_count < 5`, sort by `created_at` DESC, fetch generously

Both pools are fetched fully, merged in-memory by interleaving at 4:1 ratio, then the requested `offset` and `limit` are applied to the merged result.

### Pagination

Fetch-and-merge approach (Option B from clarification):
1. Fetch both pools with generous limits
2. Interleave in-memory at 4:1 ratio
3. Apply `offset` and `limit` to the merged array
4. Return the slice

This is simpler than computing sub-offsets and guarantees cross-page deduplication — the interleaving is deterministic from the same underlying data.

### Scope

Works on all collection types:
- **Space search** (`searchSpace`): Discover unrated public content
- **Group search**: Discover unrated group content
- **Personal collections** (`searchMemories`): Find your own unrated content

---

## Dependencies

All satisfied:
- **Memory Ratings System** (M18, complete): `rating_count`, `rating_bayesian` fields on Memory
- **byRating sort mode** (complete): Rated pool uses the same Bayesian sort
- **byTime sort mode** (complete): Discovery pool sorted by recency
- **`discovery_count` field** (exists): Already in Weaviate schema on published memories

---

## Testing Strategy

- **Unit tests**: Interleaving logic (correct 4:1 ratio, correct pool assignment), `is_discovery` flag set correctly
- **Edge cases**:
  - All memories unrated → 100% discovery, sorted by recency
  - All memories rated → 0% discovery, pure byRating
  - Fewer discovery items than slots → rated content fills in
  - Fewer rated items than slots → discovery content fills in
  - Empty corpus → empty result
- **Pagination tests**: Page 1 and page 2 return non-overlapping results, correct offset behavior
- **Integration tests**: Full query flow with Weaviate mock, verify interleaving positions

---

## Future Considerations

- **Alternative strategies**: `density`, `random`, `hybrid` selection for discovery pool (configurable via API param)
- **Configurable ratio**: Expose `discoveryRatio` as an API parameter
- **Discovery budget**: Use `discovery_count` to stop boosting memories after N impressions without ratings
- **Low-rating penalty**: Remove memories from discovery pool if they receive consistently low ratings after exposure
- **ML-based selection**: Predict which unrated memories are most likely to be high quality
- **A/B testing**: Test different ratios and strategies to optimize for rating conversion rate

---

**Status**: Ready to implement
**Note**: All dependencies satisfied (M18 complete, schema fields exist). Ready for task creation.
**Clarifications**: 14, 15
**Related Documents**:
- `agent/design/local.memory-ratings.md` (dependency, complete)
- `agent/milestones/milestone-11-basic-sort-modes.md` (Phase 2 reference)
- `agent/design/local.by-recommendation-sort-mode.md` (sibling feature)
