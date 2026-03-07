# Task 147: Per-Dimension Haiku Scoring

**Milestone**: [M28 - REM Emotional Weighting -- Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 6 hours
**Dependencies**: Task 145
**Status**: Not Started

---

## Objective

Implement per-dimension Haiku scoring with rubric definitions for all 31 emotional/functional dimensions. Each dimension gets its own dedicated Haiku call with a tailored rubric for maximum scoring accuracy.

---

## Context

Emotional weighting requires scoring each memory on 31 independent dimensions. The design mandates per-dimension scoring (31 separate Haiku calls per memory) rather than a single call scoring all dimensions at once, because dedicated calls with focused rubrics produce more accurate, calibrated results.

Each call receives:
- Memory content text
- Memory metadata (`content_type`, `created_at` -- NOT tags)
- Contextual information (from Task 148: relationship observations, nearest-neighbor scores, collection averages)
- The rubric/definition for the specific dimension being scored

Each call returns a single numeric score: 0-1 float for most dimensions, -1 to 1 for `feel_valence`.

Cost: ~$0.75 per 500 memories (31 Haiku calls each).

---

## Key Design Decisions

### Scoring Architecture

| Decision | Choice | Rationale |
|---|---|---|
| Scoring approach | Per-dimension (31 separate Haiku calls) | Maximum accuracy per dimension |
| Layer relationship | Independent -- not computed from each other | Each layer scored separately by Haiku |
| Rubrics | Yes, include emotional definitions per dimension in prompt | Consistent scoring across calls |
| Metadata in prompt | `content_type` and `created_at` only | Tags excluded per design doc |
| Error handling | Default to null on failure | Don't crash on individual dimension failure |
| Cost | ~$0.75 per 500 memories | Own cost cap, separate from clar-17 |

---

## Steps

### 1. Define Dimension Registry

Create a registry/map of all 31 dimensions with their metadata:

```typescript
interface DimensionDefinition {
  property: string;           // e.g., 'feel_emotional_significance'
  layer: 'feel' | 'functional';
  category: string;           // e.g., 'Meta', 'Core emotion', 'Self-conscious', 'Dimensional', 'Cognitive'
  description: string;        // Human-readable description
  range: { min: number; max: number };  // { min: 0, max: 1 } or { min: -1, max: 1 }
  rubric: {
    low: string;              // What a 0 (or -1) score means
    mid: string;              // What a 0.5 (or 0) score means
    high: string;             // What a 1 score means
    examples?: string[];      // Anchoring examples for calibration
  };
}
```

**Layer 1 dimensions to define:**
1. `feel_emotional_significance` -- Meta: Overall emotional weight of the memory
2. `feel_vulnerability` -- Meta: Degree of personal exposure or openness
3. `feel_trauma` -- Meta: Intensity of negative formative experience
4. `feel_humor` -- Positive: Comedic or playful quality
5. `feel_happiness` -- Core emotion: Positive affect / joy
6. `feel_sadness` -- Core emotion: Negative affect / grief / loss
7. `feel_fear` -- Core emotion: Threat perception / anxiety
8. `feel_anger` -- Core emotion: Frustration / injustice response
9. `feel_surprise` -- Core emotion: Unexpectedness / novelty
10. `feel_disgust` -- Core emotion: Aversion / rejection response
11. `feel_contempt` -- Core emotion: Superiority / dismissal
12. `feel_embarrassment` -- Self-conscious: Social discomfort from perceived misstep
13. `feel_shame` -- Self-conscious: Deep self-judgment, identity-level
14. `feel_guilt` -- Self-conscious: Responsibility for harm caused
15. `feel_excitement` -- Positive: Anticipatory positive arousal
16. `feel_pride` -- Positive: Positive self-evaluation / accomplishment
17. `feel_valence` -- Dimensional (VAD): Positive-negative spectrum (-1 to 1)
18. `feel_arousal` -- Dimensional (VAD): Activation level, calm to excited
19. `feel_dominance` -- Dimensional (VAD): Feeling of control vs. submission
20. `feel_intensity` -- Dimensional: Overall emotional magnitude regardless of type
21. `feel_coherence_tension` -- Cognitive: Degree of conflict with existing beliefs/memories

**Layer 2 dimensions to define:**
1. `functional_salience` -- How unexpected or novel (prediction error)
2. `functional_urgency` -- How time-sensitive (decay rate)
3. `functional_social_weight` -- How much affected relationships/reputation
4. `functional_agency` -- Caused by bot's own actions?
5. `functional_novelty` -- How unique relative to collection
6. `functional_retrieval_utility` -- Likely useful in future queries?
7. `functional_narrative_importance` -- Advances/anchors personal story arc?
8. `functional_aesthetic_quality` -- Beauty, craft, artistry
9. `functional_valence` -- Positive-negative functional spectrum (scored independently from feel_valence)
10. `functional_coherence_tension` -- Functional conflict with existing patterns (scored independently from feel_coherence_tension)

### 2. Create Scoring Service

Create an `EmotionalScoringService` class/module:

```typescript
interface ScoringInput {
  memory: {
    content: string;
    content_type: string;
    created_at: string;
  };
  dimension: DimensionDefinition;
  context: ScoringContext;  // From Task 148
}

interface ScoringResult {
  property: string;
  score: number | null;  // null on failure
}
```

The service should:
- Accept a memory, dimension definition, and scoring context
- Construct a Haiku prompt that includes the rubric, memory content, metadata, and context
- Call Haiku and parse the numeric response
- Validate the response is within the valid range for the dimension
- Return null (not throw) on any failure

### 3. Implement Prompt Template

Design the Haiku prompt template that includes:
- The dimension name and full description
- The rubric (low/mid/high definitions and examples)
- The memory content text
- Memory metadata (`content_type`, `created_at`)
- Contextual information (relationship observations, neighbor scores, collection averages)
- Clear instruction to return ONLY a single numeric value

Example prompt structure:
```
You are scoring a memory on the dimension "{dimension_name}".

DIMENSION DEFINITION:
{description}

SCORING RUBRIC:
- 0 (low): {rubric.low}
- 0.5 (mid): {rubric.mid}
- 1 (high): {rubric.high}

MEMORY:
Content: {content}
Type: {content_type}
Created: {created_at}

CONTEXT:
{relationship_observations}
{nearest_neighbor_scores}
{collection_averages}

Respond with ONLY a single number between {min} and {max}.
```

### 4. Implement Score-All Function

Create a function that scores a single memory on all 31 dimensions:

```typescript
async function scoreAllDimensions(
  memory: Memory,
  context: ScoringContext
): Promise<Record<string, number | null>>
```

- Iterates through all 31 dimension definitions
- Calls the scoring service for each dimension
- Returns a map of property name to score (or null on failure)
- Handles partial failures gracefully (some dimensions can fail while others succeed)

### 5. Write Tests

Create colocated `.spec.ts` tests:
- Dimension registry has exactly 31 entries (21 feel + 10 functional)
- All dimensions have complete rubric definitions
- Scoring service handles valid Haiku responses correctly
- Scoring service returns null on invalid/failed responses (not crash)
- `feel_valence` range validated as -1 to 1
- All other dimensions validated as 0-1
- Prompt template includes rubric, memory content, metadata, and context
- Prompt template does NOT include tags
- Score-all function returns results for all 31 dimensions
- Score-all function handles partial failures (some null, some valid)

---

## Verification

- [ ] Dimension registry contains exactly 31 entries
- [ ] All 21 Layer 1 (`feel_*`) dimensions defined with rubrics
- [ ] All 10 Layer 2 (`functional_*`) dimensions defined with rubrics
- [ ] `feel_valence` rubric covers -1 to 1 range; all others cover 0-1
- [ ] Haiku prompt includes dimension rubric, memory content, `content_type`, `created_at`
- [ ] Haiku prompt does NOT include tags
- [ ] Haiku prompt includes contextual information placeholder (for Task 148)
- [ ] Invalid/failed responses default to null rather than crashing
- [ ] Score-all function returns map of all 31 property names to scores
- [ ] Service is extensible for adding new dimensions (just add to registry)
- [ ] Tests colocated with source file using `.spec.ts` suffix
- [ ] All tests pass with mocked Haiku responses

---

## Expected Output

A scoring service that can score any memory on any of the 31 emotional/functional dimensions via individual Haiku calls with dimension-specific rubrics. Includes a dimension registry with complete definitions and a score-all function that processes all 31 dimensions and returns validated numeric scores (or null on failure).

---

**Next Task**: [task-148-scoring-context-gathering.md](./task-148-scoring-context-gathering.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
