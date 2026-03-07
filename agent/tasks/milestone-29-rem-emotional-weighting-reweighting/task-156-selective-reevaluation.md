# Task 156: Selective Re-evaluation via Sub-LLM Dimension Impact Analysis

**Milestone**: M29 — REM Emotional Weighting — Retroactive Reweighting
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 153, Task 147 (per-dimension scoring service), Task 150 (composite computation)

---

## Objective

Implement selective re-evaluation so that re-scoring avoids redundant LLM calls. Instead of re-scoring all 31 dimensions on every trigger, a sub-LLM call first determines which dimensions are actually impacted by the new information. Only impacted dimensions are re-scored, and composites are recomputed from the mix of old (preserved) and new scores.

This is the core re-evaluation engine used by all three triggers (Tasks 153, 154, 155).

---

## Key Design Decisions

| Decision | Choice | Source |
|----------|--------|--------|
| Dimension selection | Sub-LLM call returns array of impacted dimension names | Clarification 19 |
| Sub-LLM model | Haiku (same as scoring) | Design doc: Scoring Architecture |
| Input to sub-LLM | Memory content, current scores, new context (trigger-specific) | Clarification 19 |
| Output from sub-LLM | JSON array of dimension property names to re-score | Clarification 19 |
| Validation | Returned dimensions validated against known 31-dimension schema; invalid names filtered out | Design doc: implied |
| Score merging | New partial scores overwrite only re-scored dimensions; all other dimensions preserved | Clarification 19 |
| Composite recomputation | After merging, `feel_significance`, `functional_significance`, `total_significance` recomputed from full set of 31 dimensions (mix of old + new) | Design doc: Composite Scores |
| Cost optimization | 1 sub-LLM call + N dimension-specific calls (where N << 31) instead of 31 calls | Clarification 19 |
| All 31 dimensions | See full list below | Design doc: Dimensions |

---

## The 31 Dimensions

**Layer 1 — feel_ (21 dimensions):**

| # | Property | Scale |
|---|----------|-------|
| 1 | `feel_emotional_significance` | 0-1 |
| 2 | `feel_vulnerability` | 0-1 |
| 3 | `feel_trauma` | 0-1 |
| 4 | `feel_humor` | 0-1 |
| 5 | `feel_happiness` | 0-1 |
| 6 | `feel_sadness` | 0-1 |
| 7 | `feel_fear` | 0-1 |
| 8 | `feel_anger` | 0-1 |
| 9 | `feel_surprise` | 0-1 |
| 10 | `feel_disgust` | 0-1 |
| 11 | `feel_contempt` | 0-1 |
| 12 | `feel_embarrassment` | 0-1 |
| 13 | `feel_shame` | 0-1 |
| 14 | `feel_guilt` | 0-1 |
| 15 | `feel_excitement` | 0-1 |
| 16 | `feel_pride` | 0-1 |
| 17 | `feel_valence` | -1 to 1 |
| 18 | `feel_arousal` | 0-1 |
| 19 | `feel_dominance` | 0-1 |
| 20 | `feel_intensity` | 0-1 |
| 21 | `feel_coherence_tension` | 0-1 |

**Layer 2 — functional_ (10 dimensions):**

| # | Property | Scale |
|---|----------|-------|
| 1 | `functional_salience` | 0-1 |
| 2 | `functional_urgency` | 0-1 |
| 3 | `functional_social_weight` | 0-1 |
| 4 | `functional_agency` | 0-1 |
| 5 | `functional_novelty` | 0-1 |
| 6 | `functional_retrieval_utility` | 0-1 |
| 7 | `functional_narrative_importance` | 0-1 |
| 8 | `functional_aesthetic_quality` | 0-1 |
| 9 | `functional_valence` | 0-1 |
| 10 | `functional_coherence_tension` | 0-1 |

---

## Concrete Examples

**Example A — REM cycle trigger (Alex scenario):**

> Memory: "Met someone named Alex at coffee shop." Current scores: `functional_salience: 0.2`. New context: 10 new memories mentioning Alex. Sub-LLM response: `["functional_salience", "functional_narrative_importance", "functional_retrieval_utility"]`. Only 3 dimensions re-scored (not 31). Result: `functional_salience: 0.7`. Other 28 dimensions preserved.

**Example B — Relationship formation (banana bread scenario):**

> Memory: "Banana bread recipe from grandma's cookbook." Current scores: `feel_emotional_significance: 0.1`. New context: relationships formed with "mom's last birthday", "cooking with family", "grief processing through baking". Sub-LLM response: `["feel_emotional_significance", "feel_sadness", "feel_vulnerability", "functional_narrative_importance", "functional_social_weight"]`. 5 dimensions re-scored. Result: `feel_emotional_significance: 0.8`. Other 26 dimensions preserved.

**Example C — Retrieval threshold (tax deadline scenario):**

> Memory: "Tax filing deadline April 15." Current scores: `functional_urgency: 0.3`. New context: retrieval count crossed threshold 5 (8 retrievals in 2 weeks). Sub-LLM response: `["functional_urgency", "functional_retrieval_utility", "functional_salience"]`. 3 dimensions re-scored. Result: `functional_urgency: 0.9`. Other 28 dimensions preserved.

---

## Steps

### 1. Define the Dimension Schema Constant

Create a validated constant of all 31 dimension property names for response validation:

```typescript
const ALL_DIMENSIONS = [
  // Layer 1 — feel_
  'feel_emotional_significance', 'feel_vulnerability', 'feel_trauma',
  'feel_humor', 'feel_happiness', 'feel_sadness', 'feel_fear', 'feel_anger',
  'feel_surprise', 'feel_disgust', 'feel_contempt', 'feel_embarrassment',
  'feel_shame', 'feel_guilt', 'feel_excitement', 'feel_pride',
  'feel_valence', 'feel_arousal', 'feel_dominance', 'feel_intensity',
  'feel_coherence_tension',
  // Layer 2 — functional_
  'functional_salience', 'functional_urgency', 'functional_social_weight',
  'functional_agency', 'functional_novelty', 'functional_retrieval_utility',
  'functional_narrative_importance', 'functional_aesthetic_quality',
  'functional_valence', 'functional_coherence_tension',
] as const;

type DimensionName = typeof ALL_DIMENSIONS[number];
```

### 2. Create the Sub-LLM Dimension Impact Prompt

Design the Haiku prompt for `analyzeImpactedDimensions`. The prompt must:

- Present the memory content and current dimension scores
- Present the new context (varies by trigger type):
  - `rem_cycle`: new related memories, new relationships since last scoring
  - `relationship_formation`: the newly formed relationship + connected memory content/observation
  - `retrieval_threshold`: retrieval count, frequency, recency metadata
- Ask: "Given this memory and this new context, which of the 31 emotional/functional dimensions would have their scores meaningfully changed? Return ONLY the dimension property names that need re-scoring."
- Include the full list of 31 dimension names with brief descriptions for reference
- Require JSON array output: `["dimension_name_1", "dimension_name_2"]`
- Instruct to return empty array `[]` if no dimensions are impacted (memory scores are still accurate)

### 3. Implement `analyzeImpactedDimensions`

```typescript
interface ReEvaluationContext {
  memory: Memory;
  newRelationships: Relationship[];
  recentRelatedMemories: Memory[];
  relationshipObservations: string[];
  collectionEmotionalAverages: Record<string, number>;
  triggerType: 'rem_cycle' | 'relationship_formation' | 'retrieval_threshold';
  retrievalMetadata?: {
    retrievalCount: number;
    thresholdCrossed: number;
    retrievalFrequency: number;
    recentRetrievals: number;
  };
}

async function analyzeImpactedDimensions(
  memory: Memory,
  context: ReEvaluationContext
): Promise<DimensionName[]> {
  // 1. Construct prompt with memory content, current scores, and trigger-specific context
  // 2. Call Haiku
  // 3. Parse JSON array response
  // 4. Validate each name against ALL_DIMENSIONS
  // 5. Filter out invalid names (log warning for invalid names)
  // 6. Return validated array (may be empty)
}
```

Error handling:
- If Haiku returns invalid JSON, log error and return empty array (skip re-evaluation for this memory)
- If Haiku returns dimension names not in the schema, filter them out silently with a warning log
- If Haiku returns all 31 dimensions, proceed (the sub-LLM determined all are impacted — rare but valid)

### 4. Implement Partial Re-scoring Pipeline

Create `reEvaluateMemory(memory, context, impactedDimensions)` that:

1. Receives the array of impacted dimensions from Step 3
2. If array is empty, skip re-scoring entirely (no dimensions impacted)
3. For each impacted dimension, call the per-dimension Haiku scoring service (Task 147) with the enriched context
4. Collect new scores as a partial record: `Partial<Record<DimensionName, number>>`

### 5. Implement Score Merging

Create `mergeScores(existingScores, newPartialScores)` that:

1. Starts with a copy of all existing dimension scores
2. Overwrites only the re-scored dimensions with new values
3. Returns the complete set of 31 dimension scores (mix of old and new)

```typescript
function mergeScores(
  existing: Record<DimensionName, number | null>,
  partial: Partial<Record<DimensionName, number>>
): Record<DimensionName, number | null> {
  return { ...existing, ...partial };
}
```

### 6. Recompute Composites

After merging, recompute all three composite scores using Task 150's composite computation functions:

1. `feel_significance` from all 21 `feel_*` dimensions (using the merged scores)
2. `functional_significance` from all 10 `functional_*` dimensions
3. `total_significance` = `feel_significance` + `functional_significance`

This is critical: even if only 3 dimensions changed, the composites must reflect those changes.

### 7. Persist Updates

Write the merged scores + recomputed composites to Weaviate in a single update operation. The update payload includes:

- Only the re-scored dimension properties (not all 31 — avoid unnecessary writes for unchanged values)
- All 3 composite scores (always recomputed)
- `rem_touched_at` = current ISO timestamp
- `rem_visits` = current value + 1

### 8. Implement Tests

Create `src/rem/reeval/selective-reevaluation.spec.ts` (colocated with source):

**analyzeImpactedDimensions tests:**
- Test with REM cycle context (Alex scenario): returns salience-related dimensions
- Test with relationship context (banana bread scenario): returns emotional significance dimensions
- Test with retrieval context (tax deadline scenario): returns urgency-related dimensions
- Test with no impacted dimensions: returns empty array
- Test with invalid dimension names in response: filters them out, logs warning
- Test with malformed JSON response: returns empty array, logs error

**mergeScores tests:**
- Test partial merge: 3 new scores merged into 31 existing, other 28 preserved
- Test full merge: all 31 re-scored (all overwritten)
- Test empty merge: no new scores, all existing preserved
- Test merge with null existing scores: null values preserved for non-re-scored dimensions

**Composite recomputation tests:**
- Test that composites update after partial re-scoring (e.g., changing `feel_sadness` from 0.1 to 0.6 increases `feel_significance`)
- Test that unchanged dimensions still contribute to composite (old values used)
- Test with null dimension values excluded from composite computation

**Integration tests:**
- Test full pipeline: analyzeImpactedDimensions -> partial re-score -> merge -> recompute composites
- Test that total LLM calls = 1 (impact analysis) + N (re-scored dimensions), where N < 31
- Test that Weaviate update contains only changed dimensions + composites + REM metadata

---

## Verification

- [ ] Sub-LLM prompt clearly presents memory content, current scores, and trigger-specific context
- [ ] `analyzeImpactedDimensions` returns valid dimension name arrays for all three trigger types
- [ ] Invalid dimension names in LLM response are filtered out with warning log
- [ ] Malformed JSON response handled gracefully (empty array, error logged)
- [ ] Empty array response causes re-evaluation to be skipped entirely (no unnecessary scoring calls)
- [ ] Only impacted dimensions are re-scored via per-dimension Haiku calls (not all 31)
- [ ] Existing scores preserved for non-impacted dimensions
- [ ] `mergeScores` correctly overlays new partial scores onto existing complete scores
- [ ] `feel_significance` recomputed from all 21 feel_ dimensions (mixed old + new)
- [ ] `functional_significance` recomputed from all 10 functional_ dimensions (mixed old + new)
- [ ] `total_significance` = `feel_significance` + `functional_significance`
- [ ] Weaviate update includes only changed dimensions + all 3 composites + `rem_touched_at` + `rem_visits`
- [ ] Total LLM calls = 1 (impact analysis) + N (impacted dimensions), measurably less than 31
- [ ] All three trigger types can invoke this pipeline with their specific context
- [ ] All tests pass with mocked Haiku responses

---

## Expected Output

- `src/rem/reeval/selective-reevaluation.ts` — `analyzeImpactedDimensions`, `reEvaluateMemory`, `mergeScores`, composite recomputation orchestration
- `src/rem/reeval/selective-reevaluation.spec.ts` — unit tests covering all scenarios
- `src/rem/reeval/dimension-impact-prompt.ts` — sub-LLM prompt template for dimension impact analysis
- Shared pipeline used by all three triggers (Tasks 153, 154, 155)
- Measurable reduction in LLM calls: typical re-evaluation uses 1 + 3-5 calls instead of 31

---

**Previous Tasks**: [task-153](./task-153-rem-cycle-reevaluation-trigger.md), [task-154](./task-154-relationship-formation-trigger.md), [task-155](./task-155-retrieval-threshold-trigger.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md` (Retroactive Reweighting, Selective Re-scoring)
**Clarifications**: 18 (selective re-evaluation concept), 19 (all three concrete examples)
