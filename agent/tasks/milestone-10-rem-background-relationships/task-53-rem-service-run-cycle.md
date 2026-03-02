# Task 53: RemService — runCycle orchestration

**Milestone**: [M10 - REM Background Relationships](../../milestones/milestone-10-rem-background-relationships.md)
**Estimated Time**: 4 hours
**Dependencies**: [Task 51](task-51-rem-types-clustering.md), [Task 52](task-52-haiku-validation.md)
**Status**: Not Started

---

## Objective

Create the `RemService` class that orchestrates a single REM cycle: load cursor, pick collection, select memories, form clusters, validate with Haiku, execute relationship CRUD, and persist state. This is the top-level entry point that Cloud Run calls.

---

## Context

`RemService` is the composition layer. It wires together all the pieces from tasks 48-52 into a single `runCycle()` method. Following remember-core's DI pattern, it accepts all dependencies via constructor. The Cloud Run handler is a thin wrapper that creates the service and calls `runCycle()`.

---

## Steps

### 1. Create src/rem/rem.service.ts

```typescript
export interface RemServiceDeps {
  weaviateClient: WeaviateClient;
  memoryService: MemoryService;
  relationshipService: RelationshipService;
  stateStore: RemStateStore;
  haikuClient: HaikuClient;
  config?: Partial<RemConfig>;
  logger?: Logger;
}

export interface RunCycleResult {
  collection_id: string | null;   // null if no eligible collection
  memories_scanned: number;
  clusters_found: number;
  relationships_created: number;
  relationships_merged: number;
  relationships_split: number;
  skipped_by_haiku: number;
  duration_ms: number;
}

export class RemService {
  constructor(deps: RemServiceDeps);

  async runCycle(): Promise<RunCycleResult>;
}
```

### 2. Implement runCycle()

Orchestration flow:

1. **Load cursor**: `stateStore.getCursor()` → get `last_collection_id`
2. **List collections**: `listMemoryCollections(weaviateClient)`
3. **Pick next**: Find collection after `last_collection_id` (wrap around if at end)
4. **Check size**: Fetch collection object count; skip if < `config.min_collection_size`
5. **Load collection state**: `stateStore.getCollectionState(collectionId)` → get memory_cursor
6. **Select candidates**: `selectCandidates(collection, memoryCursor, config.max_candidates_per_run)`
7. **Form clusters**: `formClusters(collection, candidates, config)`
8. **Resolve actions**: `resolveClusterActions(clusters, relationshipService, config)`
9. **For each action**:
   - If `create`: validate with Haiku → if valid, `relationshipService.create()` with `source: 'rem'`
   - If `merge`: add new memory IDs to existing relationship via `relationshipService.update()`
   - Check split after merge: if > 50 members, split
10. **Save state**: Update cursor and collection state in Firestore
11. **Return result**: Aggregate stats

### 3. Handle edge cases

- No collections exist → return early with null collection_id
- All collections below min size → skip, advance cursor
- No candidates selected → advance cursor, save state
- Haiku API failure → skip cluster (don't fail entire cycle)
- Weaviate query failure → log error, skip candidate, continue

### 4. Wire MemoryService for collection context

`RemService` needs to operate on different collections per run. The constructor receives a Weaviate client, and `runCycle()` creates a collection handle for the target collection:

```typescript
const collection = weaviateClient.collections.get(collectionId);
```

The `MemoryService` and `RelationshipService` received via DI should be configured to operate on the correct collection for the current cycle. Consider accepting a factory or reconfiguring per-cycle.

### 5. Update rem/index.ts barrel

Export `RemService`, `RemServiceDeps`, `RunCycleResult`.

---

## Verification

- [ ] `RemService` class with `runCycle()` method
- [ ] Cursor-based collection selection with wrap-around
- [ ] Collections below min_collection_size skipped
- [ ] Full pipeline: select → cluster → dedup → validate → CRUD
- [ ] Created relationships have `source: 'rem'`
- [ ] Merged relationships update existing with new member IDs
- [ ] Split triggered at 50+ members
- [ ] Haiku failures don't crash the cycle
- [ ] Firestore state persisted after each run
- [ ] `RunCycleResult` returns accurate stats
- [ ] Build compiles

---

**Next Task**: [Task 54: Unit tests for REM modules](task-54-rem-unit-tests.md)
**Related Design Docs**: [REM Design](../../design/local.rem-background-relationships.md) (full document — this task implements the orchestration)
