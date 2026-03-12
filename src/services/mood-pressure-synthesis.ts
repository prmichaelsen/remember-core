/**
 * Mood Pressure Synthesis — converts scored emotional dimensions into mood pressures.
 *
 * During REM, after Phase 0 scores memories on 31 emotional dimensions, this service
 * maps those scores into mood pressures that drive ghost mood drift. Each mapping has
 * a tuned center value — scores near the center produce negligible pressure, while
 * scores far from center create proportional positive or negative pressure.
 *
 * Tuned via rem-mood-eval.ts against 4 distinct ghost personality profiles.
 */

import type { Pressure } from './mood.service.js';

// ─── Dimension → Mood Mappings ──────────────────────────────────────────

export interface DimensionMapping {
  /** The scored emotional dimension property name. */
  source: string;
  /** The mood dimension this maps to. */
  target: string;
  /** The "neutral" center — scores at this value produce zero pressure. */
  center: number;
  /** If true, higher source values push the target DOWN (e.g. tension → coherence). */
  invert: boolean;
  /** Human-readable label for pressure reason. */
  label: string;
}

/**
 * Tuned dimension→mood mappings.
 *
 * Centers calibrated against diverse ghost personality profiles:
 *   - trust center 0.8: prevents saturation from high-agency memories
 *   - coherence center 0.3: moderate tension is expected, only high tension hurts
 *   - social_warmth center 0.4: allows both warm and isolated profiles to diverge
 */
export const DIMENSION_MOOD_MAPPINGS: DimensionMapping[] = [
  { source: 'feel_valence', target: 'valence', center: 0.5, invert: false, label: 'emotional valence' },
  { source: 'feel_arousal', target: 'arousal', center: 0.5, invert: false, label: 'arousal level' },
  { source: 'feel_dominance', target: 'confidence', center: 0.5, invert: false, label: 'dominance/confidence' },
  { source: 'functional_social_weight', target: 'social_warmth', center: 0.4, invert: false, label: 'social weight' },
  { source: 'feel_coherence_tension', target: 'coherence', center: 0.3, invert: true, label: 'coherence tension' },
  { source: 'functional_agency', target: 'trust', center: 0.8, invert: false, label: 'agency/trust' },
];

/** Default pressure magnitude scale factor. */
export const DEFAULT_PRESSURE_MAGNITUDE_SCALE = 0.3;

/** Default decay rate for dimension-derived pressures. */
export const DEFAULT_DIMENSION_PRESSURE_DECAY = 0.15;

/** Minimum absolute magnitude to create a pressure (skip negligible). */
export const MIN_PRESSURE_MAGNITUDE = 0.01;

// ─── Synthesis ──────────────────────────────────────────────────────────

/**
 * Synthesize mood pressures from a memory's scored emotional dimensions.
 *
 * @param memoryId - UUID of the source memory
 * @param dimensions - Map of scored dimension property names to values
 * @param scale - Magnitude scale factor (default: 0.3)
 * @param decayRate - Decay rate for generated pressures (default: 0.15)
 * @returns Array of pressures (may be empty if all dimensions are near-center)
 */
export function synthesizePressuresFromDimensions(
  memoryId: string,
  dimensions: Record<string, number | null | undefined>,
  scale: number = DEFAULT_PRESSURE_MAGNITUDE_SCALE,
  decayRate: number = DEFAULT_DIMENSION_PRESSURE_DECAY,
): Pressure[] {
  const pressures: Pressure[] = [];
  const now = new Date().toISOString();

  for (const mapping of DIMENSION_MOOD_MAPPINGS) {
    const value = dimensions[mapping.source];
    if (value === null || value === undefined) continue;

    const raw = mapping.invert
      ? -(value - mapping.center)
      : (value - mapping.center);
    const magnitude = raw * scale;

    if (Math.abs(magnitude) < MIN_PRESSURE_MAGNITUDE) continue;

    pressures.push({
      source_memory_id: memoryId,
      direction: `${mapping.target}:${magnitude >= 0 ? '+' : ''}${magnitude.toFixed(3)}`,
      dimension: mapping.target,
      magnitude,
      reason: `${mapping.label} from memory`,
      created_at: now,
      decay_rate: decayRate,
    });
  }

  return pressures;
}
