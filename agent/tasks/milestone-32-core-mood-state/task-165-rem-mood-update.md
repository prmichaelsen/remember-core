# Task 165: REM Mood Update

**Milestone**: M32 — Core Mood State
**Status**: Not Started
**Estimated Hours**: 4-6
**Dependencies**: Task 164

---

## Objective

Wire mood update into the REM cycle: aggregate pressures from recently consolidated memories, drift dimensional state, decay stale pressures, and check threshold flags for sustained extreme states.

## Context

- **Design doc**: `agent/design/core-mood-memory.md` — section "REM Cycle Integration"
- This implements steps 1-3 and 5 of the REM_Mood_Update pipeline (step 4 is narration, handled by Task 166)
- Wire into `RemService.runCycle()` after emotional scoring

## REM Mood Update Pipeline

```yaml
REM_Mood_Update:
  1_aggregate_pressure:
    description: Sum all active pressures from recently consolidated memories
    inputs: [recently_consolidated_memories, existing_pressures]
    output: net_pressure_per_dimension

  2_drift:
    description: Shift mood state toward aggregate pressure with inertia
    formula: |
      new_value = current_value + (pressure * learning_rate * (1 - inertia))
      where:
        learning_rate = 0.1  # slow drift
        inertia = 0.7        # moods are sticky
    clamp: [-1, 1] for valence, [0, 1] for others

  3_decay_stale_pressures:
    description: Remove or reduce pressures whose source memories are resolved/pruned
    rules:
      - if source_memory deleted or reconciled: remove pressure
      - else: pressure.magnitude *= (1 - pressure.decay_rate)
      - if abs(pressure.magnitude) < 0.05: remove pressure

  4_narrate: (Task 166)

  5_threshold_check:
    description: Flag extreme sustained states for special handling
```

## Drift Formula

```typescript
const LEARNING_RATE = 0.1;
const INERTIA = 0.7;

function driftDimension(currentValue: number, netPressure: number): number {
  return currentValue + (netPressure * LEARNING_RATE * (1 - INERTIA));
}

// After drift, clamp:
// valence: clamp(-1, 1)
// arousal, confidence, social_warmth, coherence, trust: clamp(0, 1)
```

The effective drift per cycle is `pressure * 0.1 * 0.3 = pressure * 0.03`. This is intentionally slow -- moods are sticky.

## Pressure Aggregation

For each dimension, sum the magnitudes of all active pressures targeting that dimension:

```typescript
function aggregatePressures(pressures: Pressure[]): Record<string, number> {
  const net: Record<string, number> = {
    valence: 0, arousal: 0, confidence: 0,
    social_warmth: 0, coherence: 0, trust: 0,
  };
  for (const p of pressures) {
    if (p.dimension in net) {
      net[p.dimension] += p.magnitude;
    }
  }
  return net;
}
```

## Pressure Decay Rules

After drift, decay all pressures:

```typescript
function decayPressures(pressures: Pressure[]): Pressure[] {
  return pressures
    .map(p => ({
      ...p,
      magnitude: p.magnitude * (1 - p.decay_rate),
    }))
    .filter(p => Math.abs(p.magnitude) >= 0.05); // Remove pressures below threshold
}
```

Additional rule: if the source memory has been deleted or reconciled, remove the pressure entirely (check via memory existence lookup).

## Threshold Checks

Flag extreme sustained states for special handling. Track via `rem_cycles_since_shift` and per-threshold counters:

| Threshold | Condition | Cycles Required | Flag |
|-----------|-----------|-----------------|------|
| coherence < 0.2 | sustained low coherence | 3+ cycles | `existential_crisis` |
| valence < -0.7 | sustained negative valence | 3+ cycles | `depression_analog` |
| arousal > 0.9 | sustained high arousal | 3+ cycles | `burnout_risk` |
| social_warmth < 0.2 | sustained low social warmth | 5+ cycles | `isolation` |
| trust < 0.15 | sustained low trust | 3+ cycles | `trust_crisis` |
| trust > 0.95 | sustained high trust | 5+ cycles | `over_trust` |

**When a threshold is triggered:**
1. Create a **high-weight memory** about the sustained state (store in Weaviate with `content_type: 'rem'` since all REM-created memories use this content type). Threshold memory content should be a structured description, e.g.: `"Ghost has been in a depressed state for 3 consecutive REM cycles. Valence: -0.72. Primary pressure: [reason]"`
2. Adjust retrieval bias to surface resolution-oriented memories (the retrieval bias system in Task 168 handles this)

## Steps

1. Implement `aggregatePressures(pressures: Pressure[]): Record<string, number>` — sum magnitudes per dimension
2. Implement `driftDimension(current: number, pressure: number): number` — apply learning_rate=0.1 and inertia=0.7
3. Implement `driftMoodState(state: MoodState, netPressures: Record<string, number>): MoodState` — drift all 6 dimensions, clamp correctly (valence: -1..1, others: 0..1)
4. Implement `decayPressures(pressures: Pressure[]): Pressure[]` — multiply by (1 - decay_rate), remove below 0.05
5. Implement threshold detection — track how many consecutive cycles each extreme condition has been met
6. On threshold trigger: create a high-weight Weaviate memory describing the sustained state
7. Wire all steps into `RemService.runCycle()` — after emotional scoring, before any narration step
8. Update `rem_cycles_since_shift` — increment if no significant mood change detected, reset to 0 on significant shift. "Significant change" = >= 0.1 shift in any single mood dimension. `rem_cycles_since_shift` is kept as a mood stability metric
9. Call `MoodService.updateMood()` to persist the updated state

## Constants

All constants should be defined in `src/services/rem.constants.ts`.

```typescript
const LEARNING_RATE = 0.1;
const INERTIA = 0.7;
const PRESSURE_REMOVAL_THRESHOLD = 0.05;
const SIGNIFICANT_CHANGE_THRESHOLD = 0.1; // >= 0.1 shift in any single mood dimension

const THRESHOLDS = {
  existential_crisis: { dimension: 'coherence', op: '<', value: 0.2, cycles: 3 },
  depression_analog: { dimension: 'valence', op: '<', value: -0.7, cycles: 3 },
  burnout_risk: { dimension: 'arousal', op: '>', value: 0.9, cycles: 3 },
  isolation: { dimension: 'social_warmth', op: '<', value: 0.2, cycles: 5 },
  trust_crisis: { dimension: 'trust', op: '<', value: 0.15, cycles: 3 },
  over_trust: { dimension: 'trust', op: '>', value: 0.95, cycles: 5 },
};
```

## Error Handling

Each phase (aggregate, drift, decay, threshold check) catches its own errors and the cycle continues. Skip only dependent phases on error (e.g., if drift fails, still attempt decay and threshold check where possible).

## Verification

- [ ] Dimensions drift toward pressure direction with correct inertia (effective rate = pressure * 0.03)
- [ ] Valence clamped to [-1, 1]; arousal, confidence, social_warmth, coherence, trust clamped to [0, 1]
- [ ] Pressures decay by `(1 - decay_rate)` each cycle
- [ ] Pressures removed when `abs(magnitude) < 0.05`
- [ ] Pressures removed when source memory is deleted
- [ ] Threshold flags set on sustained extreme states (correct cycle counts)
- [ ] High-weight memory created on threshold trigger
- [ ] `rem_cycles_since_shift` incremented/reset correctly
- [ ] Tests colocated: appropriate `.spec.ts` file alongside implementation
