# Task 155: Retrieval Count Threshold Trigger

**Milestone**: M29 — REM Emotional Weighting — Retroactive Reweighting
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: Task 153

---

## Objective

Implement a trigger that re-evaluates emotional scores when a memory's retrieval count crosses a configured threshold. Frequently retrieved memories are likely more important than their initial scores suggest.

Example: A tax deadline memory scored urgency 0.3 at creation. User searches for it 8 times in 2 weeks. Threshold crossing triggers re-evaluation: urgency jumps to 0.9.

---

## Steps

1. Define threshold configuration (e.g., retrieval count thresholds at 5, 10, 25, 50)
2. Track retrieval counts per memory (leverage existing retrieval tracking or add if missing)
3. Detect when a memory's retrieval count crosses a threshold boundary
4. Flag the memory for re-evaluation during the next REM cycle or trigger immediately
5. Trigger selective re-evaluation (Task 156) with retrieval frequency as additional context
6. Update emotional dimension scores and recompute composite scores

---

## Verification

- [ ] Threshold configuration is defined and tunable
- [ ] Retrieval counts tracked accurately per memory
- [ ] Threshold crossing correctly detected (fires once per threshold, not repeatedly)
- [ ] Re-evaluation triggered with retrieval frequency context
- [ ] Composite scores updated after re-scoring

---

## Expected Output

- Retrieval threshold trigger wired into retrieval tracking
- Memories re-scored when usage patterns indicate higher importance than initial scoring
