# byDiscovery Sort Mode

**Concept**: Algorithmic sort mode that intentionally interleaves unrated/underrated memories with high-rated ones to help new content gain traction
**Created**: 2026-03-05
**Status**: Proposal

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

## Solution

### High-Level Approach

`byDiscovery` produces a feed that mixes two pools:
1. **Rated pool**: Memories with `rating_count >= threshold` (proven quality), sorted by Bayesian average
2. **Discovery pool**: Memories with `rating_count < threshold` (unproven), selected for exposure

The interleaving ratio determines how often a discovery slot appears. For example, a 4:1 ratio means every 5th memory is from the discovery pool.

### Interleaving Strategy

```
Position 1: Rated (highest Bayesian)
Position 2: Rated (2nd highest)
Position 3: Rated (3rd highest)
Position 4: Rated (4th highest)
Position 5: Discovery (selected from unrated pool)
Position 6: Rated (5th highest)
...
Position 10: Discovery
```

### Discovery Pool Selection

How to pick which unrated memories get discovery slots? Several strategies to consider:

**Option A — Recency-biased**: Newest unrated memories first. Gives fresh content a chance. Simple, no additional infrastructure.

**Option B — Random sampling**: Random selection from unrated pool. Ensures diversity. May surface stale content.

**Option C — Density-biased**: Unrated memories with high `relationship_count` first. Already has engagement signal (relationships), likely to be quality. Leverages existing data.

**Option D — Hybrid**: Weighted combination of recency + density. Prioritizes recent content with relationship signals.

### Alternative Approaches Considered

1. **Bayesian alone handles this**: The Bayesian prior (3.0) already places unrated memories in the middle. But "middle" isn't enough — in a feed sorted descending, middle means below all well-rated content. Users rarely scroll that far.
2. **Random injection at fixed positions**: Simpler but less principled. byDiscovery should be more intentional about what gets boosted.
3. **Separate "new" section**: Show unrated content in a separate UI section. Adds UI complexity. Users may ignore it.

---

## Implementation

### Interface

```typescript
interface DiscoveryModeRequest {
  collectionName: string;
  /** Ratio of rated:discovery items. Default 4 (every 5th item is discovery) */
  discoveryRatio?: number;
  /** How to select discovery items */
  discoveryStrategy?: 'recent' | 'density' | 'random' | 'hybrid';
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
}

interface DiscoveryModeResult {
  memories: DiscoveryMemory[];
  total: number;
}

interface DiscoveryMemory extends Memory {
  /** Whether this item was surfaced as a discovery slot */
  is_discovery: boolean;
}
```

### Query Strategy

Two parallel Weaviate queries:
1. **Rated query**: `rating_count >= 5`, sort by `rating_bayesian` DESC, limit = `limit * (ratio / (ratio + 1))`
2. **Discovery query**: `rating_count < 5`, sort by selected strategy, limit = `limit * (1 / (ratio + 1))`

Merge results by interleaving at the configured ratio.

### Pagination

Offset-based pagination is tricky with interleaving — the split between rated and discovery slots must be consistent. The offset applies to the merged result, and the service computes the correct offset for each sub-query based on the ratio.

---

## Benefits

- **Solves cold start**: New content gets guaranteed exposure slots
- **Self-correcting**: Once a discovery memory accumulates 5+ ratings, it moves to the rated pool and is ranked on merit
- **Configurable**: `discoveryRatio` lets consumers tune how aggressive discovery is
- **Builds on existing infra**: Uses `rating_count`, `rating_bayesian`, `byTime`, `byDensity` — all already implemented

---

## Trade-offs

- **Two queries per request**: Parallel Weaviate queries, but still more load than a single-query sort mode. Mitigated by parallel execution (like time-slice search).
- **Pagination complexity**: Interleaving makes offset calculation non-trivial. Must ensure deterministic ordering within each pool.
- **Discovery quality varies**: Not all unrated memories deserve exposure. Some may be genuinely low quality. Mitigated by the fact that bad discovery memories will receive low ratings and naturally drop out.
- **Ratio tuning**: The right `discoveryRatio` may vary by use case. Too aggressive = too much unproven content. Too conservative = cold start persists.

---

## Dependencies

- **Memory Ratings System** (`local.memory-ratings.md`): `rating_count` and `rating_bayesian` fields on Memory
- **byRating sort mode**: Rated pool uses the same Bayesian sort
- **byTime / byDensity**: Discovery pool selection strategies reuse existing sort modes

---

## Testing Strategy

- **Unit tests**: Interleaving logic (correct ratio, correct pool assignment), pagination offset calculation, `is_discovery` flag
- **Edge cases**: All memories unrated (100% discovery), all memories rated (0% discovery), fewer discovery items than slots available
- **Integration tests**: Full query with Weaviate mock, verify rated + discovery items in correct positions

---

## Open Questions

- What is the right default `discoveryRatio`? 4:1? 3:1? Should it be tunable per-user or system-wide?
- Should discovery items be de-duplicated across pages? (User sees discovery item X on page 1, shouldn't see it again on page 2)
- Should there be a maximum age for discovery items? (Don't boost a 6-month-old unrated memory)
- Should discovery items that consistently receive low ratings (e.g., rated 1-2 stars after exposure) be penalized and removed from the discovery pool?
- How does this interact with search queries? If the user is also searching by text, should discovery interleaving still apply, or only for browse-mode (no query)?

---

## Future Considerations

- **Discovery budget per memory**: Track how many times a memory has been shown as a discovery slot. After N exposures without ratings, stop boosting it.
- **ML-based selection**: Replace heuristic discovery selection with a model that predicts which unrated memories are most likely to be high quality.
- **A/B testing**: Test different ratios and strategies to optimize for rating conversion rate.

---

**Status**: Proposal
**Recommendation**: Implement after memory ratings MVP (M18) is complete and there's real rating data to work with.
**Related Documents**:
- `agent/design/local.memory-ratings.md` (dependency)
- `agent/milestones/milestone-11-basic-sort-modes.md` (Phase 2 reference)
- `agent/design/local.by-recommendation-sort-mode.md` (sibling feature)
