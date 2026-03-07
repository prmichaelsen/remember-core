# Task 175: Plan REM Feature-Complete Milestone Roadmap

**Milestone**: Unassigned (meta-task spanning M30, M32, M34)
**Estimated Time**: 2-3 hours
**Dependencies**: M28, M29 (completed)
**Status**: Completed
**Completed**: 2026-03-07

---

## Objective

Audit the gap between current REM implementation and feature-complete REM cycle, then produce concrete task breakdowns for the remaining milestones (M30, M32, M34).

---

## Audit Results

### M30: Abstraction, Pruning & Reconciliation — READY TO IMPLEMENT

All 4 task files exist with detailed implementation specs (~16 hours total):

| Task | Name | Hours | Files to Create | Ready? |
|------|------|-------|-----------------|--------|
| 157 | Abstraction (Episodic → Semantic) | 5 | `rem.abstraction.ts` + spec | Yes |
| 158 | Pruning (Decay + Soft-Delete) | 4 | `rem.pruning.ts` + spec | Yes |
| 159 | Trust-Level Flagging | 3 | `rem.trust-flagging.ts` + spec | Yes |
| 160 | Reconciliation (Coherence Tension) | 4 | `rem.reconciliation.ts` + spec | Yes |

**Dependencies are correct**: All depend on M28/M29 (complete). Task ordering: 157 → 158 → 159 (independent) → 160.

**Schema gaps to resolve during implementation**:
- `content_type: 'rem'` not yet in content types (Task 157 Step 1 adds it)
- `archived`, `archived_at`, `decay` Weaviate properties not yet in schema (Task 158 adds them)
- Firestore `classifications` table for trust flagging (Task 159 creates it)
- Shared `COHERENCE_TENSION_THRESHOLD = 0.7` constant needed by Tasks 158 + 160

**REM integration pattern**: Tasks 157/158/160 add phases to `runCycle()` after relationship CRUD. Task 159 integrates into Phase 0 as post-scoring pass (not a separate phase).

### M32: Core Mood State — READY TO IMPLEMENT

All 4 task files exist with detailed specs (~14 hours total):

| Task | Name | Hours | Files to Create | Ready? |
|------|------|-------|-----------------|--------|
| 164 | Firestore Mood Schema + MoodService | 3 | `core-state.service.ts` + types | Yes |
| 165 | REM Mood Update | 5 | `rem/mood-update.ts` + spec | Yes |
| 166 | Sub-LLM Narration | 3 | `rem/mood-narration.ts` + spec | Yes |
| 167 | Core Mood Unit Tests | 3 | spec files | Yes |

**Dependencies correct**: M28 (emotional scoring), M10 (REM infrastructure).

**Firestore paths missing** — need to add to `src/database/firestore/paths.ts`:
- `getUserCoreMoodPath(userId)` → `users/{uid}/core/mood`

**Design gaps (minor)**:
- Threshold cycle counter tracking: add `threshold_cycle_counts: Record<string, number>` to CoreMoodMemory
- Pressure magnitude from memories: follow emotional-scoring.service.ts Haiku pattern
- First-narration defaults: initialize empty, derive on first REM cycle

### M34: Classification & User Perception — READY TO IMPLEMENT

All 4 task files exist with detailed specs (~17 hours total):

| Task | Name | Hours | Files to Create | Ready? |
|------|------|-------|-----------------|--------|
| 171 | Classification Schema + Service | 3 | `classification.service.ts` + types | Yes |
| 172 | REM Classification Pipeline | 6 | `rem/classification-pipeline.ts` + spec | Yes |
| 173 | User Perception Service + REM | 5 | `rem/perception-update.ts` + spec | Yes |
| 174 | Classification & Perception Tests | 3 | spec files | Yes |

**Dependencies correct**: M32 (mood state), M10 (REM infrastructure).

**Firestore paths missing** — need to add:
- `getUserClassificationsPath(userId)` → `users/{uid}/core/classifications`
- `getUserPerceptionsPath(ownerId)` → `users/{owner}/core/perceptions`
- `getUserPerceptionPath(ownerId, targetUserId)` → `users/{owner}/core/perceptions/{target}`

**Design gaps (minor)**:
- Contradiction pressure magnitude: define `CONTRADICTION_PRESSURE_MAGNITUDE = -0.15`
- Thematic group normalization: lowercase-hyphenated before storing
- Perception drift rates: need learning_rate constants (slow for identity, moderate for behavior)

---

## RemJobWorker Updates Needed

Current `REM_STEPS` only covers relationship discovery. Full feature-complete cycle needs:

```
{ id: 'emotional-scoring',    label: 'Scoring memories (Phase 0)' }        // M28
{ id: 'candidate-selection',  label: 'Selecting memory candidates' }        // existing
{ id: 'clustering',           label: 'Forming clusters' }                   // existing
{ id: 'haiku-validation',     label: 'Validating clusters with Haiku' }     // existing
{ id: 'relationship-crud',    label: 'Creating/updating relationships' }    // existing
{ id: 'abstraction',          label: 'Abstracting episodic patterns' }      // M30
{ id: 'pruning',              label: 'Pruning low-significance memories' }  // M30
{ id: 'reconciliation',       label: 'Reconciling coherence tension' }      // M30
{ id: 'mood-update',          label: 'Updating core mood state' }           // M32
{ id: 'classification',       label: 'Classifying memories' }               // M34
{ id: 'perception-update',    label: 'Updating user perceptions' }          // M34
```

Phase 0 step and result payload (`phase0` stats) should be added when M30 starts.

---

## Summary: Path to Feature-Complete

### Implementation Order

| Order | Milestone | Tasks | Hours | Produces |
|-------|-----------|-------|-------|----------|
| 1 | **M30** | 157-160 | ~16h | Abstraction memories, pruning, trust flags, reconciliation |
| 2 | **M32** | 164-167 | ~14h | Core mood document, REM drift/decay/narrate |
| 3 | **M34** | 171-174 | ~17h | Classifications, user perceptions |
| — | M33 (optional) | 168-170 | ~7h | Retrieval bias, mood-aware reranking |

**Total to feature-complete: ~47 hours across 12 tasks (3 milestones)**

### What's Blocking?

**Nothing.** All 12 task files exist with detailed implementation specs. All dependencies (M28, M29, M10) are complete. Design docs cover all features. Firestore path helpers are trivial additions. Schema migrations are specified in task steps.

### Recommendation

Start M30 immediately — it's the current milestone and the critical path. Tasks 157-160 can be run via `@acp.proceed --auto`. M32 and M34 follow linearly.

---

**Related Design Docs**:
- `agent/design/local.rem-emotional-weighting.md`
- `agent/design/core-mood-memory.md`
