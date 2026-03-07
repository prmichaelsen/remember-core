# Task 158: Pruning — Graduated Decay and Soft-Delete

**Milestone**: [M30 - REM Emotional Weighting — Abstraction, Pruning & Reconciliation](../milestones/milestone-30-rem-emotional-weighting-abstraction-pruning.md)
**Estimated Time**: 4 hours
**Dependencies**: Task 157, M29 (scoring — `total_significance` must exist on memories)
**Status**: Not Started
**REM Phase**: Phase 4 (Prune)

---

## Key Design Decisions

| Decision | Choice | Source |
|---|---|---|
| Pruning approach | Graduated — increase `decay` property over successive REM cycles | Clarification 19 |
| Pruning signal | Low `total_significance` score (composite of `feel_significance` + `functional_significance`) | Design doc |
| Soft-delete mechanism | Set `deleted_at` timestamp (existing property) — no archival properties needed | Clarification 19, 21 |
| Coherence tension interaction | High `feel_coherence_tension` memories RESIST pruning — implemented in Task 160 | Clarification 19 |
| Urgency decay | Only `functional_urgency` decays per cycle; other dimensions do not decay | Design doc, Clarification 21 |
| Decay exemption logic | Either high agency OR high coherence tension suffices for exemption (OR logic) | Clarification 21 |
| Shared constants | `COHERENCE_TENSION_THRESHOLD` and other shared constants live in `src/services/rem.constants.ts` | Clarification 21 |
| Phase placement | REM Phase 4 (Prune) — runs after Abstract (3) | Design doc |

---

## Signal Semantics for Pruning

- **`total_significance`** is the primary pruning signal — low score = candidate for decay
- **`feel_coherence_tension`** overrides pruning — high tension memories must NOT be decayed (Task 160 implements the guard, but this task must expose the hook)
- **`functional_urgency`** decays naturally — something urgent last week is probably not urgent now
- **`functional_salience`** persists — a surprising event stays surprising even if urgency fades
- **`functional_agency`** matters — memories of the user's own actions are more useful for future planning and should resist pruning slightly

---

## Objective

Implement REM Phase 4 (Prune) — increase the `decay` property on low-significance memories over successive REM cycles, and soft-delete memories (set `deleted_at`) when decay crosses a configurable threshold. High coherence_tension OR high agency memories must be exempted from pruning (hook for Task 160).

---

## Implementation Steps

### 1. Define Decay Increment Formula and Constants

**File**: `src/services/rem.pruning.ts` (new)

- **Constants**:
  - `DECAY_THRESHOLD`: float, default `0.9` — when `decay >= DECAY_THRESHOLD`, soft-delete
  - `MAX_DECAY_INCREMENT`: float, default `0.15` — maximum decay increase per cycle
  - `MIN_DECAY_INCREMENT`: float, default `0.01` — minimum decay increase per cycle (even for moderate-significance memories)
  - `SIGNIFICANCE_FLOOR`: float, default `0.2` — memories below this `total_significance` get maximum decay increment
  - `SIGNIFICANCE_CEILING`: float, default `0.5` — memories above this are not pruning candidates
  - `COHERENCE_TENSION_EXEMPTION_THRESHOLD`: float, default `0.7` — memories with `feel_coherence_tension` above this are exempt from pruning (hook for Task 160). Lives in `src/services/rem.constants.ts`.
  - `AGENCY_EXEMPTION_THRESHOLD`: float, default `0.7` — memories with `functional_agency` above this are exempt from pruning (OR logic with coherence tension)

- **Formula**:
  ```typescript
  function computeDecayIncrement(memory: {
    total_significance: number;
    feel_coherence_tension: number;
    functional_agency: number;
  }): number {
    // Exempt high coherence tension OR high agency (OR logic)
    if (memory.feel_coherence_tension >= COHERENCE_TENSION_EXEMPTION_THRESHOLD) {
      return 0;
    }
    if (memory.functional_agency >= AGENCY_EXEMPTION_THRESHOLD) {
      return 0;
    }

    // Not a pruning candidate if significance is above ceiling
    if (memory.total_significance >= SIGNIFICANCE_CEILING) {
      return 0;
    }

    // Linear interpolation: lower significance = higher decay
    const range = SIGNIFICANCE_CEILING - SIGNIFICANCE_FLOOR;
    const normalized = Math.max(0, memory.total_significance - SIGNIFICANCE_FLOOR) / range;
    let increment = MAX_DECAY_INCREMENT - (normalized * (MAX_DECAY_INCREMENT - MIN_DECAY_INCREMENT));

    return Math.max(MIN_DECAY_INCREMENT, Math.min(MAX_DECAY_INCREMENT, increment));
  }
  ```

- **Progression example** (memory with `total_significance: 0.1`, no coherence tension, no agency):
  - Cycle 1: `decay` 0.0 -> 0.15
  - Cycle 2: `decay` 0.15 -> 0.30
  - Cycle 3: `decay` 0.30 -> 0.45
  - Cycle 4: `decay` 0.45 -> 0.60
  - Cycle 5: `decay` 0.60 -> 0.75
  - Cycle 6: `decay` 0.75 -> 0.90 -- crosses threshold, soft-deleted via `deleted_at`
  - Result: ~6 REM cycles before a very low significance memory is soft-deleted

### 2. Implement Pruning Candidate Selection

**File**: `src/services/rem.pruning.ts`

- Query memories where:
  - `total_significance < SIGNIFICANCE_CEILING` (0.5)
  - `feel_coherence_tension < COHERENCE_TENSION_EXEMPTION_THRESHOLD` (0.7)
  - `content_type != 'rem'` (don't prune REM-generated abstractions)
  - Not already soft-deleted (`deleted_at` is null)
- Sort by `total_significance` ascending (prune lowest-value first)
- Configurable batch size per cycle (e.g., `max_prune_candidates: 50`)

### 3. Implement Decay Progression

**File**: `src/services/rem.pruning.ts`

- For each pruning candidate:
  1. Compute decay increment via `computeDecayIncrement()`
  2. If increment is 0, skip (exempt)
  3. Read current `decay` value (default 0 if unset)
  4. Set new `decay = Math.min(1.0, current_decay + increment)`
  5. Update `rem_touched_at` to current timestamp
  6. Increment `rem_visits`
  7. Update the memory in Weaviate

### 4. Implement Soft-Delete via `deleted_at`

**File**: `src/services/rem.pruning.ts`

- After updating decay, check if `decay >= DECAY_THRESHOLD`
- If threshold crossed:
  1. Set `deleted_at` to the current ISO timestamp on the memory (uses existing `deleted_at` property — no schema changes needed)
  2. Memory remains in Weaviate but is excluded from search by the existing soft-delete filter
- **Recovery**: Soft-deleted memories can be restored by clearing `deleted_at` and resetting `decay` to 0
- **NOTE**: Do NOT use `archived` or `archived_at` properties — pruning uses only decay + `deleted_at`

### 5. Implement Urgency Decay

**File**: `src/services/rem.pruning.ts`

- As part of the prune phase, also decay `functional_urgency` on all memories:
  - `functional_urgency *= 0.9` per cycle (10% decay)
  - This is separate from the `decay` property — urgency naturally loses relevance over time
  - `functional_salience` is NOT decayed (surprise/novelty persists)

### 6. Wire into REM Cycle as Phase 4

**Files**: `src/services/rem.service.ts`, `src/services/rem-job.worker.ts`

- Add Phase 4 (Prune) to `RemService.runCycle()` after Phase 3 (Abstract)
- Add a new step to `REM_STEPS`:
  ```typescript
  { id: 'pruning', label: 'Pruning low-significance memories' }
  ```
- Call `runPruningPhase(collectionId)` which:
  1. Selects pruning candidates
  2. Applies decay increments
  3. Soft-deletes memories crossing threshold (sets `deleted_at`)
  4. Decays urgency scores
- Track stats in `RunCycleResult`:
  - `memories_decayed: number` — memories that had decay increased
  - `memories_soft_deleted: number` — memories that crossed threshold and were soft-deleted

### 7. Write Tests

**File**: `src/services/rem.pruning.spec.ts`

Tests to implement:

- **Decay formula**: Verify increment scales inversely with `total_significance`
- **Coherence tension exemption**: Memories with high `feel_coherence_tension` get 0 increment (hook for Task 160)
- **Agency exemption**: High `functional_agency` memories get 0 increment (OR logic with coherence tension)
- **Multi-cycle progression**: Simulate 6 cycles — verify decay accumulates correctly and triggers soft-delete
- **Threshold crossing**: Memory at `decay: 0.85` with increment `0.10` crosses threshold and gets soft-deleted (`deleted_at` set)
- **Soft-deleted search exclusion**: Soft-deleted memories not returned in default search (existing behavior)
- **Soft-delete recovery**: Clearing `deleted_at` and resetting `decay` makes memory searchable again
- **REM memory exemption**: `content_type: 'rem'` memories are not pruning candidates
- **Urgency decay**: `functional_urgency` reduces by 10% per cycle; `functional_salience` unchanged
- **Significance ceiling**: Memories with `total_significance >= 0.5` are not pruning candidates

---

## Verification Checklist

- [ ] `computeDecayIncrement()` returns correct values for various significance/tension/agency combinations
- [ ] Decay property increases on low-significance memories each REM cycle
- [ ] Decay increment scales inversely with `total_significance`
- [ ] High coherence tension memories are exempt from decay (increment = 0)
- [ ] High agency memories are exempt from decay (increment = 0, OR logic with coherence tension)
- [ ] Memories crossing `DECAY_THRESHOLD` (0.9) are soft-deleted via `deleted_at`
- [ ] Soft-deleted memories excluded from default search results (existing behavior)
- [ ] Soft-deleted memories are recoverable by clearing `deleted_at` and resetting `decay`
- [ ] `content_type: 'rem'` memories are never pruning candidates
- [ ] `functional_urgency` decays 10% per cycle
- [ ] `functional_salience` is NOT decayed
- [ ] Multiple REM cycles produce expected cumulative decay
- [ ] Phase 4 (Prune) wired into REM cycle after Phase 3 (Abstract)
- [ ] `memories_decayed` and `memories_soft_deleted` tracked in `RunCycleResult`
- [ ] `rem_touched_at` and `rem_visits` updated on decayed memories
- [ ] All tests pass — colocated at `src/services/rem.pruning.spec.ts`

---

## Expected Output

- `src/services/rem.pruning.ts` — decay formula, candidate selection, decay progression, soft-delete, urgency decay
- `src/services/rem.pruning.spec.ts` — colocated tests
- Updated `src/services/rem.service.ts` — Phase 4 integration
- Updated `src/services/rem-job.worker.ts` — new `pruning` step
- No Weaviate schema changes needed — uses existing `deleted_at` property for soft-delete
