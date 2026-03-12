# Task 497: Curation & PageRank Scoring Eval Script

**Milestone**: M73 - REM Eval Scripts
**Design Reference**: None
**Estimated Time**: 4 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Create `scripts/rem-curation-eval.ts` — a test script that runs against real Weaviate data to evaluate the curation scoring pipeline (6 sub-scores + composite) and PageRank graph centrality. Enables tuning weights and parameters without running full REM cycles.

---

## Context

The curation scoring system (`src/services/curation-scoring.ts`, `src/services/curation-step.service.ts`) computes a weighted composite `curated_score` from 6 sub-scores. Each sub-score has tunable parameters that affect ranking quality. Currently there's no way to evaluate these in isolation.

Existing eval scripts (`rem-cluster-eval.ts`, `rem-seed-eval.ts`) established the pattern for independent REM stage testing.

---

## Steps

### 1. Create Script Structure

Create `scripts/rem-curation-eval.ts` following the pattern from `rem-seed-eval.ts`:
- Connect to real Weaviate via `initWeaviateClient`
- Default user to `e1_test_user`
- Accept CLI args for tunable parameters

### 2. Implement Sub-Score Evaluation

For a sample of memories from the collection, compute and display all 6 sub-scores:

1. **Editorial score** — requires LLM call (content quality 0-1)
2. **Recency score** — exponential decay with configurable `halfLifeDays` (default 90)
3. **Rating score** — Bayesian rating normalized to 0-1
4. **Engagement score** — click/share/comment with caps (50/10/20)
5. **Cluster quality score** — avg strength (0.4) + avg confidence (0.4) + membership bonus (0.2)
6. **Graph centrality / PageRank** — damping=0.85, iterations=20

### 3. Implement Composite Weight Tuning

Allow overriding the default `CURATED_WEIGHTS` via CLI:
- `--w-editorial <n>` (default 0.30)
- `--w-cluster <n>` (default 0.25)
- `--w-centrality <n>` (default 0.20)
- `--w-rating <n>` (default 0.12)
- `--w-recency <n>` (default 0.08)
- `--w-engagement <n>` (default 0.05)

### 4. Implement PageRank Parameter Tuning

- `--damping <n>` (default 0.85)
- `--iterations <n>` (default 20)
- `--recency-halflife <n>` (default 90)

### 5. Summary Output

Display:
- Per-memory breakdown: all 6 sub-scores + composite
- Top N and bottom N memories by curated score
- Distribution histogram of composite scores
- Comparison table showing how different weight configs change rankings

---

## Verification

- [ ] Script runs against real Weaviate and produces output
- [ ] All 6 sub-scores computed and displayed per memory
- [ ] Composite score matches weighted sum of sub-scores
- [ ] CLI args override default weights
- [ ] PageRank damping and iterations are configurable
- [ ] Default user is `e1_test_user`
- [ ] Summary shows ranking impact of weight changes

---

## Expected Output

**Files Created**:
- `scripts/rem-curation-eval.ts`

---

## Notes

- Key source files: `src/services/curation-scoring.ts`, `src/services/curation-step.service.ts`
- PageRank params: iterations (default 20), damping (default 0.85)
- Default weights: editorial=0.30, cluster=0.25, centrality=0.20, rating=0.12, recency=0.08, engagement=0.05
- Recency half-life: 90 days
- Engagement caps: clicks=50, shares=10, comments=20
