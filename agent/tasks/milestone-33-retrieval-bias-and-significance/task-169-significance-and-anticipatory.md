# Task 169: Significance Scoring + Anticipatory Emotion

**Milestone**: M33 — Retrieval Bias & Significance
**Status**: Not Started
**Estimated Hours**: 4-6
**Dependencies**: M32 (Core Mood State)

---

## Objective

Implement mood-aware significance scoring for new memories at creation time, and anticipatory emotion generation during the REM cycle.

## Context

- **Design doc**: `agent/design/core-mood-memory.md` — sections "Significance Scoring for New Memories" and "Anticipatory Emotion"
- Significance scoring runs at memory creation time, not during REM
- Anticipatory emotion runs during REM, before pressure aggregation

---

## Part 1: Significance Scoring

### Full Implementation

```typescript
function calculateMemorySignificance(
  memory: NewMemory,
  mood: CoreMoodMemory
): number {
  const {valence, arousal, confidence, social_warmth, coherence, trust} = mood.state;

  // Base significance from content analysis
  let significance = analyzeContentSignificance(memory);

  // Salience: how unexpected/novel (high arousal = more significant)
  const salience = arousal * 0.2;

  // Valence intensity: strong positive OR negative = more significant
  const valenceIntensity = Math.abs(valence) * 0.15;

  // Agency: memories caused by the ghost's own actions weight higher
  const agency = memory.triggered_by === 'self' ? 0.1 : 0;

  // Coherence tension: memories that conflict with beliefs are significant
  const coherenceTension = (1 - coherence) * 0.15;

  // Social weight: memories affecting relationships
  const socialWeight = memory.involves_other_users ? social_warmth * 0.1 : 0;

  // Trust signal: trust-relevant interactions weighted by how much trust is in flux
  // When trust is mid-range (0.3-0.7), trust-relevant memories matter more -- the ghost is deciding
  const trustFlux = memory.involves_other_users
    ? (1 - Math.abs(trust - 0.5) * 2) * 0.15  // peaks at trust=0.5, zero at extremes
    : 0;

  significance += salience + valenceIntensity + agency + coherenceTension + socialWeight + trustFlux;

  return Math.min(Math.max(significance, 0), 1);
}
```

### Significance Modifiers Table

| Modifier | Formula | Max Contribution | When it matters |
|----------|---------|-----------------|-----------------|
| salience | `arousal * 0.2` | 0.2 | High arousal = more unexpected/novel |
| valenceIntensity | `abs(valence) * 0.15` | 0.15 | Strong positive OR negative = more significant |
| agency | `triggered_by === 'self' ? 0.1 : 0` | 0.1 | Ghost's own actions weight higher |
| coherenceTension | `(1 - coherence) * 0.15` | 0.15 | Low coherence = conflicting beliefs are significant |
| socialWeight | `involves_other_users ? social_warmth * 0.1 : 0` | 0.1 | Social memories weighted by social warmth |
| trustFlux | `involves_other_users ? (1 - abs(trust - 0.5) * 2) * 0.15 : 0` | 0.15 | Peaks at trust=0.5 (deciding), zero at trust extremes |

### Trust Flux Formula Detail

The trust flux formula `(1 - Math.abs(trust - 0.5) * 2) * 0.15` produces:
- At trust = 0.0: `(1 - 1.0) * 0.15 = 0.0` (trust settled low, no flux)
- At trust = 0.25: `(1 - 0.5) * 0.15 = 0.075`
- At trust = 0.5: `(1 - 0.0) * 0.15 = 0.15` (maximum flux, ghost is deciding)
- At trust = 0.75: `(1 - 0.5) * 0.15 = 0.075`
- At trust = 1.0: `(1 - 1.0) * 0.15 = 0.0` (trust settled high, no flux)

### Integration

- Wire `calculateMemorySignificance()` into `MemoryService.create()` as part of initial weight/significance calculation
- If no mood exists for the user, use only base content significance (skip mood modifiers)
- Final result clamped to [0, 1]

---

## Part 2: Anticipatory Emotion

### Process

```yaml
Anticipatory_Processing:
  description: |
    Fear/excitement are not just "that was surprising" -- they are
    "that WILL be bad/good." The REM cycle generates forward predictions
    from memory patterns and attaches valence to them.

  process:
    1. Identify recurring patterns in recent memories
    2. Project likely future scenarios from patterns
    3. Attach valence to projections based on past outcomes
    4. Create pressure entries for anticipated events
    5. Anxiety = negative anticipated valence + high arousal
    6. Excitement = positive anticipated valence + high arousal
    7. Dread = negative anticipated valence + low coherence

  example:
    pattern: "User has not responded in 3 sessions"
    historical_outcome: "Previous silences preceded negative interactions"
    projection: "Next interaction may be tense"
    pressure:
      dimension: valence
      magnitude: -0.15
      reason: "anticipating difficult interaction based on silence pattern"
```

### Anticipatory Pressure Creation

When a pattern is detected and a projection is generated:
- Create a `Pressure` entry with:
  - `source_memory_id`: the most recent memory in the pattern
  - `dimension`: typically `valence`, but could be `arousal`, `trust`, etc.
  - `magnitude`: typically small (-0.15 to +0.15)
  - `reason`: describes the anticipation (e.g., "anticipating difficult interaction based on silence pattern")
  - `decay_rate`: relatively high (0.3-0.5) since anticipatory pressures should fade if the prediction doesn't materialize

### Integration

- Wire anticipatory processing into REM cycle **before** pressure aggregation (so anticipatory pressures influence the current cycle's drift)
- Use Haiku sub-LLM for pattern detection and forward projection
- Cap the number of anticipatory pressures created per cycle (e.g., max 3)

## Steps

### Significance Scoring
1. Create `calculateMemorySignificance(memory: NewMemory, mood: CoreMoodMemory): number`
2. Implement all 6 modifiers: salience, valenceIntensity, agency, coherenceTension, socialWeight, trustFlux
3. Implement trust flux formula: `(1 - Math.abs(trust - 0.5) * 2) * 0.15`
4. Clamp final result to [0, 1]
5. Wire into `MemoryService.create()` — if mood exists, apply modifiers; if not, use base significance only

### Anticipatory Emotion
6. Implement pattern detection in REM cycle (identify recurring themes in recent memories)
7. Implement forward projection via Haiku sub-LLM
8. Create pressure entries for anticipated events with appropriate decay rates (0.3-0.5)
9. Wire into REM mood update pipeline **before** pressure aggregation step
10. Cap anticipatory pressures at 3 per cycle

## Verification

- [ ] New memories get mood-influenced significance scores
- [ ] Each modifier contributes correct amount (salience: max 0.2, valenceIntensity: max 0.15, agency: 0.1, etc.)
- [ ] Trust flux peaks at trust=0.5, zero at extremes (0.0 and 1.0)
- [ ] Values clamped to [0, 1]
- [ ] No mood state = base significance only (graceful skip)
- [ ] Anticipatory pressures created from detected patterns
- [ ] Anticipatory pressures have high decay rates (0.3-0.5)
- [ ] Max 3 anticipatory pressures per cycle
- [ ] Anticipatory pressures added before pressure aggregation in REM pipeline
- [ ] Tests colocated: appropriate `.spec.ts` file alongside implementation
