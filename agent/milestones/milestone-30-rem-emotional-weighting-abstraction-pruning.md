# Milestone 30: REM Emotional Weighting — Abstraction, Pruning & Reconciliation

**Goal**: Implement REM abstraction (episodic to semantic memory promotion), graduated pruning (decay + soft-delete), trust-level flagging, and reconciliation (coherence tension resolution).

**Status**: Not Started
**Estimated Duration**: 2 weeks
**Dependencies**: M29 (REM Emotional Weighting — Retroactive Reweighting)

---

## Overview

Advanced REM phases that leverage emotional scores: automatic pattern extraction into synthesized memories, graduated memory decay/pruning, proactive trust-level recommendations, and belief conflict resolution.

Abstraction detects patterns across episodic memories and creates synthesized semantic memories (content_type: 'rem'). Pruning gradually increases decay on low-significance memories and ultimately soft-deletes them. Trust flagging proactively warns when emotional signals suggest a memory's trust level may be inappropriate. Reconciliation surfaces high coherence_tension memories that contradict each other or established patterns.

Design doc: `agent/design/local.rem-emotional-weighting.md`
Clarifications: 18, 19

---

## Deliverables

1. Abstraction engine — pattern detection and synthesized REM memory creation with source relationships
2. Graduated pruning — decay progression and soft-delete for low-significance memories
3. Trust-level flagging — Firestore classifications with dismissal tracking
4. Reconciliation — coherence tension detection and conflict surfacing

---

## Key Decisions (Clarifications 18-19)

- Abstract memories use content_type: 'rem', excluded from search by default, visible in "rem" tab
- Abstract memories linked to source episodic memories via relationships
- Pruning is graduated: increase decay property over successive REM cycles, then soft-delete when threshold crossed
- Soft-deleted memories are archived (hidden from search but recoverable)
- Trust flagging uses Firestore classifications table with type 'trust_level_concern'
- Flags include human-readable reasons (e.g., "This memory discusses childhood trauma — did you mean to make this public?")
- Dismissed flags tracked to prevent re-flagging
- Reconciliation flags memories with high coherence_tension
- High coherence_tension memories resist pruning until resolved

---

## Success Criteria

- [ ] Abstraction creates valid REM memories (content_type: 'rem') with relationships to source episodic memories
- [ ] REM memories excluded from search by default, accessible via opt-in filter
- [ ] Pruning increases decay on low-significance memories over successive REM cycles
- [ ] Memories crossing decay threshold are soft-deleted (archived, hidden from search, recoverable)
- [ ] Trust flags created in Firestore classifications with human-readable reasons
- [ ] Dismissed trust flags tracked and not re-raised
- [ ] Reconciliation surfaces memories with high coherence_tension
- [ ] High coherence_tension memories resist pruning until resolved
- [ ] All unit tests pass
- [ ] Existing REM and search tests unaffected

---

## Tasks

- Task 157: Abstraction — episodic to semantic memory promotion
- Task 158: Pruning — graduated decay and soft-delete
- Task 159: Trust-level flagging
- Task 160: Reconciliation — coherence tension resolution
