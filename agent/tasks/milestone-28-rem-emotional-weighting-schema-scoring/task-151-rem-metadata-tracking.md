# Task 151: REM Metadata Tracking

**Milestone**: [M28 - REM Emotional Weighting — Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 149
**Status**: Not Started

---

## Objective

Track rem_touched_at and rem_visits on memories to record when and how often REM has processed each memory.

---

## Context

REM metadata enables prioritization of which memories to score next (unscored vs. outdated) and provides observability into REM coverage. rem_touched_at records the last time REM scored/updated a memory, and rem_visits counts the total number of times REM has processed it.

---

## Steps

### 1. Update REM Scoring to Set Metadata
After REM scores a memory (in Phase 0), set rem_touched_at to the current ISO timestamp and increment rem_visits by 1.

### 2. Add to Memory Response Types
Include rem_touched_at and rem_visits in the memory response types so they are visible when querying memories.

---

## Verification

- [ ] rem_touched_at set to current ISO timestamp after REM scores a memory
- [ ] rem_visits incremented by 1 after each REM processing
- [ ] rem_visits starts at 0 for new memories (from schema default)
- [ ] Both fields visible in memory response types
- [ ] Fields correctly persisted and retrievable from Weaviate
- [ ] Tests pass

---

## Expected Output

Every memory processed by REM has an updated rem_touched_at timestamp and an incremented rem_visits counter, both visible in API responses.

---

**Next Task**: [task-152-by-property-sort-mode.md](./task-152-by-property-sort-mode.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
