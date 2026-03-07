# Task 155: Retrieval Count Threshold Trigger

**Milestone**: M29 — REM Emotional Weighting — Retroactive Reweighting
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: Task 153

---

## Objective

Implement the usage-driven retrieval threshold trigger (Trigger C). When a memory's retrieval count crosses a configured threshold, it is flagged for selective re-evaluation. Frequently retrieved memories are likely more important than their initial scores suggest — this creates the biological "reconsolidation" effect where recalled memories strengthen.

---

## Key Design Decisions

| Decision | Choice | Source |
|----------|--------|--------|
| Trigger type | Usage-driven — fires when retrieval count crosses threshold | Clarification 18-19 |
| Threshold model | Configurable stepped thresholds (e.g., 5, 10, 25, 50) | Design doc: Signal Semantics |
| Fires once per threshold | Crossing threshold 5 fires once; does not fire again until threshold 10 | Design doc: implied by "crosses a threshold" |
| Re-scoring approach | Selective — sub-LLM picks impacted dimensions | Clarification 19 |
| Retrieval context | Retrieval frequency and recency passed as additional context to sub-LLM | Clarification 19 |
| Rich-get-richer dynamic | Frequently retrieved memories become more significant, increasing future retrieval priority | Design doc: Signal Semantics |
| Composite recomputation | Required after partial re-scoring | Design doc: Composite Scores |
| REM metadata updates | `rem_touched_at` and `rem_visits` updated | Design doc: REM Metadata |

---

## Concrete Example

**Trigger C — Retrieval threshold:**

> A tax deadline memory was scored with `functional_urgency: 0.3` at creation — moderately urgent. Over two weeks, the user searches for it 8 times (crossing the threshold at 5). The threshold trigger fires and flags the memory for re-evaluation. The selective re-evaluation (Task 156) identifies `functional_urgency`, `functional_retrieval_utility`, and `functional_salience` as impacted dimensions. After re-scoring: `functional_urgency: 0.9`, `functional_retrieval_utility: 0.85`. The memory's `total_significance` increases substantially, reflecting its demonstrated real-world importance.

---

## Steps

### 1. Define Threshold Configuration

Create a configurable threshold schedule:

```typescript
interface RetrievalThresholdConfig {
  thresholds: number[];  // e.g., [5, 10, 25, 50, 100]
}

const DEFAULT_RETRIEVAL_THRESHOLDS: RetrievalThresholdConfig = {
  thresholds: [5, 10, 25, 50, 100],
};
```

Thresholds should be configurable per collection or globally. Store as a constant with the option to override via REM cycle configuration.

### 2. Track Last Crossed Threshold per Memory

Add tracking to determine which threshold was last crossed for each memory, so the trigger fires exactly once per threshold level:

- Option A: Store `last_retrieval_threshold_crossed` as a Weaviate property on Memory (integer, default 0)
- Option B: Compute from retrieval count — if count >= threshold and the next-lower threshold was already processed (inferred from `rem_touched_at` or a separate flag)

Prefer Option A for simplicity and clarity. This requires adding one property to the Weaviate schema (coordinate with Task 145 schema migration if not already included).

### 3. Implement Threshold Crossing Detection

Create `checkRetrievalThreshold(memory: Memory)` that:

1. Reads the memory's current retrieval count
2. Reads `last_retrieval_threshold_crossed` (default 0)
3. Finds the highest threshold that the retrieval count has crossed
4. If highest crossed threshold > `last_retrieval_threshold_crossed`, return `true` with the new threshold level
5. Otherwise return `false`

```typescript
function checkRetrievalThreshold(
  retrievalCount: number,
  lastCrossed: number,
  thresholds: number[]
): { shouldTrigger: boolean; newThreshold: number } {
  const crossed = thresholds.filter(t => retrievalCount >= t);
  const highest = crossed.length > 0 ? Math.max(...crossed) : 0;
  return {
    shouldTrigger: highest > lastCrossed,
    newThreshold: highest,
  };
}
```

### 4. Wire Threshold Check into Retrieval Path

Integrate the threshold check at the point where memory retrieval count is incremented. When a memory is retrieved (search result returned to user):

1. Increment retrieval count (existing behavior)
2. Call `checkRetrievalThreshold()` with updated count
3. If threshold crossed, flag the memory for re-evaluation

**Flagging approach**: Do NOT trigger re-evaluation inline during a user search request (latency-sensitive). Instead, mark the memory as pending re-evaluation:

- Set a `pending_reeval_trigger: 'retrieval_threshold'` flag (or add to a Firestore queue)
- The next REM cycle picks up pending re-evaluation flags and processes them

### 5. Process Pending Re-evaluations in REM Cycle

During the Reweight phase (Phase 2) of the REM cycle:

1. Query for memories with pending retrieval threshold re-evaluations
2. For each, assemble the re-evaluation context:

```typescript
interface ReEvaluationContext {
  memory: Memory;                          // The candidate memory with current scores
  newRelationships: Relationship[];        // Any relationships (for completeness)
  recentRelatedMemories: Memory[];         // Nearest neighbors
  relationshipObservations: string[];      // Observations from connected memories
  collectionEmotionalAverages: Record<string, number>; // Cached per-cycle
  triggerType: 'retrieval_threshold';      // Discriminator for trigger source
  retrievalMetadata: {
    retrievalCount: number;                // Total retrieval count
    thresholdCrossed: number;              // The threshold that was just crossed
    retrievalFrequency: number;            // Retrievals per week (computed)
    recentRetrievals: number;              // Retrievals in last 14 days
  };
}
```

3. Call selective re-evaluation (Task 156) — the sub-LLM receives retrieval frequency as context and determines which dimensions are impacted by high usage
4. Re-score impacted dimensions, merge, recompute composites
5. Update `last_retrieval_threshold_crossed` to the new threshold
6. Update `rem_touched_at` and increment `rem_visits`
7. Clear the pending re-evaluation flag

### 6. Implement Tests

Create `src/rem/triggers/retrieval-threshold-trigger.spec.ts` (colocated with source):

- Test `checkRetrievalThreshold`: count 3 with thresholds [5,10,25] returns false
- Test `checkRetrievalThreshold`: count 7 with thresholds [5,10,25], lastCrossed 0 returns true, newThreshold 5
- Test `checkRetrievalThreshold`: count 7 with thresholds [5,10,25], lastCrossed 5 returns false (already crossed 5, not yet 10)
- Test `checkRetrievalThreshold`: count 12 with thresholds [5,10,25], lastCrossed 5 returns true, newThreshold 10
- Test that threshold crossing flags memory for pending re-evaluation (not inline)
- Test that REM cycle picks up pending re-evaluations and processes them
- Test that `last_retrieval_threshold_crossed` is updated after processing
- Test that selective re-evaluation receives retrieval metadata in context
- Test that composites are recomputed after partial re-scoring
- Test tax deadline example: 8 retrievals crosses threshold 5, urgency re-scored from 0.3 to higher value

---

## Verification

- [ ] Threshold configuration is defined with sensible defaults `[5, 10, 25, 50, 100]`
- [ ] `checkRetrievalThreshold` correctly detects threshold crossings
- [ ] Trigger fires exactly once per threshold level (not repeatedly at same threshold)
- [ ] Re-evaluation is NOT performed inline during user search (flagged for next REM cycle)
- [ ] Pending re-evaluation flags are picked up by REM cycle Reweight phase
- [ ] Context payload includes retrieval metadata (count, frequency, recency)
- [ ] Selective re-evaluation (Task 156) invoked with `triggerType: 'retrieval_threshold'`
- [ ] Only impacted dimensions are re-scored, not all 31
- [ ] Composite scores (`feel_significance`, `functional_significance`, `total_significance`) recomputed
- [ ] `last_retrieval_threshold_crossed` updated to new threshold after processing
- [ ] `rem_touched_at` updated, `rem_visits` incremented
- [ ] Pending re-evaluation flag cleared after processing
- [ ] All tests pass with mocked dependencies

---

## Expected Output

- `src/rem/triggers/retrieval-threshold-trigger.ts` — threshold detection + flagging + REM cycle processing
- `src/rem/triggers/retrieval-threshold-trigger.spec.ts` — unit tests
- Weaviate property `last_retrieval_threshold_crossed` added to Memory schema (coordinate with Task 145)
- Integration into retrieval path (flagging) and REM cycle Reweight phase (processing)
- Frequently retrieved memories gain significance through the rich-get-richer reconsolidation dynamic

---

**Next Task**: [task-156-selective-reevaluation.md](./task-156-selective-reevaluation.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md` (Retroactive Reweighting, Signal Semantics)
**Clarifications**: 18 (trigger definition), 19 (tax deadline example)
