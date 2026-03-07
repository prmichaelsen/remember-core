# Task 181: Composite Curation Scoring + Firestore Storage

**Milestone**: M36 — byCurated Sort Mode
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 179, Task 180
**Design Reference**: [byCurated Sort Mode](../../design/local.by-curated-sort-mode.md)

---

## Objective

Implement the weighted composite scoring function that combines 6 sub-scores into `curated_score`, writes it to Weaviate, and stores the sub-score breakdown in Firestore for API transparency.

## Steps

### 1. Composite Scoring Function

In `src/services/curation-scoring.ts`, add:

```typescript
export function computeCuratedScore(subScores: CuratedSubScores): number {
  return CURATED_WEIGHTS.editorial * subScores.editorial
       + CURATED_WEIGHTS.cluster_quality * subScores.cluster_quality
       + CURATED_WEIGHTS.graph_centrality * subScores.graph_centrality
       + CURATED_WEIGHTS.rating * subScores.rating
       + CURATED_WEIGHTS.recency * subScores.recency
       + CURATED_WEIGHTS.engagement * subScores.engagement;
}
```

### 2. CuratedSubScores Interface

```typescript
export interface CuratedSubScores {
  memory_id: string;
  collection_id: string;
  editorial: number;
  cluster_quality: number;
  graph_centrality: number;
  rating: number;
  recency: number;
  engagement: number;
  composite: number;    // same as curated_score
  scored_at: string;    // ISO timestamp
}
```

### 3. Firestore Storage

Store per-memory sub-scores at `curated_scores/{collection_id}/memories/{memory_id}`:

```typescript
export async function storeCuratedSubScores(subScores: CuratedSubScores): Promise<void>
export async function getCuratedSubScores(collectionId: string, memoryId: string): Promise<CuratedSubScores | null>
```

### 4. Weaviate Write

After computing composite, write `curated_score` to the memory object in Weaviate.

### 5. Batch Scoring Orchestrator

```typescript
export async function scoreBatch(
  memories: MemoryWithProperties[],
  relationships: Relationship[],
  pageRankScores: Map<string, number>,
  collectionId: string,
): Promise<{ scored: number; skipped: number }>
```

Orchestrates: gather sub-scores per memory → compute composite → write Weaviate + Firestore.

## Verification

- [ ] `computeCuratedScore` produces correct weighted sum
- [ ] Composite always in [0.0, 1.0] (since all sub-scores in [0,1] and weights sum to 1)
- [ ] Perfect score (all 1.0) → composite 1.0
- [ ] Zero score (all 0.0) → composite 0.0
- [ ] Firestore storage at correct path
- [ ] Firestore read returns null for unscored memories
- [ ] `curated_score` written to Weaviate
- [ ] Batch scoring processes all memories in batch
- [ ] Unit tests colocated
