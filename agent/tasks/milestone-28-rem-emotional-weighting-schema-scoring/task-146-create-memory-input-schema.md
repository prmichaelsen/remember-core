# Task 146: Create-Memory Input Schema

**Milestone**: [M28 - REM Emotional Weighting -- Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 2 hours
**Dependencies**: Task 145
**Status**: Not Started

---

## Objective

Add all 31 `feel_*` / `functional_*` dimension fields plus `observation` as optional inputs on `create_memory`, allowing the creating LLM to seed initial values that REM will later re-score.

---

## Context

When an LLM creates a memory, it often has enough context to provide reasonable initial emotional/functional scores. Making these fields optional on the create input allows the creating LLM to seed values. REM always re-scores during its cycle regardless of whether defaults were provided -- REM scoring is authoritative.

Composite weights (`feel_significance`, `functional_significance`, `total_significance`) can also be set by the creating LLM at creation time. If individual dimensions are provided but composites are not, compute composites from the provided dimension values.

---

## Key Design Decisions

### Create-Time Defaults

| Decision | Choice | Rationale |
|---|---|---|
| All 31 dimensions optional on create | Yes | LLM can provide sane defaults at creation |
| Observation optional on create | Yes | Creating LLM generates initial summary/insight |
| Composites optional on create | Yes, initially set by creating LLM | REM re-computes during scoring |
| REM re-scoring | Always re-scores, even with create-time defaults | REM scoring is authoritative |
| REM metadata on create | Not settable -- `rem_touched_at` and `rem_visits` are REM-only | Only REM Phase 0 sets these |

---

## Steps

### 1. Update CreateMemoryInput Type

Add the following optional properties to `CreateMemoryInput`:

**Layer 1 -- 21 Discrete Emotions (all optional number):**
- `feel_emotional_significance` (0-1)
- `feel_vulnerability` (0-1)
- `feel_trauma` (0-1)
- `feel_humor` (0-1)
- `feel_happiness` (0-1)
- `feel_sadness` (0-1)
- `feel_fear` (0-1)
- `feel_anger` (0-1)
- `feel_surprise` (0-1)
- `feel_disgust` (0-1)
- `feel_contempt` (0-1)
- `feel_embarrassment` (0-1)
- `feel_shame` (0-1)
- `feel_guilt` (0-1)
- `feel_excitement` (0-1)
- `feel_pride` (0-1)
- `feel_valence` (-1 to 1)
- `feel_arousal` (0-1)
- `feel_dominance` (0-1)
- `feel_intensity` (0-1)
- `feel_coherence_tension` (0-1)

**Layer 2 -- 10 Functional Signals (all optional number, 0-1):**
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

**Composites (all optional number):**
- `feel_significance`
- `functional_significance`
- `total_significance`

**Observation (optional text):**
- `observation`

### 2. Add Input Validation

Implement validation for value ranges:
- Most `feel_*` and all `functional_*` dimensions: 0-1 float
- `feel_valence`: -1 to 1 float
- Reject out-of-range values with a clear error message
- `observation`: string, no range validation needed
- Composites: no range validation (computed values)

### 3. Update MemoryService.create

Pass through the new optional fields when creating a memory in Weaviate:
- If individual dimension values are provided but composites are not, compute composites from the provided values using equal weighting
- If composites are provided directly, use them as-is
- If neither dimensions nor composites are provided, leave all null
- Do NOT set `rem_touched_at` or `rem_visits` -- these are REM-only fields

### 4. Update OpenAPI Spec

Add all 31 dimension fields + `observation` + 3 composite fields as optional properties on the create memory request schema in both `docs/openapi.yaml` (svc) and `docs/openapi-web.yaml` (app).

### 5. Write Tests

Create colocated `.spec.ts` tests:
- Creating a memory with `feel_*`/`functional_*` values persists them correctly
- Creating a memory without the new fields works as before (null defaults)
- Value range validation rejects out-of-range values (e.g., `feel_happiness: 1.5`, `feel_valence: -2.0`)
- `feel_valence` accepts full -1 to 1 range
- Composites auto-computed when dimensions provided but composites omitted
- `observation` text persisted correctly
- `rem_touched_at` and `rem_visits` cannot be set via create_memory

---

## Verification

- [ ] `CreateMemoryInput` type includes all 21 `feel_*` + 10 `functional_*` dimensions as optional
- [ ] `CreateMemoryInput` includes `observation` as optional text
- [ ] `CreateMemoryInput` includes 3 composite scores as optional
- [ ] `CreateMemoryInput` does NOT include `rem_touched_at` or `rem_visits`
- [ ] Creating a memory with dimension values persists them correctly in Weaviate
- [ ] Creating a memory without the new fields works as before (null defaults)
- [ ] Value range validation rejects `feel_happiness: 1.5` (out of 0-1 range)
- [ ] Value range validation rejects `feel_valence: -2.0` (out of -1 to 1 range)
- [ ] `feel_valence` accepts -1, 0, and 1
- [ ] Composites computed from dimensions when not explicitly provided
- [ ] OpenAPI specs updated in both `docs/openapi.yaml` and `docs/openapi-web.yaml`
- [ ] Tests colocated with source file using `.spec.ts` suffix
- [ ] All tests pass

---

## Expected Output

Memories can be created with optional emotional/functional dimension scores, composite scores, and observation text. The create API accepts and persists these values when provided, validates ranges, auto-computes composites when needed, and defaults to null when omitted. REM metadata fields are not settable via create.

---

**Next Task**: [task-147-per-dimension-haiku-scoring.md](./task-147-per-dimension-haiku-scoring.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
