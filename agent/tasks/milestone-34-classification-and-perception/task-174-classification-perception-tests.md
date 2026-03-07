# Task 174: Unit Tests — Classification & Perception

**Milestone**: M34 — Classification & User Perception
**Status**: Not Started
**Estimated Hours**: 3-4
**Dependencies**: Tasks 171-173

---

## Objective

Comprehensive unit tests for ClassificationService, REM classification pipeline, PerceptionService, and REM perception updates. Tests are colocated with source files using `.spec.ts` suffix.

**IMPORTANT**: Tests are COLOCATED with source files using `.spec.ts` suffix. NEVER use `__tests__/` directories.

## Test Files

- `src/services/classification.service.spec.ts` — ClassificationService CRUD tests
- `src/services/perception.service.spec.ts` — PerceptionService CRUD tests
- REM classification pipeline tests colocated with the pipeline implementation `.spec.ts`
- REM perception update tests colocated with the update implementation `.spec.ts`

## Test Suites

### 1. ClassificationService CRUD

```
describe('ClassificationService')
  describe('initializeIndex')
    - creates empty index with empty genres, quality, thematic_groups maps
    - sets unclassified_count to 0
    - sets last_updated

  describe('getClassifications')
    - returns full index when it exists
    - returns null when no index exists

  describe('getOrInitialize')
    - returns existing index if present
    - creates and returns empty index if not present

  describe('getByGenre')
    - returns memory_ids for a specific genre
    - returns empty array for genre with no memories
    - returns empty array for unknown genre

  describe('getByQuality')
    - returns memory_ids for 'substantive'
    - returns memory_ids for 'draft'
    - returns memory_ids for 'low_value'
    - returns memory_ids for 'duplicate'
    - returns memory_ids for 'stale'
    - returns empty array for quality with no memories

  describe('getByThematicGroup')
    - returns memory_ids for an existing thematic group
    - returns empty array for unknown thematic group

  describe('classify')
    - adds memory to genre array
    - adds memory to multiple quality arrays (NOT mutually exclusive)
    - adds memory to multiple thematic_group arrays (multiple per memory)
    - thematic groups normalized to snake_case
    - does not duplicate memory_id if already present
    - can classify with genre only
    - can classify with qualities only
    - can classify with thematic_groups only
    - can classify with all three at once
    - validates genre against 18-value closed set enum
    - validates quality against 5-value enum
    - accepts any string for thematic_group (emergent, snake_case normalized)
    - updates last_updated on write

  describe('addMergeCandidate')
    - adds merge candidate entry to classifications doc
    - merge candidate is a near duplicate (not exact match)
    - stored per collection (collection-scoped)

  describe('removeFromIndex')
    - removes memory_id from all genre arrays
    - removes memory_id from all quality arrays
    - removes memory_id from all thematic_group arrays
    - removes memory_id from merge_candidates
    - handles memory_id not in any array gracefully

  describe('getUnclassifiedCount')
    - returns correct count
    - returns 0 for new index

  describe('setUnclassifiedCount')
    - updates the count correctly
```

### 2. REM Classification Pipeline

```
describe('REM Classification Pipeline')
  describe('unclassified memory detection')
    - identifies memories not in any classification list
    - processes oldest unclassified first

  describe('findSimilar context')
    - calls findSimilar for each unclassified memory
    - passes nearest neighbors to sub-LLM prompt

  describe('sub-LLM classification')
    - assigns genre from closed set of 18 values
    - assigns multiple quality signals per memory (NOT mutually exclusive)
    - generates emergent thematic group names in snake_case
    - assigns multiple thematic groups per memory

  describe('duplicate detection')
    - flags exact content matches as quality: 'duplicate'
    - does NOT auto-delete duplicates
    - identifies near duplicates as merge candidates (different from duplicates)
    - stores merge candidates in classifications Firestore collection

  describe('contradiction detection')
    - detects contradictions between memories
    - creates coherence pressure with CONTRADICTION_PRESSURE_MAGNITUDE = -0.15

  describe('batch processing')
    - caps at CLASSIFICATION_BATCH_SIZE = 20
    - processes remaining in subsequent cycles

  describe('error handling')
    - handles Haiku call failure gracefully (skips memory)
    - handles malformed Haiku response (skips memory)
    - retries skipped memories in next cycle

  describe('index updates')
    - updates ClassificationIndex via ClassificationService
    - decrements unclassified_count after processing
```

### 3. PerceptionService CRUD

```
describe('PerceptionService')
  describe('initializePerception')
    - creates perception inside CoreMoodMemory.perceptions map (NOT separate Firestore doc)
    - confidence starts at 0.2
    - initialized on ghost-user conversation initialization
    - empty arrays for interests, patterns, needs, evolution_notes
    - empty strings for personality_sketch, communication_style, emotional_baseline

  describe('getPerception')
    - returns perception from CoreMoodMemory.perceptions map
    - returns null when not found

  describe('getSelfPerception')
    - reads from CoreMoodMemory.perceptions[owner_id] (self-perception)
    - returns null when not found

  describe('getOrInitialize')
    - returns existing perception if present
    - creates and returns initial perception if not present

  describe('updatePerception')
    - partial update does not clobber other fields
    - updates last_updated on every write

  describe('appendEvolutionNote')
    - appends note to evolution_notes array
    - preserves existing notes (append-only)
    - never removes or modifies existing notes

  describe('adjustConfidence')
    - increases confidence by positive delta
    - decreases confidence by negative delta
    - clamps to [0, 1] (never below 0)
    - clamps to [0, 1] (never above 1)
```

### 4. REM Perception Updates

```
describe('REM Perception Updates')
  describe('confidence evolution')
    - confidence formula: min(1.0, 0.2 + (interaction_count * 0.02))
    - confidence increases with consistent interactions
    - confidence decreases on contradictory signals
    - confidence clamped to [0, 1]

  describe('field drift rates')
    - personality_sketch updates at IDENTITY_DRIFT_RATE = 0.05
    - communication_style updates at IDENTITY_DRIFT_RATE = 0.05
    - emotional_baseline updates at IDENTITY_DRIFT_RATE = 0.05
    - patterns update at BEHAVIOR_DRIFT_RATE = 0.15
    - interests update at BEHAVIOR_DRIFT_RATE = 0.15
    - needs update at BEHAVIOR_DRIFT_RATE = 0.15

  describe('evolution notes')
    - significant changes produce new evolution notes
    - notes are descriptive of what changed
    - notes are never removed
    - LLM condense strategy (not hard max count)
    - dropped notes preserved via context pattern scheme

  describe('mood interaction')
    - emotional_baseline used to calibrate arousal interpretation
    - communication_style affects social_warmth calculation
    - patterns feed into trust assessment
    - needs alignment affects purpose/coherence
```

## Verification

- [ ] All new tests pass
- [ ] Existing tests unaffected
- [ ] Tests colocated with source files using `.spec.ts` suffix
- [ ] No `__tests__/` directories created
- [ ] Genre validation tests cover all 18 values (closed set)
- [ ] Quality validation tests cover all 5 values (multiple per memory)
- [ ] Classification tests use collection-scoped paths (not user-scoped)
- [ ] Perception tests verify storage inside CoreMoodMemory (not separate Firestore docs)
- [ ] Thematic group tests verify snake_case normalization
- [ ] Thematic group tests verify multiple groups per memory
