# Task 160: Reconciliation — Coherence Tension Resolution

**Milestone**: [M30 - REM Emotional Weighting — Abstraction, Pruning & Reconciliation](../milestones/milestone-30-rem-emotional-weighting-abstraction-pruning.md)
**Estimated Time**: 4 hours
**Dependencies**: Task 158
**Status**: Not Started

---

## Objective

Implement the reconciliation phase — surface and flag memories with high coherence_tension, detect conflicting memory pairs/clusters, and ensure high-tension memories resist pruning until resolved.

---

## Context

Coherence tension arises when a memory conflicts with the user's established beliefs or other memories. High coherence_tension memories represent unresolved contradictions that deserve attention rather than silent decay. The reconciliation phase identifies these memories, finds conflicting pairs or clusters, and creates flags or REM observations noting the conflict. Critically, high coherence_tension memories resist the graduated pruning from Task 158 — they cannot be decayed or archived until the tension is resolved.

---

## Steps

### 1. Identify High Coherence Tension Memories
Query for memories with feel_coherence_tension above a configurable threshold. These are candidates for reconciliation processing.

### 2. Find Conflicting Memory Pairs/Clusters
For each high-tension memory, search for related memories that conflict with it. Use vector similarity and emotional score patterns to detect contradictions (e.g., opposing sentiments on the same topic).

### 3. Create Reconciliation Flags
Create REM observations or flags that note the detected conflict, referencing the specific memories involved. Include a human-readable description of the tension (e.g., "These two memories express opposing views about X").

### 4. Implement Coherence Tension Resistance to Pruning
Modify the pruning logic from Task 158 to skip memories with feel_coherence_tension above the threshold. These memories should not have their decay increased and cannot be soft-deleted until tension is resolved (score drops below threshold).

### 5. Write Tests
Test tension threshold detection, conflict pair identification, reconciliation flag creation, and pruning resistance for high-tension memories.

---

## Verification

- [ ] Memories with feel_coherence_tension above threshold are identified
- [ ] Conflicting memory pairs/clusters are detected
- [ ] Reconciliation flags created with human-readable conflict descriptions
- [ ] High coherence_tension memories are exempt from decay increases
- [ ] High coherence_tension memories cannot be soft-deleted
- [ ] Pruning resumes normally when tension is resolved (score drops)
- [ ] All tests pass

---

## Expected Output

- Coherence tension threshold configuration
- Conflict detection logic for finding contradictory memory pairs
- Reconciliation flag/observation creation
- Pruning resistance integration with Task 158's decay logic
- Colocated test file(s) with `.spec.ts` suffix
