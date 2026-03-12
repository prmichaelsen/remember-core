# Task 502: Add Classification Detection to Seed Eval Script

**Milestone**: M73 - REM Eval Scripts
**Design Reference**: None
**Estimated Time**: 3-4 hours
**Dependencies**: Task 497 (seed eval exists)
**Status**: Not Started

---

## Objective

Enhance `scripts/rem-seed-eval.ts` to also run classification detection on seed clusters, surfacing `is_duplicate`, `duplicate_of`, `merge_candidates`, and `contradictions` from the classification pipeline — the same fields Haiku produces in `rem.classification.ts`.

---

## Context

The seed eval script currently detects duplicates via a naive similarity threshold (>= 0.95) and evaluates clusters with `haikuClient.evaluateCluster()` for relationship formation. However, the REM classification phase (`src/services/rem.classification.ts`) performs richer analysis:

- **`is_duplicate`** / **`duplicate_of`** — semantic duplicate detection (not just vector distance)
- **`merge_candidates`** — similar but non-identical memories that could be consolidated
- **`contradictions`** — memories that contradict each other

The seed eval already pays for an LLM call per cluster but doesn't extract this classification data. Adding classification detection would make the seed eval a more complete diagnostic tool for understanding memory quality before running the full REM pipeline.

---

## Steps

### 1. Import Classification Functions

Import `buildClassificationPrompt` and `parseClassificationResponse` from `src/services/rem.classification.ts`.

### 2. Add `--classify` Flag

Add an optional `--classify` flag to the seed eval config. When enabled, each seed cluster is also evaluated with the classification prompt after the existing relationship evaluation.

### 3. Run Classification on Each Seed Cluster

For each seed that has similar memories found:
- Build the classification prompt using `buildClassificationPrompt()` with the seed memory and its neighbors
- Call the LLM (reuse the existing `haikuClient` or make a direct API call)
- Parse the response with `parseClassificationResponse()`
- Store `is_duplicate`, `duplicate_of`, `merge_candidates`, and `contradictions` on the `SeedResult`

### 4. Surface Classification Results in Per-Seed Output

For each seed, after the existing relationship output, print:
- If `is_duplicate`: `"  ⚠ DUPLICATE of {duplicate_of}"`
- If `merge_candidates.length > 0`: `"  ◐ {N} merge candidate(s):"` with each candidate's ID and reason
- If `contradictions.length > 0`: `"  ✗ {N} contradiction(s):"` with each contradiction's description

### 5. Add Classification Summary Section

Add a new summary section after the existing summary:
```
Classification Summary:
  Duplicates found:     {count}
  Merge candidates:     {count}
  Contradictions found: {count}

  Duplicate pairs:
    "memory A content..." → duplicate of {id}

  Merge candidates:
    "memory A content..." ↔ {id}: {reason}

  Contradictions:
    "memory A content..." ✗ {id}: {description}
```

### 6. Update Summary Counts

The existing `Seeds evaluated` summary line should also include classification counts when `--classify` is active.

---

## Verification

- [ ] `--classify` flag is accepted and parsed
- [ ] Without `--classify`, behavior is identical to current script
- [ ] With `--classify`, classification prompt is sent for each seed with neighbors
- [ ] `is_duplicate` / `duplicate_of` are surfaced per-seed
- [ ] `merge_candidates` are surfaced per-seed with reason
- [ ] `contradictions` are surfaced per-seed with description
- [ ] Summary section includes classification counts
- [ ] Classification uses existing `buildClassificationPrompt` / `parseClassificationResponse` from `rem.classification.ts`
- [ ] Script runs successfully: `(set -a && source .env.e1.local && npx tsx scripts/rem-seed-eval.ts --classify)`

---

## Expected Output

**Modified file**: `scripts/rem-seed-eval.ts`

**New CLI flag**: `--classify` (optional, off by default)

**New output sections** (when `--classify` is active):
- Per-seed classification annotations (duplicate/merge/contradiction)
- Classification Summary block in the summary section

---

## Notes

- The classification prompt in `rem.classification.ts` expects a memory + its vector-search neighbors, which is exactly what the seed eval already has
- Keep the `--classify` flag optional to avoid adding LLM cost to every seed eval run (it's a second LLM call per seed)
- The existing naive duplicate detection (similarity >= 0.95) should remain — it's a useful fast-path that doesn't require LLM calls
