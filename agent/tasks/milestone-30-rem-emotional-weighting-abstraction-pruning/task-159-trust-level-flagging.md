# Task 159: Trust-Level Flagging

**Milestone**: [M30 - REM Emotional Weighting — Abstraction, Pruning & Reconciliation](../milestones/milestone-30-rem-emotional-weighting-abstraction-pruning.md)
**Estimated Time**: 3 hours
**Dependencies**: M28 (scoring must exist to detect emotional signals)
**Status**: Not Started

---

## Objective

Implement trust-level flagging — REM flags memories where emotional scores suggest the trust level may be inappropriate, stored as Firestore classifications with dismissal tracking.

---

## Context

Some memories contain sensitive emotional content (high trauma, vulnerability, or shame scores) that may be inadvertently stored with a public trust level. REM should proactively detect these cases and create flags suggesting the user review the trust level. Flags are stored in the Firestore classifications table with type 'trust_level_concern' and include human-readable reasons. Users can dismiss flags, and dismissed flags are tracked to prevent re-flagging the same memory.

---

## Steps

### 1. Implement Flag Detection Rules
Define rules for when a trust-level concern is raised. Primary triggers: high trauma, vulnerability, or shame emotional scores on memories with public or broadly shared trust levels. Configure score thresholds for flagging.

### 2. Create Firestore Classification Entries
Store flags in the Firestore classifications table with type 'trust_level_concern'. Each entry should include the memory ID, the detected concern, and a human-readable reason string (e.g., "This memory discusses childhood trauma — did you mean to make this public?").

### 3. Implement Dismissal Tracking
Allow users to dismiss flags. Track dismissed flags (memory ID + flag type) to prevent the same flag from being re-raised in future REM cycles.

### 4. Add Re-Flagging Prevention
During flag detection, check the dismissal record before creating a new flag. Skip any memory+flag combination that has been previously dismissed.

### 5. Write Tests
Test flag creation for various emotional score combinations, dismissal flow, re-flagging prevention, and edge cases (e.g., private memories should not be flagged).

---

## Verification

- [ ] Flags created for public memories with high trauma/vulnerability/shame scores
- [ ] Flags stored in Firestore classifications with type 'trust_level_concern'
- [ ] Each flag includes a human-readable reason string
- [ ] Users can dismiss flags
- [ ] Dismissed flags are tracked and not re-raised
- [ ] Private memories are not flagged
- [ ] All tests pass

---

## Expected Output

- Flag detection rules with configurable emotional score thresholds
- Firestore classification entries for trust-level concerns
- Dismissal tracking mechanism
- Re-flagging prevention logic
- Colocated test file(s) with `.spec.ts` suffix
