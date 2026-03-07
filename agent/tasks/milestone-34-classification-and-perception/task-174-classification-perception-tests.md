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
    - adds memory to quality array
    - adds memory to thematic_group array
    - does not duplicate memory_id if already present
    - can classify with genre only
    - can classify with quality only
    - can classify with thematic_group only
    - can classify with all three at once
    - validates genre against 18-value enum
    - validates quality against 5-value enum
    - accepts any string for thematic_group (emergent)
    - updates last_updated on write

  describe('removeFromIndex')
    - removes memory_id from all genre arrays
    - removes memory_id from all quality arrays
    - removes memory_id from all thematic_group arrays
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
    - assigns genre from predefined 18-value list
    - assigns quality signal from 5-value enum
    - generates emergent thematic group names

  describe('duplicate detection')
    - flags near-duplicates as quality: 'duplicate'
    - does NOT auto-delete duplicates
    - identifies merge candidates

  describe('contradiction detection')
    - detects contradictions between memories
    - creates coherence pressure in mood system when contradictions found

  describe('batch processing')
    - caps at batch size (10-20 per cycle)
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
    - creates perception document with correct defaults
    - confidence starts at 0.2
    - empty arrays for interests, patterns, needs, evolution_notes
    - empty strings for personality_sketch, communication_style, emotional_baseline

  describe('getPerception')
    - returns perception when it exists
    - returns null when not found

  describe('getSelfPerception')
    - reads from perceptions/{owner_id} (self-perception path)
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
    - confidence increases with consistent interactions
    - confidence decreases on contradictory signals
    - confidence clamped to [0, 1]

  describe('field drift rates')
    - personality_sketch updates slowly (identity, stable trait)
    - communication_style updates slowly (stable trait)
    - emotional_baseline updates slowly (stable trait)
    - patterns update at moderate rate (behavioral, more dynamic)
    - interests update at moderate rate
    - needs update at moderate rate

  describe('evolution notes')
    - significant changes produce new evolution notes
    - notes are descriptive of what changed
    - notes are never removed

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
- [ ] Genre validation tests cover all 18 values
- [ ] Quality validation tests cover all 5 values
