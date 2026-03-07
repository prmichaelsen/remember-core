# Task 160: Reconciliation — Coherence Tension Resolution

**Milestone**: [M30 - REM Emotional Weighting — Abstraction, Pruning & Reconciliation](../milestones/milestone-30-rem-emotional-weighting-abstraction-pruning.md)
**Estimated Time**: 4 hours
**Dependencies**: Task 158 (pruning — coherence tension exemption hook must exist)
**Status**: Not Started
**REM Phase**: Phase 5 (Reconcile) — the final phase

---

## Key Design Decisions

| Decision | Choice | Source |
|---|---|---|
| Phase placement | REM Phase 5 (Reconcile) — runs last, after Prune (4) | Design doc |
| Core signal | `feel_coherence_tension` — the "this doesn't fit" signal that drives learning | Clarification 19, Design doc |
| Pruning interaction | High coherence_tension memories RESIST pruning until resolved | Clarification 19 |
| Resolution mechanism | Surface contradictory memories that silently coexist; create REM observations noting the conflict | Clarification 19 |
| What "resolved" means | `feel_coherence_tension` drops below threshold on next scoring cycle (after user addresses the conflict or REM re-evaluates with new context) | Design doc |
| Output format | REM observations (stored as `observation` property updates or new `rem` memories) | Clarification 19 |

---

## Coherence Tension Semantics

Coherence tension is the computational analog of cognitive dissonance. It fires when:
- A memory contradicts the user's established beliefs or patterns
- Two memories express opposing views on the same topic
- A new memory conflicts with an existing identity synthesis (from Task 157 abstraction)
- A fact-based memory conflicts with a values-based memory

**Key insight**: High coherence tension is NOT a defect to be erased — it is a learning signal. The reconciliation phase surfaces conflicts so the user (or future REM cycles) can resolve them. Until resolved, these memories are protected from pruning because they represent unprocessed information that could change the user's understanding.

---

## Concrete Examples

| Memory A | Memory B | Coherence Tension | REM Observation |
|---|---|---|---|
| "I love my job at TechCorp" (from 3 months ago) | "I dread going to work every morning" (from last week) | 0.85 | "These memories express conflicting feelings about your job at TechCorp. Your earlier memory reflects satisfaction, while recent entries suggest growing dissatisfaction. This may indicate a shift in how you feel about your role." |
| "I'm committed to vegetarianism" (identity synthesis) | "Had the best steak of my life at dinner" (recent) | 0.9 | "This memory conflicts with your established vegetarian identity. This could represent a one-time exception, or it may signal an evolving relationship with your dietary choices." |
| "I trust Sarah completely" | "Sarah shared my secret with others" | 0.8 | "These memories contain a tension around trust with Sarah. The earlier memory establishes deep trust, while the recent memory describes a breach of that trust." |

---

## Objective

Implement REM Phase 5 (Reconcile) — identify memories with high `feel_coherence_tension`, find conflicting memory pairs/clusters, create REM observations documenting the conflict, and ensure high-tension memories are exempt from pruning until tension is resolved.

---

## Implementation Steps

### 1. Implement Coherence Tension Query

**File**: `src/services/rem.reconciliation.ts` (new)

- **Query** memories where `feel_coherence_tension >= COHERENCE_TENSION_THRESHOLD` (default: 0.7)
- Sort by `feel_coherence_tension` descending — process highest tension first
- Configurable batch size: `max_reconciliation_candidates` (default: 20)
- Skip memories that already have a reconciliation observation from the current REM cycle (check `rem_touched_at`)

### 2. Implement Conflict Detection

**File**: `src/services/rem.reconciliation.ts`

For each high-tension memory, find its conflicting counterparts:

1. **Relationship-based**: Check existing relationships for the memory — other members of the same relationship cluster may hold the opposing view
2. **Semantic search**: Query for memories with high embedding similarity but opposing emotional signatures:
   - Similar topic (high vector similarity, e.g., >= 0.75)
   - Opposing `feel_valence` (one positive, one negative on the same topic)
   - Or same topic with contradictory factual content
3. **Abstraction conflict**: Check if the memory conflicts with any existing `content_type: 'rem'` abstraction memories (e.g., contradicts an identity synthesis)

- **Output**: `ConflictPair` or `ConflictCluster`:
  ```typescript
  interface ConflictPair {
    memory_a_id: string;
    memory_b_id: string;
    tension_score: number;              // highest coherence_tension among the pair
    conflict_type: 'valence_opposition' | 'factual_contradiction' | 'identity_conflict' | 'behavioral_inconsistency';
    memory_a_summary: string;           // first 200 chars of content
    memory_b_summary: string;
  }
  ```

### 3. Generate Reconciliation Observations via Haiku

**File**: `src/services/rem.reconciliation.ts`

- For each detected conflict pair/cluster, call Haiku with:
  - Content of both conflicting memories
  - Their emotional scores (especially `feel_valence`, `feel_coherence_tension`)
  - Temporal information (`created_at` of each memory)
  - Any existing `observation` text on the memories
- **Haiku prompt** should generate:
  - A neutral, empathetic description of the conflict (2-4 sentences)
  - Temporal context (which came first, how recently each was created)
  - Possible interpretations (change over time, exception vs. pattern, etc.)
  - NO prescriptive advice — surface the conflict, don't resolve it
- **Output**: Observation text stored as a new `content_type: 'rem'` memory with:
  - `tags: ['rem-reconciliation', conflict_type]`
  - Relationship linking it to both conflicting memories (type: `'reconciliation'`)

### 4. Update Source Memory Observations

**File**: `src/services/rem.reconciliation.ts`

- Update the `observation` field on each conflicting memory to note the detected tension:
  - Append to existing observation: "\n\n[REM Reconciliation]: Tension detected with memory [ID] — see reconciliation note [REM memory ID]"
- Update `rem_touched_at` and increment `rem_visits` on both memories

### 5. Implement Pruning Resistance (Integration with Task 158)

**File**: `src/services/rem.pruning.ts` (modify)

Task 158 already defines the `COHERENCE_TENSION_EXEMPTION_THRESHOLD` constant and the exemption check in `computeDecayIncrement()`. This task verifies and completes that integration:

- Verify that `computeDecayIncrement()` returns 0 for memories where `feel_coherence_tension >= COHERENCE_TENSION_EXEMPTION_THRESHOLD`
- Ensure archived memories with high coherence tension are NOT archived (even if their `total_significance` is low)
- When coherence tension drops below threshold on a future scoring cycle (tension "resolved"), normal pruning resumes automatically — no explicit "resolve" action needed
- The threshold value (`0.7`) should be shared between `rem.pruning.ts` and `rem.reconciliation.ts` via a shared constant

### 6. Wire into REM Cycle as Phase 5

**Files**: `src/services/rem.service.ts`, `src/services/rem-job.worker.ts`

- Add Phase 5 (Reconcile) to `RemService.runCycle()` as the final phase after Prune (4)
- Add a new step to `REM_STEPS`:
  ```typescript
  { id: 'reconciliation', label: 'Reconciling coherence tension conflicts' }
  ```
- Call `runReconciliationPhase(collectionId)` which:
  1. Queries high-tension memories
  2. Finds conflicting pairs
  3. Generates reconciliation observations via Haiku
  4. Creates REM observation memories and relationships
  5. Updates source memory observations
- Track stats in `RunCycleResult`:
  - `conflicts_detected: number` — number of conflict pairs found
  - `reconciliation_observations_created: number` — number of REM observation memories created

### 7. Share Coherence Tension Constants

**File**: `src/services/rem.constants.ts` (new, or add to `rem.types.ts`)

- Extract shared constants used by both pruning and reconciliation:
  ```typescript
  export const COHERENCE_TENSION_THRESHOLD = 0.7;  // used by both pruning exemption and reconciliation detection
  ```
- Import this constant in both `rem.pruning.ts` and `rem.reconciliation.ts`

### 8. Write Tests

**File**: `src/services/rem.reconciliation.spec.ts`

Tests to implement:

- **High tension detection**: Memories with `feel_coherence_tension >= 0.7` are identified as reconciliation candidates
- **Below threshold skip**: Memories with `feel_coherence_tension < 0.7` are not processed
- **Conflict pair detection — valence opposition**: Two memories about same topic with opposing valence are paired
- **Conflict pair detection — identity conflict**: Memory contradicting an existing `rem` abstraction is detected
- **Haiku observation generation**: Mock Haiku produces neutral, empathetic observation text
- **REM observation memory creation**: Observation stored as `content_type: 'rem'` with correct tags and relationships
- **Source memory observation update**: Conflicting memories get observation field updated with reconciliation note
- **Pruning resistance verification**: High-tension memories return 0 from `computeDecayIncrement()` (cross-task integration test)
- **Pruning resumes after resolution**: When `feel_coherence_tension` drops below threshold, memory becomes pruning-eligible again
- **Already-processed skip**: Memories with `rem_touched_at` from current cycle are not re-processed
- **Phase integration**: Reconciliation runs as Phase 5 after pruning in the REM cycle
- **Shared threshold**: Both pruning and reconciliation use the same `COHERENCE_TENSION_THRESHOLD` constant

---

## Verification Checklist

- [ ] Memories with `feel_coherence_tension >= 0.7` are identified for reconciliation
- [ ] Conflicting memory pairs detected via relationship, semantic, and abstraction conflict strategies
- [ ] Conflict types correctly classified (`valence_opposition`, `factual_contradiction`, `identity_conflict`, `behavioral_inconsistency`)
- [ ] Haiku generates neutral, empathetic reconciliation observations
- [ ] Reconciliation observations stored as `content_type: 'rem'` memories
- [ ] Relationships created linking reconciliation observations to conflicting memories (type: `'reconciliation'`)
- [ ] Source memory `observation` fields updated with reconciliation notes
- [ ] `rem_touched_at` and `rem_visits` updated on processed memories
- [ ] High `feel_coherence_tension` memories are exempt from pruning decay (shared constant with Task 158)
- [ ] High `feel_coherence_tension` memories cannot be archived even with low `total_significance`
- [ ] Pruning resumes automatically when `feel_coherence_tension` drops below threshold
- [ ] Shared `COHERENCE_TENSION_THRESHOLD` constant used by both pruning and reconciliation
- [ ] Phase 5 (Reconcile) wired into REM cycle after Phase 4 (Prune)
- [ ] `conflicts_detected` and `reconciliation_observations_created` tracked in `RunCycleResult`
- [ ] Already-processed memories (current cycle) are skipped
- [ ] All tests pass — colocated at `src/services/rem.reconciliation.spec.ts`

---

## Expected Output

- `src/services/rem.reconciliation.ts` — tension query, conflict detection, Haiku observation generation, REM memory/relationship creation
- `src/services/rem.reconciliation.spec.ts` — colocated tests
- `src/services/rem.constants.ts` (or addition to `rem.types.ts`) — shared `COHERENCE_TENSION_THRESHOLD`
- Updated `src/services/rem.pruning.ts` — import shared constant, verify exemption logic
- Updated `src/services/rem.service.ts` — Phase 5 integration
- Updated `src/services/rem-job.worker.ts` — new `reconciliation` step
