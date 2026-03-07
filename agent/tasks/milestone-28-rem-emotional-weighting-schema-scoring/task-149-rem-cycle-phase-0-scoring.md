# Task 149: REM Cycle Phase 0 Scoring

**Milestone**: [M28 - REM Emotional Weighting — Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 4 hours
**Dependencies**: Tasks 147, 148
**Status**: Not Started

---

## Objective

Wire emotional scoring into the REM cycle as Phase 0 (before relationship discovery), with configurable batch size, its own cost cap, and prioritized processing of unscored memories.

---

## Context

Emotional scoring runs as Phase 0 in the REM cycle — before relationship discovery (Phase 1) and curation (Phase 2). This ensures emotional data is available for downstream phases. Phase 0 has its own cost cap separate from relationship/curation scoring to allow independent budget control.

Processing priority: unscored memories first (no emotional scores at all), then outdated ones (scored long ago, may need refresh). Batch size is configurable to control how many memories are processed per cycle.

---

## Steps

### 1. Add Phase 0 to REM Job
Insert a new Phase 0 before existing REM phases. Phase 0 selects memories for emotional scoring based on priority (unscored first, then outdated).

### 2. Implement Batch Processing with Configurable Size
Process memories in batches with a configurable batch size. For each memory in the batch, run the per-dimension scoring (Task 147) with context gathering (Task 148).

### 3. Implement Cost Tracking
Track Haiku call costs within Phase 0 against its own cost cap. Stop processing when the cap is reached, even if the batch is not complete.

### 4. Update REM Metadata on Scored Memories
After scoring a memory, update rem_touched_at to current ISO timestamp and increment rem_visits.

---

## Verification

- [ ] Phase 0 runs before relationship discovery in the REM cycle
- [ ] Unscored memories are processed before outdated ones
- [ ] Batch size is configurable
- [ ] Cost tracking respects its own cap separate from other phases
- [ ] Processing stops when cost cap is reached
- [ ] rem_touched_at and rem_visits updated after each scored memory
- [ ] All 31 dimensions scored per memory in the batch
- [ ] Scored values persisted to Weaviate
- [ ] Tests pass

---

## Expected Output

REM cycle includes a Phase 0 that scores memories on all 31 emotional/functional dimensions, respects a configurable batch size and independent cost cap, and updates REM metadata after scoring.

---

**Next Task**: [task-150-composite-score-computation.md](./task-150-composite-score-computation.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
