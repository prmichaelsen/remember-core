# Task 498: Pruning Decay Eval Script

**Milestone**: M73 - REM Eval Scripts
**Design Reference**: None
**Estimated Time**: 3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Create `scripts/rem-pruning-eval.ts` — a test script that simulates the pruning decay pipeline against real memories to evaluate which memories would be pruned, exempted, or soft-deleted under different threshold configurations.

---

## Context

The pruning system (`src/services/rem.pruning.ts`) applies graduated decay to low-significance memories and soft-deletes when decay reaches a threshold. Several constants control behavior but there's no way to preview the impact of changing them without running full REM cycles.

---

## Steps

### 1. Create Script Structure

Create `scripts/rem-pruning-eval.ts` following established eval script patterns:
- Connect to real Weaviate
- Default user to `e1_test_user`
- Fetch memories with their current scores

### 2. Implement Decay Simulation

For each candidate memory, compute what the pruning step would do:
- Calculate significance from composite scores
- Apply decay formula based on significance floor/ceiling
- Check exemption criteria (coherence_tension, agency thresholds)
- Report: would-decay, would-exempt, would-soft-delete

### 3. CLI Args for Tunable Parameters

- `--decay-threshold <n>` (default 0.9) — soft-delete trigger
- `--max-decay <n>` (default 0.15) — max decay per cycle
- `--min-decay <n>` (default 0.01) — min decay per cycle
- `--sig-floor <n>` (default 0.2) — below = max decay
- `--sig-ceiling <n>` (default 0.5) — above = no pruning
- `--tension-exempt <n>` (default 0.7) — coherence tension exemption
- `--agency-exempt <n>` (default 0.7) — agency exemption
- `--urgency-factor <n>` (default 0.9) — urgency decay per cycle
- `--limit <n>` (default 50) — max candidates

### 4. Summary Output

- Count of memories per category: would-prune, would-exempt, safe (above ceiling)
- Per-memory detail: significance, current decay, projected decay, exemption reason
- Threshold analysis: how changing floor/ceiling affects counts

---

## Verification

- [ ] Script runs against real Weaviate data
- [ ] Decay calculations match `rem.pruning.ts` formulas
- [ ] Exemption logic matches `rem.constants.ts` thresholds
- [ ] All parameters configurable via CLI
- [ ] Summary shows impact of threshold changes
- [ ] Default user is `e1_test_user`

---

## Expected Output

**Files Created**:
- `scripts/rem-pruning-eval.ts`

---

## Notes

- Key source files: `src/services/rem.pruning.ts`, `src/services/rem.constants.ts`
- Decay formula: increment = MIN_DECAY + (MAX_DECAY - MIN_DECAY) * (1 - normalized_significance)
- Exemptions: coherence_tension >= 0.7 OR agency >= 0.7
- Urgency decays 10% per cycle (factor 0.9)
