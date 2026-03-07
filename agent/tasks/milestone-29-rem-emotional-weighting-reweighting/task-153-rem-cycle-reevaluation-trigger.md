# Task 153: REM Cycle Re-evaluation Trigger

**Milestone**: M29 — REM Emotional Weighting — Retroactive Reweighting
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: M28 (Tasks 145-152)

---

## Objective

Implement the periodic REM cycle re-evaluation trigger (Trigger A). Each REM cycle identifies memories whose emotional scores may be stale due to accumulated newer context, and triggers selective re-scoring via Task 156.

---

## Key Design Decisions

| Decision | Choice | Source |
|----------|--------|--------|
| Trigger type | Periodic — runs every REM cycle | Clarification 18-19 |
| What gets re-evaluated | Recent memories that have gained new context since last `rem_touched_at` | Design doc: Retroactive Reweighting |
| Re-scoring approach | Selective — only impacted dimensions, not all 31 | Clarification 19 |
| Composite recomputation | Required after partial re-scoring (`feel_significance`, `functional_significance`, `total_significance`) | Design doc: Composite Scores |
| REM metadata updates | `rem_touched_at` set to current timestamp, `rem_visits` incremented | Design doc: REM Metadata |
| Scoring is authoritative | REM always re-scores, even if create-time defaults exist | Clarification 18 |
| Phase placement | Runs during Reweight phase (Phase 2) of REM cycle, after Phase 0 scoring and Phase 1 replay | Design doc: Enhanced REM Cycle |

---

## Concrete Example

**Trigger A — REM cycle re-evaluation:**

> "Met someone named Alex at coffee shop" scored `functional_salience: 0.2` at creation. Over the next two weeks, 10 more memories mentioning Alex are created. On the next REM cycle, this trigger identifies the original Alex memory as a re-evaluation candidate because new related memories exist. The selective re-evaluation (Task 156) determines that `functional_salience` and `functional_narrative_importance` are impacted. Re-scoring produces `functional_salience: 0.7`. Composites are recomputed. `rem_touched_at` updated, `rem_visits` incremented.

---

## Steps

### 1. Define Eligibility Criteria

Implement `getReEvaluationCandidates(userId, collectionId, lastCycleTimestamp)` that queries Weaviate for memories eligible for periodic re-evaluation. A memory is eligible if ANY of the following are true:

- **New context available**: Memory has relationships formed since its last `rem_touched_at`
- **Stale scores**: Memory was created or updated since last `rem_touched_at` but scores have not been refreshed
- **Related memory growth**: The count of semantically similar memories (nearest neighbors) has grown significantly since last scoring (e.g., the Alex scenario — 10 new related memories)

Query approach: Fetch memories where `rem_touched_at < lastCycleTimestamp` OR `rem_touched_at IS NULL`, then filter to those with meaningful new context (not just any memory that exists).

### 2. Gather Updated Context per Candidate

For each candidate memory, assemble the re-evaluation context payload:

```typescript
interface ReEvaluationContext {
  memory: Memory;                          // The candidate memory with current scores
  newRelationships: Relationship[];        // Relationships formed since last rem_touched_at
  recentRelatedMemories: Memory[];         // New memories semantically similar (3-5 nearest neighbors)
  relationshipObservations: string[];      // Observation texts from connected memories
  collectionEmotionalAverages: Record<string, number>; // Cached per-cycle collection stats
  triggerType: 'rem_cycle';                // Discriminator for trigger source
}
```

Reuse context gathering infrastructure from Task 148 (scoring context gathering). The collection-level emotional averages should be computed once per REM cycle and cached, not recomputed per memory.

### 3. Invoke Selective Re-evaluation

For each candidate with its context, call the selective re-evaluation pipeline (Task 156):

1. Call `analyzeImpactedDimensions(memory, context)` to get the array of dimensions to re-score
2. Re-score only those dimensions via per-dimension Haiku calls (Task 147 scoring service)
3. Merge new partial scores with existing scores
4. Recompute `feel_significance`, `functional_significance`, `total_significance` (Task 150 composite computation)

### 4. Update REM Metadata

After re-evaluation completes for each memory:

- Set `rem_touched_at` to current ISO timestamp
- Increment `rem_visits` by 1
- Persist all score changes + metadata in a single Weaviate update operation

### 5. Wire into REM Cycle Pipeline

Integrate this trigger into the REM job's Reweight phase (Phase 2). The trigger should:

- Run after Phase 0 (scoring) and Phase 1 (replay) complete
- Process candidates in configurable batch sizes (same pattern as Phase 0 backfill)
- Respect the emotional scoring cost cap (separate from clarification-17's $50/cycle relationship cap)
- Log the number of candidates evaluated and dimensions re-scored per cycle

### 6. Implement Tests

Create `src/rem/triggers/rem-cycle-trigger.spec.ts` (colocated with source):

- Test eligibility criteria: memory with new relationships is eligible, memory with no new context is not
- Test that context payload is correctly assembled with new relationships and related memories
- Test that selective re-evaluation is invoked (mock Task 156 pipeline)
- Test that `rem_touched_at` and `rem_visits` are updated after re-evaluation
- Test that composites are recomputed after partial re-scoring
- Test batch size limits are respected
- Test that memories already touched this cycle are skipped

---

## Verification

- [ ] `getReEvaluationCandidates` correctly identifies memories with stale scores and new context
- [ ] Memories with no new context since last `rem_touched_at` are excluded (not re-evaluated unnecessarily)
- [ ] Context payload includes new relationships, recent related memories, and collection averages
- [ ] Selective re-evaluation (Task 156) invoked with correct `triggerType: 'rem_cycle'`
- [ ] Only impacted dimensions are re-scored, not all 31
- [ ] Composite scores (`feel_significance`, `functional_significance`, `total_significance`) recomputed after partial re-scoring
- [ ] `rem_touched_at` updated to current timestamp after re-evaluation
- [ ] `rem_visits` incremented by 1 after re-evaluation
- [ ] Batch size limits respected — cycle does not process more than configured max
- [ ] Emotional scoring cost cap enforced (separate from relationship scoring cap)
- [ ] Collection emotional averages computed once per cycle, not per memory
- [ ] All tests pass with mocked Weaviate and Haiku responses
- [ ] No regression in existing REM cycle phases

---

## Expected Output

- `src/rem/triggers/rem-cycle-trigger.ts` — eligibility query + context gathering + orchestration
- `src/rem/triggers/rem-cycle-trigger.spec.ts` — unit tests
- Integration into REM job Reweight phase (Phase 2)
- Memories with accumulated new context get refreshed scores each REM cycle

---

**Next Task**: [task-154-relationship-formation-trigger.md](./task-154-relationship-formation-trigger.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md` (Retroactive Reweighting section)
**Clarifications**: 18 (trigger definition), 19 (Alex coffee shop example)
