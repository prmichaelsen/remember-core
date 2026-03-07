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
| Soft-delete mechanism | Mark as archived, hide from search, but keep recoverable | Clarification 19 |
| Coherence tension interaction | High `feel_coherence_tension` memories RESIST pruning — implemented in Task 160 | Clarification 19 |
| Urgency decay | `functional_urgency` should decay over time but `functional_salience` might persist | Design doc |
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

Implement REM Phase 4 (Prune) — increase the `decay` property on low-significance memories over successive REM cycles, and soft-delete (archive) memories when decay crosses a configurable threshold. High coherence_tension memories must be exempted from pruning (hook for Task 160).

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
  - `COHERENCE_TENSION_EXEMPTION_THRESHOLD`: float, default `0.7` — memories with `feel_coherence_tension` above this are exempt from pruning (hook for Task 160)
  - `AGENCY_RESISTANCE_BONUS`: float, default `0.05` — subtracted from decay increment for high-agency memories (`functional_agency > 0.7`)

- **Formula**:
  ```typescript
  function computeDecayIncrement(memory: {
    total_significance: number;
    feel_coherence_tension: number;
    functional_agency: number;
  }): number {
    // Exempt high coherence tension (Task 160 hook)
    if (memory.feel_coherence_tension >= COHERENCE_TENSION_EXEMPTION_THRESHOLD) {
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

    // Agency resistance: own-action memories decay slower
    if (memory.functional_agency > 0.7) {
      increment = Math.max(MIN_DECAY_INCREMENT, increment - AGENCY_RESISTANCE_BONUS);
    }

    return Math.max(MIN_DECAY_INCREMENT, Math.min(MAX_DECAY_INCREMENT, increment));
  }
  ```

- **Progression example** (memory with `total_significance: 0.1`, no coherence tension, no agency):
  - Cycle 1: `decay` 0.0 -> 0.15
  - Cycle 2: `decay` 0.15 -> 0.30
  - Cycle 3: `decay` 0.30 -> 0.45
  - Cycle 4: `decay` 0.45 -> 0.60
  - Cycle 5: `decay` 0.60 -> 0.75
  - Cycle 6: `decay` 0.75 -> 0.90 -- crosses threshold, soft-deleted
  - Result: ~6 REM cycles before a very low significance memory is archived

### 2. Implement Pruning Candidate Selection

**File**: `src/services/rem.pruning.ts`

- Query memories where:
  - `total_significance < SIGNIFICANCE_CEILING` (0.5)
  - `feel_coherence_tension < COHERENCE_TENSION_EXEMPTION_THRESHOLD` (0.7)
  - `content_type != 'rem'` (don't prune REM-generated abstractions)
  - Not already archived
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

### 4. Implement Soft-Delete (Archival)

**File**: `src/services/rem.pruning.ts`

- After updating decay, check if `decay >= DECAY_THRESHOLD`
- If threshold crossed:
  1. Set `archived: true` on the memory (add `archived` boolean property to Weaviate schema if not present)
  2. Set `archived_at` timestamp
  3. Memory remains in Weaviate but is excluded from search
- **Recovery**: Archived memories can be restored by setting `archived: false` and resetting `decay` to 0

### 5. Add Search Exclusion for Archived Memories

**File**: `src/services/memory.service.ts`

- In all search/list methods, add filter to exclude archived memories by default:
  ```typescript
  filters.push(this.collection.filter.byProperty('archived').notEqual(true));
  ```
- Add an `include_archived` parameter to search/list inputs to opt-in to seeing archived memories

### 6. Implement Urgency Decay

**File**: `src/services/rem.pruning.ts`

- As part of the prune phase, also decay `functional_urgency` on all memories:
  - `functional_urgency *= 0.9` per cycle (10% decay)
  - This is separate from the `decay` property — urgency naturally loses relevance over time
  - `functional_salience` is NOT decayed (surprise/novelty persists)

### 7. Wire into REM Cycle as Phase 4

**Files**: `src/services/rem.service.ts`, `src/services/rem-job.worker.ts`

- Add Phase 4 (Prune) to `RemService.runCycle()` after Phase 3 (Abstract)
- Add a new step to `REM_STEPS`:
  ```typescript
  { id: 'pruning', label: 'Pruning low-significance memories' }
  ```
- Call `runPruningPhase(collectionId)` which:
  1. Selects pruning candidates
  2. Applies decay increments
  3. Archives memories crossing threshold
  4. Decays urgency scores
- Track stats in `RunCycleResult`:
  - `memories_decayed: number` — memories that had decay increased
  - `memories_archived: number` — memories that crossed threshold and were archived

### 8. Write Tests

**File**: `src/services/rem.pruning.spec.ts`

Tests to implement:

- **Decay formula**: Verify increment scales inversely with `total_significance`
- **Coherence tension exemption**: Memories with high `feel_coherence_tension` get 0 increment (hook for Task 160)
- **Agency resistance**: High `functional_agency` memories get reduced decay increment
- **Multi-cycle progression**: Simulate 6 cycles — verify decay accumulates correctly and triggers archival
- **Threshold crossing**: Memory at `decay: 0.85` with increment `0.10` crosses threshold and gets archived
- **Archived search exclusion**: Archived memories not returned in default search
- **Archived recovery**: Setting `archived: false` makes memory searchable again
- **REM memory exemption**: `content_type: 'rem'` memories are not pruning candidates
- **Urgency decay**: `functional_urgency` reduces by 10% per cycle; `functional_salience` unchanged
- **Significance ceiling**: Memories with `total_significance >= 0.5` are not pruning candidates

---

## Verification Checklist

- [ ] `computeDecayIncrement()` returns correct values for various significance/tension/agency combinations
- [ ] Decay property increases on low-significance memories each REM cycle
- [ ] Decay increment scales inversely with `total_significance`
- [ ] High coherence tension memories are exempt from decay (increment = 0)
- [ ] High agency memories get reduced decay increment
- [ ] Memories crossing `DECAY_THRESHOLD` (0.9) are marked as archived
- [ ] Archived memories excluded from default search results
- [ ] Archived memories are recoverable via `archived: false`
- [ ] `content_type: 'rem'` memories are never pruning candidates
- [ ] `functional_urgency` decays 10% per cycle
- [ ] `functional_salience` is NOT decayed
- [ ] Multiple REM cycles produce expected cumulative decay
- [ ] Phase 4 (Prune) wired into REM cycle after Phase 3 (Abstract)
- [ ] `memories_decayed` and `memories_archived` tracked in `RunCycleResult`
- [ ] `rem_touched_at` and `rem_visits` updated on decayed memories
- [ ] All tests pass — colocated at `src/services/rem.pruning.spec.ts`

---

## Expected Output

- `src/services/rem.pruning.ts` — decay formula, candidate selection, decay progression, soft-delete, urgency decay
- `src/services/rem.pruning.spec.ts` — colocated tests
- Updated `src/services/memory.service.ts` — archived memory exclusion from search
- Updated `src/services/rem.service.ts` — Phase 4 integration
- Updated `src/services/rem-job.worker.ts` — new `pruning` step
- Weaviate schema updates: `archived` (boolean), `archived_at` (timestamp) properties if not already present
