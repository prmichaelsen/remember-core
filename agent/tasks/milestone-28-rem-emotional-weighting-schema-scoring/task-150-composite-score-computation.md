# Task 150: Composite Score Computation

**Milestone**: [M28 - REM Emotional Weighting — Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 3 hours
**Dependencies**: Task 149
**Status**: Not Started

---

## Objective

Compute and store feel_significance, functional_significance, and total_significance as weighted sums of their respective dimension layers.

---

## Context

Composite scores aggregate individual dimension scores into higher-level significance measures:

- **feel_significance** = weighted sum of Layer 1 (21 discrete emotions: feel_joy through feel_loneliness)
- **functional_significance** = weighted sum of Layer 2 (10 functional signals: 8 functional_* properties + feel_valence + feel_arousal-equivalent)
- **total_significance** = feel_significance + functional_significance

Initial weights can be set by the creating LLM. During REM scoring, composites are re-computed from the freshly scored dimension values. Weights may be tuned over time but start with equal weighting.

---

## Steps

### 1. Implement Composite Computation Functions
Create functions that compute each composite score from its constituent dimensions using configurable weights. Handle null dimension values gracefully (exclude from weighted sum, adjust denominator).

### 2. Wire into Scoring Phase
After all 31 dimensions are scored for a memory in Phase 0, compute the three composite scores and include them in the Weaviate update.

### 3. Store in Weaviate
Persist feel_significance, functional_significance, and total_significance alongside the dimension scores in the same Weaviate update operation.

---

## Verification

- [ ] feel_significance computed as weighted sum of 21 feel_* dimensions
- [ ] functional_significance computed as weighted sum of functional signals
- [ ] total_significance = feel_significance + functional_significance
- [ ] Null dimension values excluded from computation (not treated as 0)
- [ ] Composites re-computed during REM scoring (not just at creation)
- [ ] Composites stored in Weaviate alongside dimension scores
- [ ] Weights are configurable
- [ ] Tests pass with various combinations of null/present dimension values

---

## Expected Output

Three composite significance scores computed from individual dimension scores and stored on each memory. Composites update whenever REM re-scores a memory's dimensions.

---

**Next Task**: [task-151-rem-metadata-tracking.md](./task-151-rem-metadata-tracking.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
