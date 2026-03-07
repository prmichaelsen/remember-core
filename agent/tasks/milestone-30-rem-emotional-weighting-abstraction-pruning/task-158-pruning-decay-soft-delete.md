# Task 158: Pruning — Graduated Decay and Soft-Delete

**Milestone**: [M30 - REM Emotional Weighting — Abstraction, Pruning & Reconciliation](../milestones/milestone-30-rem-emotional-weighting-abstraction-pruning.md)
**Estimated Time**: 4 hours
**Dependencies**: Task 157
**Status**: Not Started

---

## Objective

Implement graduated pruning — increase the decay property on low-significance memories over successive REM cycles, and soft-delete (archive) memories when decay crosses a threshold.

---

## Context

Not all memories deserve permanent storage. Memories with low total_significance should gradually fade. Pruning operates in two phases: (1) increase the decay property incrementally over successive REM cycles for memories with low total_significance, and (2) when decay crosses a defined threshold, soft-delete the memory — mark it as archived, hide it from search, but keep it recoverable.

This graduated approach prevents abrupt loss and gives the system (and user) time to intervene before a memory is archived.

---

## Steps

### 1. Define Decay Increment Formula
Design the formula for how much decay increases per REM cycle based on total_significance. Lower significance memories should decay faster. Document the formula and threshold values.

### 2. Implement Decay Progression in REM Prune Phase
Add decay increment logic to the REM processing cycle. Each cycle evaluates memories with low total_significance and increases their decay property according to the formula.

### 3. Implement Soft-Delete Threshold and Archival
When a memory's decay property crosses the defined threshold, mark it as archived. Archived memories must be hidden from search results but remain in storage for potential recovery.

### 4. Ensure Archived Memories Are Searchable When Requested
Archived memories should be excluded from default search but recoverable via explicit filter or admin action.

### 5. Write Tests
Test decay increment progression over multiple simulated REM cycles, threshold crossing and archival behavior, search exclusion of archived memories, and recovery of archived memories.

---

## Verification

- [ ] Decay property increases on low-significance memories each REM cycle
- [ ] Decay increment scales inversely with total_significance
- [ ] Memories crossing decay threshold are marked as archived
- [ ] Archived memories excluded from default search results
- [ ] Archived memories are recoverable
- [ ] Multiple REM cycles produce expected cumulative decay
- [ ] All tests pass

---

## Expected Output

- Decay increment formula and threshold constants
- Prune phase logic integrated into REM cycle
- Soft-delete/archival mechanism for memories crossing threshold
- Updated search to exclude archived memories by default
- Colocated test file(s) with `.spec.ts` suffix
