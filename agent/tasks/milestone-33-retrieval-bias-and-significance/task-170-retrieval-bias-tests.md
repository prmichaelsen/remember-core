# Task 170: Unit Tests — Retrieval Bias & Significance

**Milestone**: M33 — Retrieval Bias & Significance
**Status**: Not Started
**Estimated Hours**: 3-4
**Dependencies**: Tasks 168-169

---

## Objective

Comprehensive unit tests for mood-biased retrieval, significance scoring, and anticipatory emotion. Tests are colocated with source files using `.spec.ts` suffix.

**IMPORTANT**: Tests are COLOCATED with source files using `.spec.ts` suffix. NEVER use `__tests__/` directories.

## Test Suites

### 1. applyMoodBias Tests

```
describe('applyMoodBias')
  describe('low confidence bias (confidence < 0.3)')
    - boosts memories tagged 'failure' by 1.3x
    - boosts memories tagged 'lesson' by 1.3x
    - does not boost failure/lesson memories when confidence >= 0.3
    - does not boost untagged memories

  describe('high social_warmth bias (social_warmth > 0.7)')
    - boosts conversation content_type by 1.2x
    - boosts memories tagged 'collaboration' by 1.2x
    - does not boost when social_warmth <= 0.7

  describe('low coherence bias (coherence < 0.4)')
    - boosts memories tagged 'contradiction' by 1.4x
    - boosts memories tagged 'unresolved' by 1.4x
    - does not boost when coherence >= 0.4

  describe('negative valence self-correction (valence < -0.5)')
    - boosts positive high-weight (> 0.7) memories by 1.15x
    - requires BOTH weight > 0.7 AND 'positive' tag for boost
    - does not boost when valence >= -0.5
    - does not boost low-weight positive memories

  describe('low trust bias (trust < 0.3)')
    - boosts memories tagged 'betrayal' by 1.3x
    - boosts memories tagged 'broken_promise' by 1.3x
    - suppresses memories with trust > 0.7 by 0.7x
    - does not trigger when trust >= 0.3

  describe('high trust bias (trust > 0.8)')
    - boosts memories tagged 'shared_experience' by 1.2x
    - boosts memories tagged 'vulnerability' by 1.2x
    - does not trigger when trust <= 0.8

  describe('stacking and edge cases')
    - multiple bias rules stack multiplicatively
    - neutral mood (valence=0, others=0.5) produces biasMultiplier=1.0 for all memories
    - returns results unchanged when mood is null/undefined
    - results are re-sorted by updated computed_weight
    - empty results array returns empty array
```

### 2. calculateMemorySignificance Tests

```
describe('calculateMemorySignificance')
  describe('salience modifier')
    - arousal=1.0 adds 0.2
    - arousal=0.5 adds 0.1
    - arousal=0.0 adds 0.0

  describe('valenceIntensity modifier')
    - valence=1.0 adds 0.15
    - valence=-1.0 adds 0.15 (absolute value)
    - valence=0.0 adds 0.0

  describe('agency modifier')
    - triggered_by='self' adds 0.1
    - triggered_by='user' adds 0.0
    - triggered_by=undefined adds 0.0

  describe('coherenceTension modifier')
    - coherence=0.0 adds 0.15 (max tension)
    - coherence=1.0 adds 0.0 (no tension)
    - coherence=0.5 adds 0.075

  describe('socialWeight modifier')
    - involves_other_users=true, social_warmth=1.0 adds 0.1
    - involves_other_users=true, social_warmth=0.5 adds 0.05
    - involves_other_users=false adds 0.0 regardless of social_warmth

  describe('trustFlux modifier')
    - involves_other_users=true, trust=0.5 adds 0.15 (peak flux)
    - involves_other_users=true, trust=0.0 adds 0.0 (no flux)
    - involves_other_users=true, trust=1.0 adds 0.0 (no flux)
    - involves_other_users=true, trust=0.25 adds 0.075
    - involves_other_users=true, trust=0.75 adds 0.075
    - involves_other_users=false adds 0.0 regardless of trust

  describe('clamping')
    - result clamped to [0, 1]
    - result never goes below 0
    - result never exceeds 1

  describe('no mood state')
    - returns base significance only when no mood exists
```

### 3. Anticipatory Emotion Tests

```
describe('anticipatory emotion')
  describe('pattern detection')
    - identifies recurring patterns in recent memories
    - does not create pressures when no patterns detected

  describe('pressure creation')
    - creates pressure with correct dimension (typically valence)
    - magnitude in expected range (-0.15 to +0.15)
    - decay_rate in expected range (0.3-0.5)
    - reason describes the anticipation
    - source_memory_id links to most recent pattern memory

  describe('caps and limits')
    - max 3 anticipatory pressures per cycle
    - additional patterns beyond 3 are ignored

  describe('valence direction')
    - negative historical outcomes produce negative anticipated valence
    - positive historical outcomes produce positive anticipated valence

  describe('integration')
    - anticipatory pressures added before aggregation step in REM pipeline
```

## Verification

- [ ] All new tests pass
- [ ] Existing search tests unaffected
- [ ] Tests colocated with source files using `.spec.ts` suffix
- [ ] No `__tests__/` directories created
