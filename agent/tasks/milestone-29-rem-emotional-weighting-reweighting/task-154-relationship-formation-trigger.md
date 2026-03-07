# Task 154: Relationship Formation Trigger

**Milestone**: M29 — REM Emotional Weighting — Retroactive Reweighting
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 153

---

## Objective

Implement a trigger that re-evaluates emotional scores when REM forms a new relationship involving a memory. New relationships can dramatically change a memory's emotional significance.

Example: A banana bread recipe scored salience 0.1. REM later clusters it with "mom's last birthday", "cooking with family", "grief processing through baking". Emotional significance jumps to 0.8.

---

## Steps

1. Hook into REM relationship creation pipeline to detect when new relationships form
2. When a new relationship is created, identify both source and target memories as re-evaluation candidates
3. Gather updated context for each candidate, including the newly formed relationship
4. Trigger selective re-evaluation (Task 156) on both source and target memories
5. Update emotional dimension scores and recompute composite scores for affected memories

---

## Verification

- [ ] Trigger fires on new relationship creation during REM cycle
- [ ] Both source and target memories flagged for re-evaluation
- [ ] Updated context includes the new relationship data
- [ ] Selective re-evaluation invoked with correct context
- [ ] Composite scores updated after re-scoring

---

## Expected Output

- Relationship formation hook integrated into REM relationship creation flow
- Memories re-scored when new relationships reveal hidden emotional significance
