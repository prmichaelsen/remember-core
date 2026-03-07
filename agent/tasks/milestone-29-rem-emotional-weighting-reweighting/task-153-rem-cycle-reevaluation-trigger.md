# Task 153: REM Cycle Re-evaluation Trigger

**Milestone**: M29 — REM Emotional Weighting — Retroactive Reweighting
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: M28 (Tasks 145-152)

---

## Objective

Implement a REM cycle re-evaluation trigger that re-evaluates recent memories in light of newer context. Each REM cycle identifies memories eligible for re-evaluation and triggers selective re-scoring.

Example: "Met someone named Alex at coffee shop" scored salience 0.2 at creation. Two weeks later, 10 more Alex memories exist. Next REM cycle re-scores salience to 0.7.

---

## Steps

1. Define eligibility criteria for re-evaluation: memories created or updated since last REM touch
2. Implement `getReEvaluationCandidates(userId, lastCycleTimestamp)` — query memories modified or created since last cycle
3. For each candidate, gather updated context (related memories, new relationships, retrieval stats)
4. Trigger selective re-evaluation (Task 156) with the candidate memory and its updated context
5. Update emotional dimension scores and recompute composite scores
6. Record the re-evaluation timestamp to avoid redundant processing in future cycles

---

## Verification

- [ ] Eligible memories correctly identified based on creation/update timestamps
- [ ] Context gathering includes new relationships and recent related memories
- [ ] Selective re-evaluation triggered with correct context payload
- [ ] Composite scores updated after re-scoring
- [ ] Re-evaluation timestamp recorded to prevent redundant processing

---

## Expected Output

- Re-evaluation trigger integrated into REM cycle pipeline
- Memories with stale scores refreshed based on accumulated context
- No impact on memories that have not changed or gained new context
