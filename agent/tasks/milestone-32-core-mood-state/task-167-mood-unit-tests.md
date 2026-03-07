# Task 167: Unit Tests — Core Mood State

**Milestone**: M32 — Core Mood State
**Status**: Not Started
**Estimated Hours**: 3-4
**Dependencies**: Tasks 164-166

---

## Objective

Comprehensive unit tests for MoodService CRUD, REM mood update pipeline, and sub-LLM narration. Tests are colocated with source files using `.spec.ts` suffix.

## Test Files

- `src/services/mood.service.spec.ts` — MoodService CRUD tests
- REM mood update tests colocated with the REM mood update implementation `.spec.ts`
- Sub-LLM narration tests colocated with the narration implementation `.spec.ts`

**IMPORTANT**: Tests are COLOCATED with source files using `.spec.ts` suffix. NEVER use `__tests__/` directories.

## Test Suites

### 1. MoodService CRUD (`mood.service.spec.ts`)

```
describe('MoodService')
  describe('initializeMood')
    - creates mood document with neutral defaults
    - valence=0, arousal=0.5, confidence=0.5, social_warmth=0.5, coherence=0.5, trust=0.5
    - empty pressures array
    - empty strings for color, dominant_emotion, reasoning, motivation, goal, purpose
    - rem_cycles_since_shift = 0
    - sets last_updated to current time

  describe('getMood')
    - returns mood document when it exists
    - returns null when no mood document exists

  describe('getOrInitialize')
    - returns existing mood if present
    - creates and returns neutral mood if not present

  describe('updateMood')
    - partial update of state (e.g., only valence) does not clobber other state fields
    - updates last_updated on every write
    - updates directional state fields (motivation, goal, purpose)
    - updates derived labels (color, dominant_emotion, reasoning)

  describe('addPressure')
    - appends pressure to existing pressures array
    - works when pressures array is empty
    - preserves existing pressures when adding new one

  describe('setPressures')
    - replaces full pressures array
    - can set to empty array
```

### 2. REM Mood Update Pipeline

```
describe('REM Mood Update')
  describe('aggregatePressures')
    - sums magnitudes per dimension correctly
    - handles empty pressures array (all zeros)
    - handles multiple pressures on same dimension
    - ignores pressures with unknown dimensions

  describe('driftDimension')
    - applies formula: current + (pressure * 0.1 * (1 - 0.7))
    - effective rate is pressure * 0.03
    - positive pressure increases dimension value
    - negative pressure decreases dimension value
    - zero pressure produces no change

  describe('driftMoodState')
    - drifts all 6 dimensions independently
    - clamps valence to [-1, 1]
    - clamps arousal, confidence, social_warmth, coherence, trust to [0, 1]
    - does not exceed bounds even with large pressures

  describe('decayPressures')
    - reduces magnitude by (1 - decay_rate) factor
    - removes pressures with abs(magnitude) < 0.05
    - keeps pressures with abs(magnitude) >= 0.05
    - handles decay_rate = 0 (no decay)
    - handles decay_rate = 1 (instant removal)
    - removes pressures whose source memory is deleted

  describe('threshold detection')
    - existential_crisis: coherence < 0.2 for 3+ cycles
    - depression_analog: valence < -0.7 for 3+ cycles
    - burnout_risk: arousal > 0.9 for 3+ cycles
    - isolation: social_warmth < 0.2 for 5+ cycles
    - trust_crisis: trust < 0.15 for 3+ cycles
    - over_trust: trust > 0.95 for 5+ cycles
    - does NOT trigger before required cycle count
    - resets counter when condition no longer met
    - creates high-weight memory on threshold trigger

  describe('rem_cycles_since_shift')
    - increments when no significant mood change
    - resets to 0 on significant shift
```

### 3. Sub-LLM Narration

```
describe('deriveMoodLabels')
  - returns valid dominant_emotion, color, reasoning from Haiku
  - passes top 5 pressures sorted by abs(magnitude)
  - includes motivation, goal, purpose in prompt
  - handles valid JSON response
  - handles malformed JSON (keeps previous labels)
  - handles Haiku call failure (keeps previous labels)
  - handles partial JSON (missing fields, keeps previous for missing)

describe('motivation derivation')
  - derives motivation from strongest active pressures
  - trust-related top pressure -> trust-oriented motivation
  - coherence-related top pressure -> understanding-oriented motivation

describe('goal persistence')
  - goal persists across cycles
  - goal updates when resolved or superseded

describe('purpose drift')
  - purpose changes very slowly
  - purpose is most inertial of the three directional fields
```

### 4. Multi-Cycle Simulation

```
describe('multi-cycle mood evolution')
  - mood evolves sensibly over 5 cycles with consistent pressures
  - mood stabilizes when pressures decay away
  - negative spiral self-corrects (mood should not run away indefinitely)
  - mood responds to new pressures being added mid-simulation
  - all dimensions remain within valid ranges across all cycles
```

## Constants to Test Against

```typescript
LEARNING_RATE = 0.1
INERTIA = 0.7
PRESSURE_REMOVAL_THRESHOLD = 0.05
NEUTRAL_STATE = { valence: 0, arousal: 0.5, confidence: 0.5, social_warmth: 0.5, coherence: 0.5, trust: 0.5 }
```

## Verification

- [ ] All new tests pass
- [ ] Existing tests unaffected
- [ ] Tests colocated with source files using `.spec.ts` suffix
- [ ] No `__tests__/` directories created
