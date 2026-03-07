# Task 145: Weaviate Schema Migration

**Milestone**: [M28 - REM Emotional Weighting -- Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add 37 new properties to the Memory class in Weaviate schema to support emotional weighting dimensions (31), composite scores (3), REM metadata (2), and observation text (1).

---

## Context

REM emotional weighting requires storing scored dimensions directly on each memory in Weaviate. The 37 new properties break down as:

- **21 Layer 1 discrete emotions** (`feel_` prefix, 0-1 float, except `feel_valence` which is -1 to 1)
- **10 Layer 2 functional signals** (`functional_` prefix, 0-1 float) -- 8 unique + `functional_valence` and `functional_coherence_tension` scored independently from their Layer 1 counterparts
- **3 composite scores** (float): `feel_significance`, `functional_significance`, `total_significance`
- **2 REM metadata**: `rem_touched_at` (ISO timestamp string), `rem_visits` (integer, default 0)
- **1 observation**: `observation` (text)

All new properties must default to null/0 so existing memories remain unaffected.

---

## Key Design Decisions

### Schema

| Decision | Choice | Rationale |
|---|---|---|
| Total new properties | 37 (31 dimensions + 3 composites + 2 REM metadata + 1 observation) | From design doc migration path |
| Storage | All in Weaviate as individual properties | Queryable and sortable at query time |
| Scale | 0-1 float (feel_valence: -1 to 1) | Continuous scale for fine-grained scoring |
| Property prefix | `feel_` for emotions, `functional_` for signals | Distinguishes the two independent layers |
| Shared dimensions | valence and coherence_tension appear in both layers with independent scores | `feel_valence` / `functional_valence`, `feel_coherence_tension` / `functional_coherence_tension` |

---

## Steps

### 1. Define All 37 Property Specifications

The complete list of properties to add to the Memory class:

**Layer 1 -- 21 Discrete Emotions (all NUMBER type):**

| # | Property | Range | Description |
|---|----------|-------|-------------|
| 1 | `feel_emotional_significance` | 0-1 | Overall emotional weight |
| 2 | `feel_vulnerability` | 0-1 | Degree of personal exposure |
| 3 | `feel_trauma` | 0-1 | Intensity of negative formative experience |
| 4 | `feel_humor` | 0-1 | Comedic or playful quality |
| 5 | `feel_happiness` | 0-1 | Positive affect / joy |
| 6 | `feel_sadness` | 0-1 | Negative affect / grief / loss |
| 7 | `feel_fear` | 0-1 | Threat perception / anxiety |
| 8 | `feel_anger` | 0-1 | Frustration / injustice response |
| 9 | `feel_surprise` | 0-1 | Unexpectedness / novelty |
| 10 | `feel_disgust` | 0-1 | Aversion / rejection response |
| 11 | `feel_contempt` | 0-1 | Superiority / dismissal |
| 12 | `feel_embarrassment` | 0-1 | Social discomfort from perceived misstep |
| 13 | `feel_shame` | 0-1 | Deep self-judgment, identity-level |
| 14 | `feel_guilt` | 0-1 | Responsibility for harm caused |
| 15 | `feel_excitement` | 0-1 | Anticipatory positive arousal |
| 16 | `feel_pride` | 0-1 | Positive self-evaluation / accomplishment |
| 17 | `feel_valence` | -1 to 1 | Positive-negative spectrum |
| 18 | `feel_arousal` | 0-1 | Activation level, calm to excited |
| 19 | `feel_dominance` | 0-1 | Feeling of control vs. submission |
| 20 | `feel_intensity` | 0-1 | Overall emotional magnitude regardless of type |
| 21 | `feel_coherence_tension` | 0-1 | Degree of conflict with existing beliefs/memories |

**Layer 2 -- 10 Functional Signals (all NUMBER type, 0-1):**

| # | Property | Description |
|---|----------|-------------|
| 1 | `functional_salience` | How unexpected or novel (prediction error) |
| 2 | `functional_urgency` | How time-sensitive (decay rate) |
| 3 | `functional_social_weight` | How much affected relationships/reputation |
| 4 | `functional_agency` | Caused by bot's own actions? |
| 5 | `functional_novelty` | How unique relative to collection |
| 6 | `functional_retrieval_utility` | Likely useful in future queries? |
| 7 | `functional_narrative_importance` | Advances/anchors personal story arc? |
| 8 | `functional_aesthetic_quality` | Beauty, craft, artistry |
| 9 | `functional_valence` | Positive-negative spectrum (scored independently from feel_valence) |
| 10 | `functional_coherence_tension` | Conflict with existing beliefs (scored independently from feel_coherence_tension) |

**Composites (all NUMBER type):**

| # | Property | Description |
|---|----------|-------------|
| 1 | `feel_significance` | Weighted sum of Layer 1 |
| 2 | `functional_significance` | Weighted sum of Layer 2 |
| 3 | `total_significance` | feel_significance + functional_significance |

**REM Metadata:**

| # | Property | Type | Description |
|---|----------|------|-------------|
| 1 | `rem_touched_at` | TEXT | ISO timestamp of last REM scoring |
| 2 | `rem_visits` | INT (default 0) | How many times REM has scored this memory |

**Observation:**

| # | Property | Type | Description |
|---|----------|------|-------------|
| 1 | `observation` | TEXT | LLM-generated summary/insight |

### 2. Update Schema Definition

Add all 37 properties to the Memory class schema definition file. Use Weaviate property types:
- `number` for all float properties (31 dimensions + 3 composites)
- `int` for `rem_visits`
- `text` for `rem_touched_at` and `observation`

All float/int properties default to null (not 0) except `rem_visits` which defaults to 0.

### 3. Create Backward-Compatible Migration

Create a migration that adds the new properties to existing Weaviate collections without affecting existing data:
- Use Weaviate's schema update API to add properties one at a time (Weaviate requires individual property additions)
- Make migration idempotent -- check if property exists before adding
- Handle both fresh collections (properties included at creation) and existing collections (properties added via migration)

### 4. Write Tests

Create tests in a colocated `.spec.ts` file:
- Verify all 37 properties present in schema after migration
- Verify existing memories remain readable after migration
- Verify float properties accept valid ranges (0-1 and -1 to 1 for valence)
- Verify `rem_visits` defaults to 0
- Verify migration is idempotent (running twice does not error)
- Verify `observation` and `rem_touched_at` accept text values

---

## Verification

- [ ] All 37 properties present in Weaviate Memory class schema
- [ ] Layer 1: 21 `feel_*` properties defined as NUMBER
- [ ] Layer 2: 10 `functional_*` properties defined as NUMBER
- [ ] Composites: `feel_significance`, `functional_significance`, `total_significance` defined as NUMBER
- [ ] `rem_visits` defined as INT with default 0
- [ ] `rem_touched_at` defined as TEXT
- [ ] `observation` defined as TEXT
- [ ] `feel_valence` accepts -1 to 1 range; all other floats accept 0-1
- [ ] Existing memories remain readable and unaffected after migration
- [ ] Migration is idempotent (can run multiple times safely)
- [ ] Tests colocated with source file using `.spec.ts` suffix
- [ ] All tests pass

---

## Expected Output

Weaviate Memory class schema includes all 37 new properties with correct types. Existing memories continue to work with null/default values for the new fields. Migration can be applied to both fresh and existing environments without data loss.

---

**Next Task**: [task-146-create-memory-input-schema.md](./task-146-create-memory-input-schema.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
