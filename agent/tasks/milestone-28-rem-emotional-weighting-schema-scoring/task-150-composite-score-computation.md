# Task 150: Composite Score Computation

**Milestone**: [M28 - REM Emotional Weighting -- Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 3 hours
**Dependencies**: Task 145
**Status**: Not Started

---

## Objective

Implement computation of the three composite significance scores (`feel_significance`, `functional_significance`, `total_significance`) as weighted sums of their respective dimension layers, used both at create-time and during REM scoring.

---

## Context

Composite scores aggregate individual dimension scores into higher-level significance measures for sorting and prioritization. They are computed in two contexts:

1. **At create-time** (Task 146): If the creating LLM provides dimension values but not composites, compute composites from provided values.
2. **During REM Phase 0** (Task 149): After all 31 dimensions are scored, compute composites from the fresh scores.

Composite weights are initially set by the creating LLM. REM re-computes them during scoring cycles. Weights start with equal weighting but are configurable for future tuning.

---

## Key Design Decisions

### Composite Architecture

| Decision | Choice | Rationale |
|---|---|---|
| Composite count | 3: `feel_significance`, `functional_significance`, `total_significance` | Separate emotional and functional rankings, plus combined |
| `feel_significance` inputs | Weighted sum of all 21 Layer 1 `feel_*` dimensions | Emotional intensity composite |
| `functional_significance` inputs | Weighted sum of all 10 Layer 2 `functional_*` dimensions | Functional importance composite |
| `total_significance` formula | `feel_significance` + `functional_significance` | Combined significance for unified sorting |
| Initial weights | Equal weighting across dimensions within each layer | Simple starting point, tunable later |
| Null handling | Exclude null dimensions from weighted sum, adjust denominator | Don't penalize partially-scored memories |
| Valence handling | Use absolute value for composite scoring | Traumatic (-1) and joyful (+1) both contribute to significance |

---

## Steps

### 1. Define Composite Weight Configuration

Create a configurable weight map for each composite:

```typescript
interface CompositeWeights {
  feel: Record<string, number>;       // weight per feel_* dimension
  functional: Record<string, number>; // weight per functional_* dimension
}
```

**`feel_significance` inputs (21 dimensions):**
- `feel_emotional_significance`
- `feel_vulnerability`
- `feel_trauma`
- `feel_humor`
- `feel_happiness`
- `feel_sadness`
- `feel_fear`
- `feel_anger`
- `feel_surprise`
- `feel_disgust`
- `feel_contempt`
- `feel_embarrassment`
- `feel_shame`
- `feel_guilt`
- `feel_excitement`
- `feel_pride`
- `feel_valence` (use absolute value for composite)
- `feel_arousal`
- `feel_dominance`
- `feel_intensity`
- `feel_coherence_tension`

**`functional_significance` inputs (10 dimensions):**
- `functional_salience`
- `functional_urgency`
- `functional_social_weight`
- `functional_agency`
- `functional_novelty`
- `functional_retrieval_utility`
- `functional_narrative_importance`
- `functional_aesthetic_quality`
- `functional_valence`
- `functional_coherence_tension`

Default: equal weight (1.0) for each dimension within its layer.

### 2. Implement Composite Computation Functions

```typescript
function computeFeelSignificance(
  scores: Partial<Record<string, number | null>>,
  weights?: Partial<Record<string, number>>
): number | null;

function computeFunctionalSignificance(
  scores: Partial<Record<string, number | null>>,
  weights?: Partial<Record<string, number>>
): number | null;

function computeTotalSignificance(
  feelSignificance: number | null,
  functionalSignificance: number | null
): number | null;
```

Implementation details:
- For each dimension in the layer, if the score is non-null, multiply by weight and add to sum
- Track total weight of non-null dimensions for normalization
- If ALL dimensions are null, return null (not 0)
- If some dimensions are null, compute weighted average of non-null dimensions only
- For `feel_valence`: use `Math.abs(score)` when computing `feel_significance` (both -1 and +1 contribute equally to significance)
- `total_significance` = `feel_significance` + `functional_significance` (simple sum, not average)
- If either sub-composite is null, `total_significance` uses only the non-null one
- If both are null, `total_significance` is null

### 3. Wire Into Create-Time Path

Integrate with Task 146's `MemoryService.create`:
- If dimension values provided but composites not provided, call composite computation
- If composites explicitly provided by creating LLM, use those as-is
- If neither provided, leave composites null

### 4. Wire Into REM Phase 0

Integrate with Task 149's scoring loop:
- After all 31 dimensions are scored for a memory, compute all three composites
- Include composites in the same Weaviate update operation as the dimension scores
- Composites always re-computed during REM (even if creating LLM set them)

### 5. Write Tests

Create colocated `.spec.ts` tests:
- `feel_significance` computed as weighted sum of all 21 `feel_*` dimensions
- `functional_significance` computed as weighted sum of all 10 `functional_*` dimensions
- `total_significance` = `feel_significance` + `functional_significance`
- Null dimension values excluded from computation (not treated as 0)
- All dimensions null returns null composite (not 0)
- Single non-null dimension produces valid composite
- `feel_valence` uses absolute value in composite (score of -0.8 contributes 0.8)
- `total_significance` handles one null sub-composite (uses non-null one)
- Custom weights applied correctly (non-equal weighting)
- Default equal weights produce expected results
- Composites computed at create-time when dimensions provided but composites omitted
- Composites re-computed during REM regardless of create-time values

---

## Verification

- [ ] `feel_significance` computed from exactly 21 `feel_*` dimensions
- [ ] `functional_significance` computed from exactly 10 `functional_*` dimensions
- [ ] `total_significance` = `feel_significance` + `functional_significance`
- [ ] Null dimension values excluded from weighted sum (denominator adjusted)
- [ ] All-null dimensions produce null composite (not 0)
- [ ] `feel_valence` absolute value used in `feel_significance` computation
- [ ] Weights are configurable (default: equal)
- [ ] Composites computed at create-time when dimensions provided without composites
- [ ] Composites re-computed during REM Phase 0 (always, not just when missing)
- [ ] Composites stored in Weaviate alongside dimension scores
- [ ] Tests colocated with source file using `.spec.ts` suffix
- [ ] All tests pass with various combinations of null/present dimension values

---

## Expected Output

Three composite significance scores computed from individual dimension scores using configurable weights. `feel_significance` aggregates 21 Layer 1 emotions, `functional_significance` aggregates 10 Layer 2 functional signals, and `total_significance` sums both. Null handling ensures partially-scored memories still get valid composites. Used both at create-time and during REM Phase 0.

---

**Next Task**: [task-151-rem-metadata-tracking.md](./task-151-rem-metadata-tracking.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
