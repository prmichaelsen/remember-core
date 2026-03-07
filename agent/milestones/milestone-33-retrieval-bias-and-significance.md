# Milestone 33: Retrieval Bias & Significance Scoring

**Goal**: Wire the core mood state into memory retrieval (mood-biased reranking) and new memory creation (mood-aware significance scoring). Add anticipatory emotion processing to the REM cycle.

**Status**: Not Started
**Estimated Duration**: 1 week
**Dependencies**: M32 (Core Mood State)

---

## Overview

The mood memory biases all memory retrieval — low confidence boosts failure/lesson memories, low coherence boosts contradiction memories, negative valence slightly boosts positive memories (self-correction), low trust suppresses high-trust memories and boosts betrayal memories. New memories receive mood-aware initial significance scores. The REM cycle generates forward predictions (anticipatory emotion) creating pressure entries.

Design doc: `agent/design/core-mood-memory.md`

---

## Deliverables

1. `applyMoodBias()` — post-search reranking with mood-driven multipliers
2. `calculateMemorySignificance()` — mood-aware initial weight for new memories
3. Anticipatory emotion in REM cycle (pattern detection, forward projection, pressure creation)
4. Unit tests

---

## Tasks

### Task 168: Mood-Biased Retrieval Reranking

**Objective**: Implement `applyMoodBias()` that adjusts `computed_weight` of search results based on the ghost's current mood state.

**Interface**:

```typescript
function applyMoodBias(results: Memory[], mood: CoreMoodMemory): Memory[];
```

**Bias Rules** (all multipliers applied to `computed_weight`):

| Condition | Memory Match | Multiplier | Rationale |
|-----------|-------------|------------|-----------|
| `confidence < 0.3` | Tags include `failure` or `lesson` | `*= 1.3` | Low confidence: check for pitfalls |
| `social_warmth > 0.7` | `content_type === 'conversation'` or tag `collaboration` | `*= 1.2` | High warmth: boost collaborative memories |
| `coherence < 0.4` | Tags include `contradiction` or `unresolved` | `*= 1.4` | Low coherence: try to resolve conflicts |
| `valence < -0.5` | `weight > 0.7` AND tag `positive` | `*= 1.15` | Negative mood: self-correction toward positive |
| `trust < 0.3` | Tags include `betrayal` or `broken_promise` | `*= 1.3` | Low trust: validate caution |
| `trust < 0.3` | `memory.trust > 0.7` (high-trust memories) | `*= 0.7` | Low trust: suppress overly personal memories |
| `trust > 0.8` | Tags include `shared_experience` or `vulnerability` | `*= 1.2` | High trust: deepen connection |

**Implementation Details**:
- Pure function, no side effects — takes results + mood, returns reranked results
- Apply all matching bias rules (multiple can apply to a single memory)
- Return memories sorted by adjusted `computed_weight` descending
- Located in `src/services/core-state/` or `src/services/memory/` (alongside search pipeline)
- Wire into `MemoryService.search()`, `MemoryService.query()`, `MemoryService.findSimilar()` as a post-processing step
- Only applied when mood is initialized (skip if `getMood()` returns null)
- Multipliers are conservative — bias, not override

**Integration Points**:
- `MemoryService.search()` — after Weaviate results, before returning
- `MemoryService.query()` — after Weaviate results, before returning
- `MemoryService.findSimilar()` — after Weaviate results, before returning
- Mood fetched once per search call via `CoreStateService.getMood(userId)`

**Tests** (colocated `.spec.ts`):
- Low confidence boosts failure-tagged memories by 1.3x
- High social_warmth boosts conversation memories by 1.2x
- Low coherence boosts contradiction memories by 1.4x
- Negative valence boosts high-weight positive memories by 1.15x
- Low trust boosts betrayal memories AND suppresses high-trust memories
- High trust boosts shared_experience memories
- Multiple bias rules stack (e.g., low trust + low confidence both apply)
- No bias applied when mood is null (uninitialized)
- Result order changes after bias application (verify reranking)

---

### Task 169: Mood-Aware Significance Scoring + Anticipatory Emotion

**Objective**: Implement `calculateMemorySignificance()` for mood-aware initial weight on new memories, and anticipatory emotion processing in the REM cycle.

**Part A: Significance Scoring**

```typescript
function calculateMemorySignificance(
  memory: NewMemory,
  mood: CoreMoodMemory
): number {
  const { valence, arousal, confidence, social_warmth, coherence, trust } = mood.state;

  // Base significance from content analysis
  let significance = analyzeContentSignificance(memory);

  // Salience: high arousal = more significant
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
  // Peaks at trust=0.5 (deciding), zero at extremes (decided)
  const trustFlux = memory.involves_other_users
    ? (1 - Math.abs(trust - 0.5) * 2) * 0.15
    : 0;

  significance += salience + valenceIntensity + agency + coherenceTension + socialWeight + trustFlux;

  return Math.min(Math.max(significance, 0), 1);
}
```

**Coefficient Summary**:

| Factor | Coefficient | Source |
|--------|------------|--------|
| Salience (arousal) | 0.2 | `arousal * 0.2` |
| Valence intensity | 0.15 | `abs(valence) * 0.15` |
| Agency (self-triggered) | 0.1 | Flat bonus |
| Coherence tension | 0.15 | `(1 - coherence) * 0.15` |
| Social weight | 0.1 | `social_warmth * 0.1` (only if involves_other_users) |
| Trust flux | 0.15 | Peaks at trust=0.5, zero at extremes (only if involves_other_users) |

**Integration Point**: Called in `MemoryService.create()` when mood is initialized. If mood is null, use `analyzeContentSignificance()` alone (existing behavior).

**Part B: Anticipatory Emotion (REM Cycle)**

Anticipatory emotion = forward predictions from memory patterns with attached valence. Added as a step in the REM cycle.

**Process**:
1. Identify recurring patterns in recent memories (e.g., "user has not responded in 3 sessions")
2. Project likely future scenarios from patterns using historical outcomes
3. Attach valence to projections based on past outcomes
4. Create pressure entries for anticipated events

**Emotional Mapping**:
- Anxiety = negative anticipated valence + high arousal
- Excitement = positive anticipated valence + high arousal
- Dread = negative anticipated valence + low coherence

**Example**:
```yaml
pattern: "User has not responded in 3 sessions"
historical_outcome: "Previous silences preceded negative interactions"
projection: "Next interaction may be tense"
pressure:
  dimension: valence
  magnitude: -0.15
  reason: "anticipating difficult interaction based on silence pattern"
  decay_rate: 0.3  # anticipatory pressures decay faster
```

**Implementation Details**:
- Sub-LLM (Haiku) identifies patterns and generates projections
- Anticipatory pressures have higher `decay_rate` (0.3 vs. normal ~0.1) — they resolve quickly when the anticipated event either happens or doesn't
- Run as a step in the REM cycle after mood update, before persisting
- New pressures created with `source_memory_id` pointing to the most recent memory in the pattern

**Tests** (colocated `.spec.ts`):
- Significance: high arousal mood produces higher significance score
- Significance: extreme valence (positive or negative) increases score
- Significance: self-triggered memories get 0.1 bonus
- Significance: low coherence increases significance of new memories
- Significance: trust flux peaks at trust=0.5, zero at trust=0 and trust=1
- Significance: involves_other_users=false skips social and trust factors
- Significance: result clamped to [0, 1]
- Significance: null mood falls back to base significance only
- Anticipatory: pattern detection creates pressure entries
- Anticipatory: anticipatory pressures have higher decay_rate (0.3)

---

### Task 170: Unit Tests — Retrieval Bias & Significance Integration

**Objective**: Integration-level tests covering mood bias + significance scoring in realistic scenarios.

**Test Scenarios**:
- **Search with mood**: Run MemoryService.search() with initialized mood -> verify results are reranked
- **Search without mood**: Run MemoryService.search() with uninitialized mood -> verify default ordering (no bias)
- **Create with mood**: Call MemoryService.create() with initialized mood -> verify significance score reflects mood state
- **Create without mood**: Call MemoryService.create() with uninitialized mood -> verify base significance used
- **Bias doesn't distort drastically**: Apply all bias rules -> verify no memory jumps more than 2x its original weight
- **Edge case dimensions**: All dimensions at 0 -> verify no NaN or division errors
- **Edge case dimensions**: All dimensions at max -> verify no overflow past [0, 1]
