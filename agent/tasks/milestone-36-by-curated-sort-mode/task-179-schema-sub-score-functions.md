# Task 179: Schema Migration + Sub-Score Functions

**Milestone**: M36 — byCurated Sort Mode
**Status**: Not Started
**Estimated Hours**: 4
**Dependencies**: M10, M20, M28
**Design Reference**: [byCurated Sort Mode](../../design/local.by-curated-sort-mode.md)

---

## Objective

Add 5 new Weaviate properties to Memory collections and implement 6 independent sub-score pure functions that each normalize a quality signal to 0.0-1.0.

## Steps

### 1. Weaviate Schema Properties

Add to Memory collection schema (all default to 0):

```typescript
{ name: 'curated_score', dataType: configure.dataType.NUMBER }
{ name: 'editorial_score', dataType: configure.dataType.NUMBER }
{ name: 'click_count', dataType: configure.dataType.INT }
{ name: 'share_count', dataType: configure.dataType.INT }
{ name: 'comment_count', dataType: configure.dataType.INT }
```

Update `ALL_MEMORY_PROPERTIES` in `src/database/weaviate/client.ts`.

### 2. Sub-Score Functions

Create `src/services/curation-scoring.ts` with 6 pure functions:

1. **recencyScore(created_at, halfLifeDays=90)**: Exponential decay, `Math.exp(-0.693 * ageDays / halfLifeDays)`
2. **normalizedRating(rating_bayesian)**: `(value - 1) / 4`, clamped to [0,1]. Unrated → 3.0 → 0.5
3. **engagementScore(click_count, share_count, comment_count)**: Weighted caps (click/50, share/10, comment/20) at 0.4/0.3/0.3
4. **clusterQualityScore(memoryId, relationships)**: Average REM cluster strength (0.4) + confidence (0.4) + membership bonus (0.2, capped at 10 clusters)
5. **normalizedEditorial(editorial_score)**: Pass-through (already 0.0-1.0 from Haiku)
6. **pageRank(memories, edges, iterations=20, damping=0.85)**: Simplified PageRank on relationship graph, normalized to [0,1]. Limit to top 1000 memories by relationship_count for scaling.

### 3. Weight Constants

```typescript
export const CURATED_WEIGHTS = {
  editorial: 0.30,
  cluster_quality: 0.25,
  graph_centrality: 0.20,
  rating: 0.12,
  recency: 0.08,
  engagement: 0.05,
} as const;
```

## Verification

- [ ] 5 new Weaviate properties added to schema
- [ ] `ALL_MEMORY_PROPERTIES` updated
- [ ] 6 sub-score functions exported from `src/services/curation-scoring.ts`
- [ ] All sub-scores return values in [0.0, 1.0]
- [ ] recencyScore: 90-day-old → 0.5, 180-day → 0.25
- [ ] normalizedRating: unrated (3.0) → 0.5, 5-star → 1.0, 1-star → 0.0
- [ ] engagementScore: caps at 50 clicks, 10 shares, 20 comments
- [ ] PageRank: converges in 20 iterations, normalized
- [ ] PageRank: handles disconnected graphs, empty graphs
- [ ] CURATED_WEIGHTS sum to 1.0
- [ ] Unit tests colocated in `curation-scoring.spec.ts`
