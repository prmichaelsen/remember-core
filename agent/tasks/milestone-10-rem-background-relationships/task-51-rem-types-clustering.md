# Task 51: REM types and clustering algorithm

**Milestone**: [M10 - REM Background Relationships](../../milestones/milestone-10-rem-background-relationships.md)
**Estimated Time**: 4 hours
**Dependencies**: [Task 49](task-49-relationship-service-find-by-memory-ids.md), [Task 50](task-50-collection-enumeration-firestore-state.md)
**Status**: Not Started

---

## Objective

Implement the core clustering algorithm: memory selection (newest/unprocessed/random), greedy agglomerative clustering via findSimilar(), deduplication against existing relationships, and merge/split logic.

---

## Context

This is the algorithmic heart of REM. For each collection run, it selects candidate memories, finds similar neighbors via Weaviate vector search, forms clusters, checks for overlap with existing relationships, and decides whether to create new relationships, merge into existing ones, or split oversized ones.

---

## Steps

### 1. Create src/rem/rem.clustering.ts

#### Memory selection

```typescript
export interface MemoryCandidate {
  id: string;
  content: string;
  created_at: string;
  tags: string[];
}

export async function selectCandidates(
  collection: WeaviateCollection,
  memoryCursor: string,  // created_at cursor for unprocessed third
  count: number,         // total candidates (split into thirds)
): Promise<MemoryCandidate[]>
```

- 1/3 newest: `fetchObjects` sorted by `created_at` desc, limit N/3
- 1/3 unprocessed: `fetchObjects` with `created_at > memoryCursor`, limit N/3
- 1/3 random: `fetchObjects` with random offset or Weaviate's `autocut`/random sampling
- Deduplicate across thirds (same memory may appear in multiple)
- Filter to `doc_type = 'memory'` only

#### Cluster formation

```typescript
export interface Cluster {
  seed_id: string;           // The candidate that seeded this cluster
  memory_ids: string[];      // All memory IDs in cluster (seed + similar)
  memories: MemoryCandidate[]; // Full memory data for Haiku
  avg_similarity: number;    // Average similarity across members
}

export async function formClusters(
  collection: WeaviateCollection,
  candidates: MemoryCandidate[],
  config: RemConfig,
): Promise<Cluster[]>
```

For each candidate:
- Call `findSimilar(candidate.id, min_similarity=config.similarity_threshold, limit=config.max_similar_per_candidate)`
- If < 2 similar: skip
- Form cluster = [candidate] + similar
- Deduplicate clusters that share >80% of the same members (keep the larger one)

#### Dedup against existing relationships

```typescript
export interface ClusterAction {
  type: 'create' | 'merge' | 'skip';
  cluster: Cluster;
  existing_relationship_id?: string;  // For merge
  new_memory_ids?: string[];          // Memory IDs to add on merge
}

export async function resolveClusterActions(
  clusters: Cluster[],
  relationshipService: RelationshipService,
  config: RemConfig,
): Promise<ClusterAction[]>
```

For each cluster:
- Call `relationshipService.findByMemoryIds(cluster.memory_ids)`
- For each existing relationship, compute overlap via `computeOverlap()`
- If any overlap > `config.overlap_merge_threshold`: action = merge (add new IDs to existing)
- Else: action = create

#### Split oversized relationships

```typescript
export function shouldSplit(
  memoryIds: string[],
  config: RemConfig,
): boolean
// Returns true if memoryIds.length > config.max_relationship_members

export function splitCluster(
  cluster: Cluster,
  config: RemConfig,
): Cluster[]
// Splits into sub-clusters of <= max_relationship_members
// Simple strategy: chunk by similarity rank
```

---

## Verification

- [ ] `selectCandidates()` returns deduplicated candidates from 3 selection strategies
- [ ] `formClusters()` produces clusters with >= 3 members (seed + 2 similar)
- [ ] `resolveClusterActions()` correctly identifies create vs. merge actions
- [ ] Overlap > 60% triggers merge, <= 60% triggers create
- [ ] `shouldSplit()` detects oversized relationships
- [ ] `splitCluster()` produces sub-clusters within size limit
- [ ] All functions are pure where possible (testable without Weaviate)
- [ ] Build compiles

---

**Next Task**: [Task 52: Haiku validation client](task-52-haiku-validation.md)
**Related Design Docs**: [REM Design](../../design/local.rem-background-relationships.md) (Clustering Algorithm, Deduplication, Relationship CRUD)
