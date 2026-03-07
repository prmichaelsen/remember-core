# Task 182: REM Curation Step Integration

**Milestone**: M36 — byCurated Sort Mode
**Status**: Not Started
**Estimated Hours**: 4
**Dependencies**: Task 180, Task 181
**Design Reference**: [byCurated Sort Mode](../../design/local.by-curated-sort-mode.md)

---

## Objective

Wire curation scoring as Step 5 in the REM cycle, after relationship CRUD. During each REM cycle, compute curated_score for all candidate memories in the collection.

## Steps

### 1. REM Cycle Step 5

Add curation scoring to `RemService.runCycle()` after existing steps:

```
Step 1: Select candidate memories (existing)
Step 2: Find clusters via embeddings (existing)
Step 3: Haiku cluster validation (existing)
Step 4: Relationship CRUD (existing)
Step 5: Curation Scoring (NEW)
  5a. Haiku editorial pass (memories without editorial_score only)
  5b. Aggregate cluster quality per memory
  5c. Run PageRank on collection's relationship graph
  5d. Read existing ratings + engagement counters
  5e. Compute recency decay
  5f. Combine into curated_score, write to Weaviate
  5g. Store sub-scores in Firestore
Step 6: Update rem_cursor (existing)
```

### 2. CurationScoringStep Service

Create `src/services/curation-step.service.ts`:

```typescript
export interface CurationStepDeps {
  editorialService: EditorialScoringService;
  collection: WeaviateCollection;
  collectionId: string;
  logger: Logger;
}

export interface CurationStepResult {
  memories_scored: number;
  editorial_evaluations: number;  // new Haiku calls (subset of memories_scored)
  skipped: number;
}

export async function runCurationStep(deps: CurationStepDeps, memories: Memory[], relationships: Relationship[]): Promise<CurationStepResult>
```

### 3. Wire into RemService

- Add `CurationStepDeps` as optional dependency on `RemServiceDeps`
- Call `runCurationStep` after relationship CRUD phase
- Track `curation_scored` in `RunCycleResult`
- Skip curation if deps not provided (backward compatible)

### 4. Wire into RemJobWorker

- Add curation step to RemJobWorker step list
- Report curation stats in job progress

### 5. Collection Size Gate

Only run curation on collections with ≥50 memories (same as REM threshold).

## Verification

- [ ] Curation step runs after relationship CRUD in REM cycle
- [ ] Editorial evaluation only called for memories with `editorial_score === 0`
- [ ] PageRank runs on full collection relationship graph
- [ ] `curated_score` written to Weaviate for all scored memories
- [ ] Sub-scores stored in Firestore
- [ ] `RunCycleResult` includes `curation_scored` count
- [ ] RemJobWorker reports curation progress
- [ ] Curation step is optional (skip if deps not provided)
- [ ] Collections < 50 memories skip curation
- [ ] Unit tests with mock collection, relationships, editorial service
