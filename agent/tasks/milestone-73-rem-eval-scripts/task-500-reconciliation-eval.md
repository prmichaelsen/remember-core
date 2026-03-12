# Task 500: Reconciliation Eval Script

**Milestone**: M73 - REM Eval Scripts
**Design Reference**: None
**Estimated Time**: 3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Create `scripts/rem-reconciliation-eval.ts` — a test script that evaluates the conflict detection and reconciliation pipeline against real memories to find conflicting pairs and preview reconciliation observations.

---

## Context

The reconciliation system (`src/services/rem.reconciliation.ts`) finds memory pairs with high coherence tension and opposing valence, then generates neutral reconciliation observations via LLM. The conflict detection criteria have tunable thresholds that affect how many conflicts are found.

---

## Steps

### 1. Create Script Structure

Create `scripts/rem-reconciliation-eval.ts`:
- Connect to real Weaviate
- Default user to `e1_test_user`
- Fetch memories with emotional scores (coherence_tension, valence)

### 2. Implement Conflict Detection

For high-tension memories (coherence_tension >= threshold):
- Find similar memories via nearObject (vector similarity >= 0.75)
- Check for valence opposition: gap >= 0.5 with opposite signs
- Check for identity conflicts: one memory is content_type='rem'
- Report all detected conflict pairs

### 3. Preview Reconciliation (Optional LLM)

- `--preview` flag to call LLM for reconciliation observations
- Show what neutral observation would be generated for each conflict pair

### 4. CLI Args

- `--tension <n>` (default 0.7) — coherence tension threshold for candidates
- `--similarity <n>` (default 0.75) — min vector similarity for conflict pairs
- `--valence-gap <n>` (default 0.5) — min valence gap for opposition
- `--limit <n>` (default 20) — max candidates to process
- `--preview` — generate reconciliation observations via LLM

### 5. Summary Output

- High-tension memories found
- Conflict pairs detected (with reasons: valence opposition, identity conflict)
- Per-pair detail: both memory contents, tension scores, valence values, similarity
- If `--preview`: the reconciliation observation text

---

## Verification

- [ ] Script runs against real Weaviate data
- [ ] Correctly identifies high-tension memories
- [ ] Conflict pair detection matches `rem.reconciliation.ts` criteria
- [ ] Valence opposition check uses correct formula (gap >= 0.5, opposite signs)
- [ ] Identity conflict detection checks content_type='rem'
- [ ] All parameters configurable via CLI
- [ ] Default user is `e1_test_user`

---

## Expected Output

**Files Created**:
- `scripts/rem-reconciliation-eval.ts`

---

## Notes

- Key source files: `src/services/rem.reconciliation.ts`, `src/services/rem.constants.ts`
- Conflict criteria: valence gap >= 0.5 with one positive + one negative
- Identity conflict: when one memory is a REM abstraction (content_type='rem')
- COHERENCE_TENSION_THRESHOLD default: 0.7
- CONFLICT_SIMILARITY_THRESHOLD default: 0.75
