# Task 148: Scoring Context Gathering

**Milestone**: [M28 - REM Emotional Weighting -- Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 4 hours
**Dependencies**: Task 147
**Status**: Not Started

---

## Objective

Implement context gathering for Haiku scoring calls, assembling relevant contextual information from three sources to improve scoring accuracy: relationship observation texts, nearest-neighbor emotional scores, and collection-level averages.

---

## Context

Scoring a memory in isolation produces less accurate results than scoring with context. The design doc specifies three context sources that enrich each Haiku scoring prompt, plus memory metadata. This task builds the infrastructure to gather and assemble this context before scoring calls.

---

## Key Design Decisions

### Context Sources

| Decision | Choice | Rationale |
|---|---|---|
| Context source 1 | Relationship `observation` texts from connected memories | Provides narrative context about how the memory relates to others |
| Context source 2 | Nearest-neighbor emotional scores (3-5 similar memories by embedding) | Calibration anchors for consistent scoring |
| Context source 3 | Collection-level emotional averages (cached per REM cycle) | Baseline context for relative scoring |
| Memory metadata included | `content_type` and `created_at` only | Design doc explicitly excludes tags |
| Tags | Excluded | Per clarification 18-19 |
| Collection stats caching | Computed once per REM cycle, cached | Avoid recomputing per memory |
| Neighbor count | 3-5 most similar memories | Balance between context and prompt size |

---

## Steps

### 1. Define ScoringContext Interface

```typescript
interface ScoringContext {
  // Memory's own metadata
  metadata: {
    content_type: string;
    created_at: string;
  };

  // Source 1: Relationship observations
  relationshipObservations: Array<{
    observation: string;
    relationship_type?: string;
  }>;

  // Source 2: Nearest-neighbor scores
  nearestNeighbors: Array<{
    content_preview: string;  // truncated content for context
    scores: Partial<Record<string, number>>;  // property -> score
  }>;

  // Source 3: Collection-level averages
  collectionAverages: Partial<Record<string, number>>;  // property -> avg score
}
```

### 2. Implement Relationship Context Fetcher

Fetch `observation` texts from memories connected to the target memory via REM relationships:
- Query relationships table for the target memory's UUID
- For each related memory, retrieve its `observation` field from Weaviate
- Return as structured array with observation text and relationship type
- Handle case where memory has no relationships (return empty array)
- Handle case where related memories have no observation (skip them)

### 3. Implement Nearest-Neighbor Context Fetcher

Use the memory's embedding vector to find 3-5 most similar memories that already have emotional scores:
- Perform vector similarity search in Weaviate using the target memory's embedding
- Filter to only memories that have at least some scored dimensions (check for non-null `feel_emotional_significance` or `total_significance` as proxy)
- Return 3-5 results with their content preview and all 31 dimension scores
- Handle case where no scored neighbors exist (return empty array)

The 31 dimension properties to retrieve from neighbors:

**Layer 1 (21):** `feel_emotional_significance`, `feel_vulnerability`, `feel_trauma`, `feel_humor`, `feel_happiness`, `feel_sadness`, `feel_fear`, `feel_anger`, `feel_surprise`, `feel_disgust`, `feel_contempt`, `feel_embarrassment`, `feel_shame`, `feel_guilt`, `feel_excitement`, `feel_pride`, `feel_valence`, `feel_arousal`, `feel_dominance`, `feel_intensity`, `feel_coherence_tension`

**Layer 2 (10):** `functional_salience`, `functional_urgency`, `functional_social_weight`, `functional_agency`, `functional_novelty`, `functional_retrieval_utility`, `functional_narrative_importance`, `functional_aesthetic_quality`, `functional_valence`, `functional_coherence_tension`

### 4. Implement Collection Stats Computer/Cache

Compute per-dimension averages across all scored memories in the collection:
- Query all memories in the collection that have at least one scored dimension
- Compute average for each of the 31 dimensions (ignoring null values)
- Cache the result for the duration of one REM cycle
- Provide a cache invalidation mechanism for the start of each new cycle
- Handle empty collections or collections with no scored memories (return empty object)

```typescript
interface CollectionStatsCache {
  compute(collectionId: string): Promise<Partial<Record<string, number>>>;
  invalidate(collectionId: string): void;
  invalidateAll(): void;
}
```

### 5. Assemble Context for Scoring Calls

Create an assembler function that combines all three context sources:

```typescript
async function gatherScoringContext(
  memory: Memory,
  collectionId: string,
  statsCache: CollectionStatsCache
): Promise<ScoringContext>
```

- Fetch relationship observations, nearest neighbors, and collection averages in parallel where possible
- Assemble into the `ScoringContext` interface
- Include memory metadata (`content_type`, `created_at`) -- NOT tags

### 6. Write Tests

Create colocated `.spec.ts` tests:
- Relationship fetcher returns observations from connected memories
- Relationship fetcher returns empty array when no relationships exist
- Nearest-neighbor fetcher returns 3-5 similar memories with scores
- Nearest-neighbor fetcher filters out unscored memories
- Nearest-neighbor fetcher returns empty array when no scored neighbors exist
- Collection stats correctly computes averages across scored memories
- Collection stats ignores null values in average computation
- Collection stats cache is reused within a cycle (not recomputed per memory)
- Collection stats cache invalidates correctly
- Assembled context includes all three sources plus metadata
- Assembled context does NOT include tags
- Graceful handling when all context sources are empty

---

## Verification

- [ ] `ScoringContext` interface defined with all three context sources + metadata
- [ ] Relationship observations fetched from connected memories' `observation` field
- [ ] Nearest-neighbor fetcher returns 3-5 similar memories with existing scores
- [ ] Nearest-neighbor fetcher retrieves all 31 dimension properties
- [ ] Collection averages computed correctly across scored memories
- [ ] Collection averages cached per cycle (not recomputed per memory)
- [ ] Cache invalidation works at start of new REM cycle
- [ ] Assembled context includes `content_type` and `created_at` from metadata
- [ ] Assembled context excludes tags
- [ ] Graceful handling when context sources are empty (no relationships, no scored neighbors, no collection stats)
- [ ] Tests colocated with source file using `.spec.ts` suffix
- [ ] All tests pass

---

## Expected Output

A context gathering module that assembles relationship observations, nearest-neighbor scores (3-5 similar memories), and collection-level averages (cached per REM cycle) into a structured `ScoringContext` object. The context object is consumed by the per-dimension Haiku scoring service (Task 147) and included in each scoring prompt.

---

**Next Task**: [task-149-rem-cycle-phase-0-scoring.md](./task-149-rem-cycle-phase-0-scoring.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
