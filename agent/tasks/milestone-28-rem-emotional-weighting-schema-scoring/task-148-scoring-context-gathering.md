# Task 148: Scoring Context Gathering

**Milestone**: [M28 - REM Emotional Weighting — Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 4 hours
**Dependencies**: Task 147
**Status**: Not Started

---

## Objective

Implement context gathering for Haiku scoring calls, assembling relevant contextual information from three sources to improve scoring accuracy.

---

## Context

Scoring a memory in isolation produces less accurate results than scoring with context. Three context sources enrich the scoring prompt:

1. **Relationship observation texts** — observations from memories connected via REM relationships, providing narrative context about how this memory relates to others.
2. **Nearest-neighbor emotional scores** — emotional scores from 3-5 similar memories (by embedding similarity), providing calibration anchors for consistent scoring.
3. **Collection-level emotional averages** — average scores per dimension across the collection, computed once per REM cycle and cached, providing baseline context.

Additionally, memory metadata (content_type, created_at) is included — but NOT tags.

---

## Steps

### 1. Implement Relationship Context Fetcher
Fetch observation texts from memories connected to the target memory via REM relationships. Return as structured context for the scoring prompt.

### 2. Implement Nearest-Neighbor Context Fetcher
Use the memory's embedding to find 3-5 most similar memories that already have emotional scores. Extract their dimension scores as calibration anchors.

### 3. Implement Collection Stats Computer/Cache
Compute per-dimension averages across all scored memories in the collection. Cache the result for the duration of one REM cycle to avoid recomputing per memory.

### 4. Assemble Context for Scoring Calls
Combine all three context sources plus memory metadata (content_type, created_at) into a structured context object that the scoring service (Task 147) can include in its Haiku prompts.

---

## Verification

- [ ] Relationship observations fetched from connected memories
- [ ] Nearest-neighbor fetcher returns 3-5 similar memories with existing scores
- [ ] Collection averages computed correctly across scored memories
- [ ] Collection averages cached per cycle (not recomputed per memory)
- [ ] Assembled context includes all three sources + metadata
- [ ] Context excludes tags (only content_type, created_at from metadata)
- [ ] Graceful handling when context sources are empty (no relationships, no scored neighbors)
- [ ] Tests pass

---

## Expected Output

A context gathering module that assembles relationship observations, nearest-neighbor scores, and collection averages into a structured context object for use by the per-dimension Haiku scoring service.

---

**Next Task**: [task-149-rem-cycle-phase-0-scoring.md](./task-149-rem-cycle-phase-0-scoring.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
