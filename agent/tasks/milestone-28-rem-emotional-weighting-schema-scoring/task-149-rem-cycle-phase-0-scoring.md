# Task 149: REM Cycle Phase 0 Scoring

**Milestone**: [M28 - REM Emotional Weighting -- Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 4 hours
**Dependencies**: Tasks 147, 148, 150, 151
**Status**: Not Started

---

## Objective

Wire emotional scoring into the REM cycle as Phase 0 (before relationship discovery), with configurable batch size, its own cost cap separate from relationship/curation scoring, and prioritized processing of unscored memories.

---

## Context

Emotional scoring runs as Phase 0 in the REM cycle -- before relationship discovery (Phase 1) and curation (Phase 2). This ensures emotional data is available for downstream phases. The REM cycle is being restructured to use the remember-core jobs pattern, allowing phases to be split into steps.

Phase 0 has its own cost cap entirely separate from clarification-17's $50/cycle cap for relationship/curation scoring. This allows independent budget control for emotional scoring.

Processing priority: unscored memories first (no emotional scores -- check for null `rem_touched_at`), then outdated ones (scored long ago, may need refresh based on `rem_touched_at` age). Batch size is configurable to control how many memories are processed per cycle, enabling gradual backfill of existing collections.

---

## Key Design Decisions

### Phase 0 Architecture

| Decision | Choice | Rationale |
|---|---|---|
| Phase position | Phase 0 -- before relationship discovery | Emotional data available for downstream phases |
| Cost cap | Own cap, separate from clar-17's $50 cap | Independent budget for emotional scoring |
| Batch size | Configurable per REM cycle | Enables backfill of existing collections |
| Priority | Unscored first, then outdated | New memories get scores before old ones get refreshed |
| Re-scoring | Always re-scores, even with create-time defaults | REM scoring is authoritative |
| Jobs pattern | Use remember-core jobs infrastructure | Phases split into steps |
| Cost per batch | ~$0.75 per 500 memories (31 Haiku calls each) | Budget planning reference |

---

## Steps

### 1. Add Phase 0 to REM Job Definition

Insert a new Phase 0 before existing REM phases in the job definition:
- Phase 0: Score -- Score unscored/outdated memories on all 31 dimensions
- Phase 1: Replay (existing) -- Revisit recent memories weighted by salience
- Phase 2+: Existing phases continue as before

Use the jobs pattern to define Phase 0 as a step in the REM job.

### 2. Implement Memory Selection with Priority

Select memories for scoring in priority order:

```typescript
interface ScoringBatchConfig {
  batch_size: number;          // How many memories to score this cycle
  cost_cap: number;            // Maximum cost for Phase 0 this cycle
  collection_id: string;       // Target collection
}
```

Priority logic:
1. **Unscored memories** -- `rem_touched_at` is null (never scored by REM)
2. **Outdated memories** -- `rem_touched_at` is oldest (scored longest ago)
3. Within each priority tier, process in chronological order (`created_at` ascending)

Query Weaviate for memories matching priority criteria, limited by `batch_size`.

### 3. Implement Batch Processing Loop

For each memory in the selected batch:
1. Gather scoring context (Task 148: relationship observations, nearest-neighbor scores, collection averages)
2. Score all 31 dimensions via per-dimension Haiku calls (Task 147)
3. Compute composite scores: `feel_significance`, `functional_significance`, `total_significance` (Task 150)
4. Update REM metadata: set `rem_touched_at` to current ISO timestamp, increment `rem_visits` (Task 151)
5. Persist all scores + composites + REM metadata to Weaviate in a single update operation
6. Track cumulative cost against cost cap
7. Stop processing if cost cap reached (even mid-batch)

### 4. Implement Cost Tracking

Track Haiku call costs within Phase 0:
- Accumulate cost across all scoring calls in the phase
- Check cost against the Phase 0 cost cap after each memory is scored
- Stop processing when cap is reached, logging how many memories were scored vs. batch size
- Cost tracking is per-cycle (reset at the start of each REM cycle)

### 5. Implement Collection Stats Cache Lifecycle

At the start of Phase 0:
- Invalidate collection stats cache from previous cycle
- Compute fresh collection-level averages (cached for duration of this cycle's Phase 0)

### 6. Wire Into Existing REM Infrastructure

Integrate Phase 0 with the existing REM cycle:
- Phase 0 runs first, completes (or hits cost cap), then hands off to Phase 1
- Phase 0 failures do not block subsequent phases (log and continue)
- Phase 0 reports scoring statistics (memories scored, cost consumed, dimensions scored)

### 7. Write Tests

Create colocated `.spec.ts` tests:
- Phase 0 runs before relationship discovery
- Unscored memories (null `rem_touched_at`) selected before outdated ones
- Batch size limits the number of memories processed
- Cost cap stops processing mid-batch when exceeded
- All 31 dimensions scored per memory
- Composite scores computed after dimension scoring
- `rem_touched_at` set and `rem_visits` incremented after scoring
- All scores persisted to Weaviate
- Collection stats cache invalidated at start of Phase 0
- Phase 0 failures do not block subsequent phases
- Empty collection handled gracefully (no memories to score)

---

## Verification

- [ ] Phase 0 runs before relationship discovery in the REM cycle
- [ ] Unscored memories (null `rem_touched_at`) processed before outdated ones
- [ ] Batch size is configurable and limits processing
- [ ] Cost tracking respects its own cap separate from clar-17's $50 cap
- [ ] Processing stops when cost cap is reached (even mid-batch)
- [ ] All 31 dimensions scored per memory: 21 `feel_*` + 10 `functional_*`
- [ ] Composite scores computed: `feel_significance`, `functional_significance`, `total_significance`
- [ ] `rem_touched_at` updated to current ISO timestamp after scoring
- [ ] `rem_visits` incremented by 1 after scoring
- [ ] All values persisted to Weaviate in single update per memory
- [ ] Collection stats cache invalidated at start of each cycle
- [ ] Phase 0 failures logged but do not block subsequent phases
- [ ] Tests colocated with source file using `.spec.ts` suffix
- [ ] All tests pass

---

## Expected Output

REM cycle includes a Phase 0 that selects memories by priority (unscored first, then outdated), scores them on all 31 emotional/functional dimensions via per-dimension Haiku calls with context, computes composite scores, updates REM metadata, respects a configurable batch size and independent cost cap, and persists all results to Weaviate.

---

**Next Task**: [task-150-composite-score-computation.md](./task-150-composite-score-computation.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
