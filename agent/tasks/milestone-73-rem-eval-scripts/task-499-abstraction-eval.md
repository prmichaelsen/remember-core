# Task 499: Abstraction Eval Script

**Milestone**: M73 - REM Eval Scripts
**Design Reference**: None
**Estimated Time**: 3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Create `scripts/rem-abstraction-eval.ts` — a test script that evaluates the abstraction pipeline against real relationship clusters to determine which clusters qualify for abstraction and preview the LLM-generated abstractions.

---

## Context

The abstraction system (`src/services/rem.abstraction.ts`) detects high-quality clusters, synthesizes semantic abstractions, and creates new "rem" memories. The quality of abstractions depends on `min_cluster_size` and `similarity_threshold` parameters. Currently there's no way to preview which clusters would be abstracted or what the abstractions would look like.

---

## Steps

### 1. Create Script Structure

Create `scripts/rem-abstraction-eval.ts`:
- Connect to real Weaviate
- Default user to `e1_test_user`
- Fetch existing relationships and their member memories

### 2. Evaluate Abstraction Candidates

For each relationship cluster:
- Check if it meets `min_cluster_size` (default 5)
- Check if avg similarity meets `similarity_threshold` (default 0.8)
- Check if cluster is already abstracted (skip if so)
- Report: qualifies, disqualified (too small), disqualified (too dissimilar), already abstracted

### 3. Preview Abstractions (Optional LLM)

For qualifying clusters, optionally call LLM to generate the abstraction:
- `--preview` flag to enable LLM abstraction generation
- Show what the synthesized "rem" memory content would be
- Display with weight (0.8) and trust_score (5) that would be applied

### 4. CLI Args

- `--min-size <n>` (default 5) — min cluster size
- `--similarity <n>` (default 0.8) — similarity threshold
- `--preview` — generate actual abstractions via LLM
- `--limit <n>` (default 20) — max clusters to evaluate

### 5. Summary Output

- Total clusters evaluated
- Breakdown: qualifies / too small / too dissimilar / already abstracted
- For qualified clusters: member count, avg similarity, member content previews
- If `--preview`: the generated abstraction text

---

## Verification

- [ ] Script runs against real Weaviate data
- [ ] Correctly identifies clusters that meet size and similarity thresholds
- [ ] Skips already-abstracted clusters
- [ ] `--preview` generates LLM abstractions
- [ ] All parameters configurable via CLI
- [ ] Default user is `e1_test_user`

---

## Expected Output

**Files Created**:
- `scripts/rem-abstraction-eval.ts`

---

## Notes

- Key source files: `src/services/rem.abstraction.ts`, `src/services/rem.service.ts` (lines 362-416)
- Abstraction memories get weight=0.8, trust_score=5, content_type='rem'
- Hardcoded exclusion: skip clusters where all members already in an abstraction relationship
