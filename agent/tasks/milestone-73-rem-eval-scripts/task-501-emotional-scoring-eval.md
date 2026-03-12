# Task 501: Emotional Scoring Eval Script

**Milestone**: M73 - REM Eval Scripts
**Design Reference**: None
**Estimated Time**: 3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Create `scripts/rem-scoring-eval.ts` — a test script that evaluates the composite emotional scoring pipeline against real memories to preview how dimension weights affect overall scores and identify scoring anomalies.

---

## Context

The emotional scoring system (`src/services/composite-scoring.ts`) scores memories across 31 dimensions (feel_* and functional_*), each with a configurable weight (default 1.0). There's no way to preview how changing weights affects the distribution of scores across a collection.

---

## Steps

### 1. Create Script Structure

Create `scripts/rem-scoring-eval.ts`:
- Connect to real Weaviate
- Default user to `e1_test_user`
- Fetch memories with their current emotional scores

### 2. Display Current Score Distribution

For a sample of memories:
- Show all 31 dimension scores
- Show composite score
- Highlight highest/lowest scoring dimensions
- Show score distribution (histogram buckets)

### 3. Weight Sensitivity Analysis

Allow overriding dimension weights to see impact:
- `--weight <dimension>=<value>` (e.g., `--weight feel_joy=2.0`)
- Recompute composites with new weights
- Show ranking changes vs default weights

### 4. Anomaly Detection

Identify scoring outliers:
- Memories with extreme scores (very high or very low composite)
- Memories with contradictory scores (high joy + high sadness)
- Unscored memories (missing emotional dimensions)

### 5. CLI Args

- `--limit <n>` (default 30) — memories to evaluate
- `--weight <dim>=<val>` — override dimension weight (repeatable)
- `--show-all-dims` — show all 31 dimensions per memory (default: top 5)
- `--anomalies` — highlight scoring outliers

### 6. Summary Output

- Total memories evaluated, scored vs unscored
- Score distribution (min, max, mean, median, std dev)
- Top/bottom memories by composite score
- If weights overridden: ranking diff table
- If `--anomalies`: flagged outlier memories

---

## Verification

- [ ] Script runs against real Weaviate data
- [ ] All 31 dimensions displayed when `--show-all-dims` used
- [ ] Composite score correctly recomputed with overridden weights
- [ ] Anomaly detection identifies outliers
- [ ] All parameters configurable via CLI
- [ ] Default user is `e1_test_user`

---

## Expected Output

**Files Created**:
- `scripts/rem-scoring-eval.ts`

---

## Notes

- Key source files: `src/services/composite-scoring.ts`
- 31 dimensions: feel_* (emotional) + functional_* (utility)
- Default weight: 1.0 per dimension
- scoring_batch_size default: 10, scoring_cost_cap: 5.0 USD, scoring_cost_per_memory: 0.0015
