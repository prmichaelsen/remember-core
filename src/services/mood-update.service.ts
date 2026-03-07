/**
 * REM Mood Update — pressure aggregation, dimension drift, decay, and threshold detection.
 *
 * Pure functions for REM cycle mood updates. Wired into RemService.runCycle()
 * after emotional scoring (Phase 0).
 *
 * See: agent/design/core-mood-memory.md — "REM Cycle Integration"
 */

import type { MoodState, Pressure, CoreMoodMemory } from './mood.service.js';

// ─── Constants ───────────────────────────────────────────────────────────

export const LEARNING_RATE = 0.1;
export const INERTIA = 0.7;
export const PRESSURE_REMOVAL_THRESHOLD = 0.05;
export const SIGNIFICANT_CHANGE_THRESHOLD = 0.1;

export interface ThresholdDef {
  dimension: keyof MoodState;
  op: '<' | '>';
  value: number;
  cycles: number;
}

export const THRESHOLDS: Record<string, ThresholdDef> = {
  existential_crisis: { dimension: 'coherence', op: '<', value: 0.2, cycles: 3 },
  depression_analog: { dimension: 'valence', op: '<', value: -0.7, cycles: 3 },
  burnout_risk: { dimension: 'arousal', op: '>', value: 0.9, cycles: 3 },
  isolation: { dimension: 'social_warmth', op: '<', value: 0.2, cycles: 5 },
  trust_crisis: { dimension: 'trust', op: '<', value: 0.15, cycles: 3 },
  over_trust: { dimension: 'trust', op: '>', value: 0.95, cycles: 5 },
};

// ─── Pressure Aggregation ────────────────────────────────────────────────

/**
 * Sum all active pressures by dimension, producing net pressure per dimension.
 */
export function aggregatePressures(pressures: Pressure[]): Record<string, number> {
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

// ─── Dimension Drift ─────────────────────────────────────────────────────

/**
 * Drift a single dimension toward pressure.
 * Effective rate: pressure * LEARNING_RATE * (1 - INERTIA) = pressure * 0.03
 */
export function driftDimension(currentValue: number, netPressure: number): number {
  return currentValue + (netPressure * LEARNING_RATE * (1 - INERTIA));
}

/**
 * Clamp a value to a range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Drift all 6 mood dimensions and clamp to valid ranges.
 * Valence: [-1, 1]; others: [0, 1].
 */
export function driftMoodState(
  state: MoodState,
  netPressures: Record<string, number>,
): MoodState {
  return {
    valence: clamp(driftDimension(state.valence, netPressures.valence ?? 0), -1, 1),
    arousal: clamp(driftDimension(state.arousal, netPressures.arousal ?? 0), 0, 1),
    confidence: clamp(driftDimension(state.confidence, netPressures.confidence ?? 0), 0, 1),
    social_warmth: clamp(driftDimension(state.social_warmth, netPressures.social_warmth ?? 0), 0, 1),
    coherence: clamp(driftDimension(state.coherence, netPressures.coherence ?? 0), 0, 1),
    trust: clamp(driftDimension(state.trust, netPressures.trust ?? 0), 0, 1),
  };
}

// ─── Pressure Decay ──────────────────────────────────────────────────────

/**
 * Decay all pressures by their decay_rate, removing those below threshold.
 */
export function decayPressures(pressures: Pressure[]): Pressure[] {
  return pressures
    .map(p => ({
      ...p,
      magnitude: p.magnitude * (1 - p.decay_rate),
    }))
    .filter(p => Math.abs(p.magnitude) >= PRESSURE_REMOVAL_THRESHOLD);
}

// ─── Significant Change Detection ────────────────────────────────────────

/**
 * Detect if any dimension shifted by >= SIGNIFICANT_CHANGE_THRESHOLD.
 */
export function hasSignificantChange(oldState: MoodState, newState: MoodState): boolean {
  const dims: (keyof MoodState)[] = ['valence', 'arousal', 'confidence', 'social_warmth', 'coherence', 'trust'];
  for (const dim of dims) {
    if (Math.abs(newState[dim] - oldState[dim]) >= SIGNIFICANT_CHANGE_THRESHOLD) {
      return true;
    }
  }
  return false;
}

// ─── Threshold Detection ─────────────────────────────────────────────────

export interface ThresholdFlag {
  name: string;
  dimension: string;
  value: number;
  cycles: number;
}

/**
 * Check if any threshold conditions are met.
 * Returns flags for sustained extreme states that have persisted for the required cycle count.
 */
export function checkThresholds(
  state: MoodState,
  remCyclesSinceShift: number,
): ThresholdFlag[] {
  const flags: ThresholdFlag[] = [];

  for (const [name, def] of Object.entries(THRESHOLDS)) {
    const dimValue = state[def.dimension];
    const triggered = def.op === '<' ? dimValue < def.value : dimValue > def.value;

    if (triggered && remCyclesSinceShift >= def.cycles) {
      flags.push({
        name,
        dimension: def.dimension,
        value: dimValue,
        cycles: remCyclesSinceShift,
      });
    }
  }

  return flags;
}

/**
 * Build a threshold memory content string for a triggered flag.
 */
export function buildThresholdMemoryContent(flag: ThresholdFlag, topPressure?: Pressure): string {
  let content = `Ghost has been in a ${flag.name.replace(/_/g, ' ')} state for ${flag.cycles} consecutive REM cycles. ` +
    `${flag.dimension}: ${flag.value.toFixed(2)}.`;

  if (topPressure) {
    content += ` Primary pressure: ${topPressure.reason}`;
  }

  return content;
}

// ─── Full Mood Update Pipeline ───────────────────────────────────────────

export interface MoodUpdateResult {
  newState: MoodState;
  decayedPressures: Pressure[];
  significantChange: boolean;
  remCyclesSinceShift: number;
  thresholdFlags: ThresholdFlag[];
}

/**
 * Run the full mood update pipeline (steps 1-3, 5 from design):
 * 1. Aggregate pressures
 * 2. Drift dimensions
 * 3. Decay stale pressures
 * 5. Check thresholds
 */
export function runMoodUpdate(mood: CoreMoodMemory): MoodUpdateResult {
  // 1. Aggregate pressures
  const netPressures = aggregatePressures(mood.pressures);

  // 2. Drift mood state
  const newState = driftMoodState(mood.state, netPressures);

  // 3. Decay pressures
  const decayedPressures = decayPressures(mood.pressures);

  // Detect significant change
  const significantChange = hasSignificantChange(mood.state, newState);

  // Update rem_cycles_since_shift
  const remCyclesSinceShift = significantChange ? 0 : mood.rem_cycles_since_shift + 1;

  // 5. Check thresholds
  const thresholdFlags = checkThresholds(newState, remCyclesSinceShift);

  return {
    newState,
    decayedPressures,
    significantChange,
    remCyclesSinceShift,
    thresholdFlags,
  };
}
