# byCurated Sort Mode

**Concept**: Hybrid algorithmic sort mode that combines graph centrality, Haiku editorial quality, cluster quality, user ratings, recency, and engagement into a single pre-computed curation score, updated during REM background cycles
**Created**: 2026-03-06
**Status**: Design Specification

---

## Overview

`byCurated` is a composite sort mode that leverages REM's background processing capability to compute an offline curation score for every memory in a collection. Unlike single-signal sort modes (`byRating` = user ratings only, `byDensity` = relationship count only), `byCurated` fuses six distinct quality signals into one number, stored directly on the Memory object in Weaviate for O(1) query-time sorting.

The key insight is that REM already runs expensive background work (embedding similarity, Haiku validation). Extending REM to also compute a curation score is nearly free — the infrastructure, Haiku calls, and graph traversals are already happening. The curation score is a byproduct of work REM is already doing.

This is the "Phase 2: REM curation" feature referenced in M11 (Basic Sort Modes).

---

## Problem Statement

- **Single-signal blindness**: Each existing sort mode captures one dimension of quality. `byRating` misses unrated gems. `byDensity` equates connectivity with quality. `byTime` ignores quality entirely. No mode combines structural, editorial, and social signals.
- **Quality is multidimensional**: A great memory might be well-written (editorial), deeply connected to other memories (graph), highly rated (social), and recent (fresh). Or it might excel in just one dimension. A single-signal sort can't express this.
- **Cold-start remains partially unsolved**: `byDiscovery` helps unrated content get seen, but doesn't predict which unrated content is likely to be good. A Haiku editorial score can evaluate content quality before any user interaction.
- **REM infrastructure underutilized**: REM already touches every memory in a collection, runs Haiku, and builds relationship graphs. This infrastructure can cheaply produce a quality score as a side effect.

---

## Solution

### High-Level Approach

During each REM cycle, after the existing relationship CRUD phase, a new **curation scoring** step runs. It computes six sub-scores per memory, combines them into a weighted composite `curated_score`, and writes it to the Memory object in Weaviate. At query time, `byCurated` is a simple native Weaviate sort by `curated_score` DESC.

### The Six Signals

Ordered by priority (1 = highest weight in composite):

| Priority | Signal | Source | What It Captures |
|----------|--------|--------|------------------|
| 1 | **Editorial quality** | Haiku per-memory review | Content quality independent of popularity |
| 2 | **Cluster quality** | REM cluster strength/confidence | Structural quality — belongs to strong, validated clusters |
| 3 | **Graph centrality** | PageRank on relationship graph | Structural importance — hub memories that connect topics |
| 4 | **User ratings** | `rating_bayesian` (existing) | Explicit quality signal from users |
| 5 | **Recency** | `created_at` decay function | Freshness — prevents stale feeds |
| 6 | **Engagement** | `click_count`, `share_count`, `comment_count` | Popularity signal (intentionally lowest weight) |

### Composite Score Formula

```
curated_score = w1 * editorial_score
             + w2 * cluster_quality_score
             + w3 * graph_centrality_score
             + w4 * normalized_rating_bayesian
             + w5 * recency_score
             + w6 * engagement_score
```

All sub-scores are normalized to 0.0-1.0 before weighting. The weights (w1-w6) are tuned offline and stored as constants. Initial suggested weights:

| Weight | Signal | Value | Rationale |
|--------|--------|-------|-----------|
| w1 | Editorial | 0.30 | Most distinctive signal, content quality |
| w2 | Cluster quality | 0.25 | Unique structural quality from REM |
| w3 | Graph centrality | 0.20 | Structural importance |
| w4 | Ratings | 0.12 | Explicit but sparse |
| w5 | Recency | 0.08 | Freshness matters but shouldn't dominate |
| w6 | Engagement | 0.05 | Useful but lowest priority |

Weights sum to 1.0. The composite `curated_score` is a NUMBER in [0.0, 1.0].

### Novel Signals (Future)

Two additional signals were identified for future exploration:
- **Semantic diversity**: Bonus for memories that are semantically distinct from their neighbors in the feed (reduces monotony)
- **Surprise factor**: Bonus for memories that defy expectations (high quality in an unexpected topic area for the collection)

---

## Implementation

### Architecture

```
REM Job Cycle (per collection)
  |
  |-- Step 1: Select candidate memories (existing)
  |-- Step 2: Find clusters via embeddings (existing)
  |-- Step 3: Haiku cluster validation (existing)
  |-- Step 4: Relationship CRUD (existing)
  |-- Step 5: Curation Scoring (NEW)
  |     |
  |     |-- 5a. Haiku editorial pass (new/unscored memories only)
  |     |-- 5b. Aggregate cluster quality per memory
  |     |-- 5c. Run PageRank on collection's relationship graph
  |     |-- 5d. Read existing ratings + engagement counters
  |     |-- 5e. Compute recency decay
  |     |-- 5f. Combine into curated_score, write to Weaviate
  |     |-- 5g. Store sub-scores in Firestore (for API transparency)
  |
  |-- Step 6: Update rem_cursor (existing)
```

REM is being restructured to use the remember-core jobs pattern, so curation scoring becomes a step within the unified REM job.

### Schema Changes (Weaviate)

New properties on Memory collections:

```typescript
// Weaviate schema additions
{ name: 'curated_score', dataType: configure.dataType.NUMBER }   // composite 0.0-1.0
{ name: 'editorial_score', dataType: configure.dataType.NUMBER } // Haiku quality 0.0-1.0
{ name: 'click_count', dataType: configure.dataType.INT }        // link clicks
{ name: 'share_count', dataType: configure.dataType.INT }        // share CTA clicks (not republish)
{ name: 'comment_count', dataType: configure.dataType.INT }      // comments on the memory
```

Existing fields already used: `relationship_count`, `rating_bayesian`, `rating_count`, `discovery_count`, `created_at`.

Note: `view_count` skipped — `discovery_count` already captures impressions.

### Sub-Score Storage (Firestore)

For API transparency (sub-score breakdown), store per-memory sub-scores in Firestore:

```typescript
// Firestore: curated_scores/{collection_id}/memories/{memory_id}
interface CuratedSubScores {
  memory_id: string;
  collection_id: string;
  editorial: number;      // 0.0-1.0
  cluster_quality: number; // 0.0-1.0
  graph_centrality: number; // 0.0-1.0
  rating: number;          // 0.0-1.0 (normalized rating_bayesian)
  recency: number;         // 0.0-1.0
  engagement: number;      // 0.0-1.0
  composite: number;       // 0.0-1.0 (same as curated_score in Weaviate)
  scored_at: string;       // ISO timestamp
}
```

### Signal Computation Details

#### 1. Editorial Quality (Haiku)

Per-memory Haiku evaluation during REM cycles. Only evaluates new/unscored memories each cycle, but can revisit previously scored memories periodically.

**Prompt** (to Haiku):
```
Evaluate this memory for quality on a 0.0-1.0 scale.

Criteria (equal weight):
- Writing quality: clarity, coherence, readability
- Informational value: teaches something, contains substance
- Uniqueness: distinct from generic/boilerplate content
- Completeness: self-contained, well-formed
- Creativity: originality, artistic merit (poems, stories)
- Vulnerability/depth: emotional honesty (journals, reflections)
- Impact: significance of the event or insight described

Memory content:
{content, truncated to ~500 chars}

Respond with JSON: { "score": 0.0-1.0, "reason": "brief explanation" }
```

**Cost management**: $50 budget cap per REM cycle. At ~$0.003/call, that's ~16,000 evaluations per cycle. Only new/unscored memories are evaluated each cycle; re-evaluation happens on a rotation (oldest scored_at first).

#### 2. Cluster Quality

Aggregate REM cluster `strength` and `confidence` per memory:

```typescript
function clusterQualityScore(memoryId: string, relationships: Relationship[]): number {
  const memberOf = relationships.filter(r =>
    r.source === 'rem' && r.memory_ids.includes(memoryId)
  );
  if (memberOf.length === 0) return 0;

  const avgStrength = mean(memberOf.map(r => r.strength));
  const avgConfidence = mean(memberOf.map(r => r.confidence));
  const membershipBonus = Math.min(memberOf.length / 10, 1.0); // cap at 10 clusters

  return (avgStrength * 0.4 + avgConfidence * 0.4 + membershipBonus * 0.2);
}
```

#### 3. Graph Centrality (PageRank)

Run simplified PageRank on the collection's relationship graph:

```typescript
function pageRank(memories: string[], edges: [string, string][], iterations = 20, damping = 0.85): Map<string, number> {
  const N = memories.length;
  const scores = new Map(memories.map(m => [m, 1 / N]));

  for (let i = 0; i < iterations; i++) {
    const newScores = new Map(memories.map(m => [m, (1 - damping) / N]));
    for (const [from, to] of edges) {
      const outDegree = edges.filter(([f]) => f === from).length;
      newScores.set(to, newScores.get(to)! + damping * scores.get(from)! / outDegree);
    }
    for (const [m, s] of newScores) scores.set(m, s);
  }

  // Normalize to 0-1
  const max = Math.max(...scores.values());
  if (max === 0) return scores;
  for (const [m, s] of scores) scores.set(m, s / max);
  return scores;
}
```

Relationships are bidirectional edges. Each relationship with N memory_ids produces N*(N-1)/2 edges. For large collections, limit to top 1000 memories by relationship_count to keep PageRank tractable.

#### 4. Rating (Normalized)

```typescript
function normalizedRating(rating_bayesian: number): number {
  // rating_bayesian is (sum + 15) / (count + 5), range ~1.0-5.0
  // Normalize to 0-1: (value - 1) / 4
  return Math.max(0, Math.min(1, (rating_bayesian - 1) / 4));
}
```

Memories with 0 ratings get the Bayesian prior: (0 + 15) / (0 + 5) = 3.0, which normalizes to 0.5. This is intentional — unrated memories get a neutral score, not zero.

#### 5. Recency

Exponential decay from created_at:

```typescript
function recencyScore(created_at: Date, halfLifeDays = 90): number {
  const ageMs = Date.now() - created_at.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.exp(-0.693 * ageDays / halfLifeDays); // ln(2) = 0.693
}
```

Half-life of 90 days: a 90-day-old memory scores 0.5, a 180-day-old memory scores 0.25.

#### 6. Engagement

```typescript
function engagementScore(memory: Memory): number {
  const clickScore = Math.min(memory.click_count / 50, 1.0);
  const shareScore = Math.min(memory.share_count / 10, 1.0);
  const commentScore = Math.min(memory.comment_count / 20, 1.0);
  return (clickScore * 0.4 + shareScore * 0.3 + commentScore * 0.3);
}
```

Caps prevent viral memories from dominating. Engagement is already the lowest-weighted signal (w6 = 0.05).

### API Surface

#### Sort Mode Enum

```typescript
type SortMode = 'byTime' | 'byDensity' | 'byRating' | 'byDiscovery' | 'byCurated';
```

#### Search Query Support (CRITICAL)

`byCurated` MUST support a search query parameter. When a query is provided:

1. Run standard hybrid search (BM25 + vector) to find matching memories
2. Re-rank results by `curated_score` DESC
3. Return re-ranked results

This combines relevance (search matches) with quality (curated score). Without query support, byCurated is just a browse mode.

```typescript
// Usage
searchSpace({ query: 'poems about nature', sort_mode: 'byCurated', limit: 20 });
searchMemories({ sort_mode: 'byCurated', limit: 20 }); // browse mode (no query)
```

#### Response Shape

```typescript
interface CuratedMemory extends Memory {
  curated_score: number;        // composite 0.0-1.0
  curated_breakdown?: {         // optional sub-scores
    editorial: number;
    cluster_quality: number;
    graph_centrality: number;
    rating: number;
    recency: number;
    engagement: number;
  };
  is_discovery?: boolean;       // true if memory has no curated_score yet (interleaved)
}
```

#### Unscored Memory Handling

Memories added between REM cycles won't have a `curated_score`. These are interleaved with scored results using the same byDiscovery pattern — scored memories fill most slots, unscored memories are sprinkled in at a 4:1 ratio (every 5th position). Unscored memories are sorted by `created_at` DESC within their pool.

### Scope

All collection types, equally:
- Personal collections
- Group collections
- Space collections

Minimum collection size: 50 memories (same as REM threshold). Collections below 50 memories don't get REM processing and therefore don't get curation scores.

---

## Benefits

- **Multidimensional quality**: Fuses six signals that each capture a different aspect of "good content"
- **Works without user interaction**: Editorial quality + graph centrality + cluster quality provide scoring even for unrated, zero-engagement memories
- **Zero query-time cost**: Pre-computed score in Weaviate means native sort, no runtime computation
- **Transparent**: Sub-score breakdown lets consumers (and users) understand why a memory ranks where it does
- **Piggybacks on REM**: Curation scoring reuses REM infrastructure (Haiku calls, graph traversals) — minimal incremental cost
- **Search + browse**: Works both as a browse mode (no query) and as a relevance re-ranker (with query)

---

## Trade-offs

- **Staleness**: Scores are only as fresh as the last REM cycle. A memory that goes viral between cycles won't be re-scored until the next run. Mitigated by REM running frequently (daily per collection via jobs).
- **Haiku cost**: Editorial evaluation adds Haiku calls. Mitigated by $50/cycle cap and incremental evaluation (only new/unscored memories per cycle, plus periodic re-evaluation rotation).
- **Weight tuning**: The initial weights (w1-w6) are educated guesses. May need adjustment based on real-world usage. Mitigated by weights being constants that can be changed without schema migration.
- **PageRank scaling**: Full PageRank on large collections (10,000+ memories) may be slow. Mitigated by limiting to top 1000 memories by relationship_count and running in background.
- **Complexity**: Six signals, normalization, weighting, Firestore sub-score storage — this is the most complex sort mode. Mitigated by clear separation of concerns (each signal is an independent function) and pre-computation (complexity is at write time, not read time).

---

## Dependencies

- **REM Background Relationships** (M10, complete): Relationship graph, cluster data, Haiku infrastructure
- **Memory Ratings System** (M20, partially complete): `rating_bayesian`, `rating_count` fields
- **Job Tracking System** (M16, complete): REM restructuring into jobs pattern
- **New Weaviate schema fields**: `curated_score`, `editorial_score`, `click_count`, `share_count`, `comment_count`
- **Firestore collection**: `curated_scores/` for sub-score storage

---

## Testing Strategy

- **Unit tests**: Each sub-score function independently (editorial normalization, cluster quality aggregation, PageRank convergence, rating normalization, recency decay, engagement normalization)
- **Composite tests**: Weighted combination produces expected composite from known sub-scores
- **Weight validation**: Weights sum to 1.0, all sub-scores in [0.0, 1.0], composite in [0.0, 1.0]
- **Interleaving tests**: Unscored memories correctly interleaved at 4:1 ratio with scored memories
- **Search query tests**: byCurated with query re-ranks search results by curated_score
- **Edge cases**:
  - All memories unscored (pure byTime fallback via interleave)
  - Memory with perfect score across all signals (composite = 1.0)
  - Memory with zero across all signals (composite = 0.0)
  - Collection with < 50 memories (no curation scoring)
- **Integration tests**: Full REM cycle with curation step, verify scores written to Weaviate and sub-scores to Firestore

---

## Migration Path

1. **Schema migration**: Add `curated_score`, `editorial_score`, `click_count`, `share_count`, `comment_count` to Weaviate Memory collections (default: 0)
2. **Sub-score Firestore collection**: Create `curated_scores/` collection structure
3. **Implement sub-score functions**: Each signal as an independent, tested function
4. **Implement composite scoring**: Weighted combination + Weaviate write
5. **Extend REM job**: Add curation scoring step after relationship CRUD
6. **Add `byCurated` to search APIs**: MemoryService + SpaceService + SVC Client + OpenAPI
7. **Wire search query support**: Hybrid search -> re-rank by curated_score
8. **Add engagement counter endpoints**: REST endpoints to increment click/share/comment counts
9. **Run initial scoring**: Trigger REM cycle on all eligible collections to populate scores
10. **Update App Client**: Add byCurated support

---

## Key Design Decisions

### Algorithm & Signals

| Decision | Choice | Rationale |
|---|---|---|
| Algorithm approach | Full hybrid (all 6 signals) | Multidimensional quality captures what no single signal can |
| Signal priority | Editorial > Cluster > Graph > Rating > Recency > Engagement | Content quality is most distinctive; engagement is lowest because popularity != quality |
| Editorial criteria | Writing quality, informational value, uniqueness, completeness, creativity, vulnerability/depth, impact | Covers both analytical content (informational) and creative/emotional content (poems, journals) |
| Novel signals (future) | Semantic diversity, surprise factor | Interesting but deferred to keep MVP scope manageable |

### REM Integration

| Decision | Choice | Rationale |
|---|---|---|
| Score storage | Pre-computed `curated_score` Weaviate property | O(1) query-time sort via native Weaviate sort |
| Recomputation frequency | Every REM cycle | Keeps scores fresh; REM already touches every collection |
| REM restructuring | One unified REM job with curation as a step | REM being converted to jobs pattern; no separate job type needed |
| Scope | All collection types equally, min 50 memories | Same threshold as REM; all users benefit equally |

### Haiku Editorial

| Decision | Choice | Rationale |
|---|---|---|
| Re-evaluation | Yes, periodic re-visit of previously scored items | Content context changes as collection evolves; scores should refresh |
| Cost cap | $50 per REM cycle | Covers ~16K evaluations; sufficient unless massive user growth |
| Incremental evaluation | Only new/unscored memories per cycle + oldest-scored rotation | Amortizes cost while keeping scores fresh |

### Engagement Signals

| Decision | Choice | Rationale |
|---|---|---|
| New schema fields | `click_count`, `share_count`, `comment_count` | Captures distinct engagement types |
| `share_count` vs republish | Separate — share = share CTA click | Different user intent than republishing to a space |
| `view_count` | Skipped — same as `discovery_count` | Avoid redundant counters |
| `discovery_conversion_rate` | Skipped — `rating_count` alone suffices | Simpler; conversion rate adds complexity without clear value |
| Engagement priority | Lowest weight (w6 = 0.05) | Popularity != quality; engagement is a signal, not the signal |

### API Surface

| Decision | Choice | Rationale |
|---|---|---|
| Sort mode integration | New `byCurated` value in existing enum | Consistent with byDiscovery, byRating pattern |
| Search query support | YES (critical) | Without it, byCurated is browse-only; search + quality re-ranking is the killer feature |
| Response transparency | `curated_score` + sub-score breakdown on each memory | Enables UI badges, debugging, user trust in ranking |
| Relationship to other modes | Coexists; may eventually supersede | Other modes remain useful for specific signal interest |
| Default sort mode | No — byCurated is opt-in | Users choose their preferred sort explicitly |

### Cold Start & Edge Cases

| Decision | Choice | Rationale |
|---|---|---|
| Collections < 50 memories | No curation scoring (REM doesn't process them) | Same threshold as REM; small collections don't have enough data |
| Unscored memories | Interleaved like byDiscovery (4:1 scored:unscored) | New content gets exposure while scored content dominates |

---

## Future Considerations

- **Semantic diversity bonus**: Penalize score for memories that are too similar to higher-ranked neighbors in the result set (reduces feed monotony)
- **Surprise factor**: Bonus for memories in unexpected topic areas for the collection (a cooking recipe in a programming collection)
- **Weight tuning via A/B testing**: Experiment with different w1-w6 values and measure rating conversion rates
- **Per-collection weight profiles**: Different collections may benefit from different weight distributions (creative collections -> higher editorial weight)
- **User-adjustable weights**: Let users customize which signals matter most to them (power-user feature)
- **Decay on editorial score**: Re-evaluate editorial score if the memory is edited/updated
- **Cross-collection curated feeds**: Aggregate byCurated across multiple collections for a "best of everything" view

---

**Status**: Design Specification
**Recommendation**: Implement as a new milestone after M26 (App Client Comments). Requires schema migration, REM job restructuring, and engagement counter endpoints.
**Clarifications**: 17
**Related Documents**:
- `agent/design/local.rem-background-relationships.md` (REM infrastructure)
- `agent/design/local.by-discovery-sort-mode.md` (sibling sort mode, interleaving pattern reused)
- `agent/design/local.by-recommendation-sort-mode.md` (sibling sort mode)
- `agent/design/local.memory-ratings.md` (rating_bayesian dependency)
- `agent/milestones/milestone-11-basic-sort-modes.md` (Phase 2 reference: "REM curation")
