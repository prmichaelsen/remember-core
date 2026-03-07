// src/services/composite-scoring.ts
// Composite significance score computation — reusable across create-time and REM Phase 0.

import {
  FEEL_DIMENSION_PROPERTIES,
  FUNCTIONAL_DIMENSION_PROPERTIES,
} from '../database/weaviate/index.js';

// ─── Types ───────────────────────────────────────────────────────────────

/** Configurable weights for composite computation. */
export interface CompositeWeights {
  /** Weight per feel_* dimension (default: 1.0 each). */
  feel: Partial<Record<string, number>>;
  /** Weight per functional_* dimension (default: 1.0 each). */
  functional: Partial<Record<string, number>>;
}

/** Scores map: dimension property name → score (or null/undefined if unscored). */
export type DimensionScores = Partial<Record<string, number | null | undefined>>;

/** Result of composite computation. */
export interface CompositeResult {
  feel_significance: number | null;
  functional_significance: number | null;
  total_significance: number | null;
}

// ─── Default Weights ─────────────────────────────────────────────────────

/** Default: equal weight (1.0) for every dimension. */
export const DEFAULT_WEIGHTS: CompositeWeights = {
  feel: Object.fromEntries(FEEL_DIMENSION_PROPERTIES.map(d => [d, 1.0])),
  functional: Object.fromEntries(FUNCTIONAL_DIMENSION_PROPERTIES.map(d => [d, 1.0])),
};

// ─── Core Functions ──────────────────────────────────────────────────────

/**
 * Compute feel_significance as weighted average of Layer 1 (feel_*) dimensions.
 *
 * - Null/undefined dimensions excluded (denominator adjusted).
 * - `feel_valence` uses Math.abs() (both -1 and +1 contribute equally).
 * - Returns null if ALL dimensions are null/undefined.
 */
export function computeFeelSignificance(
  scores: DimensionScores,
  weights?: Partial<Record<string, number>>,
): number | null {
  const w = weights ?? DEFAULT_WEIGHTS.feel;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const dim of FEEL_DIMENSION_PROPERTIES) {
    const value = scores[dim];
    if (value === undefined || value === null) continue;

    const dimWeight = w[dim] ?? 1.0;
    const effectiveValue = dim === 'feel_valence' ? Math.abs(value) : value;
    weightedSum += effectiveValue * dimWeight;
    totalWeight += dimWeight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

/**
 * Compute functional_significance as weighted average of Layer 2 (functional_*) dimensions.
 *
 * - Null/undefined dimensions excluded (denominator adjusted).
 * - Returns null if ALL dimensions are null/undefined.
 */
export function computeFunctionalSignificance(
  scores: DimensionScores,
  weights?: Partial<Record<string, number>>,
): number | null {
  const w = weights ?? DEFAULT_WEIGHTS.functional;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const dim of FUNCTIONAL_DIMENSION_PROPERTIES) {
    const value = scores[dim];
    if (value === undefined || value === null) continue;

    const dimWeight = w[dim] ?? 1.0;
    weightedSum += value * dimWeight;
    totalWeight += dimWeight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

/**
 * Compute total_significance = feel_significance + functional_significance.
 *
 * - If one is null, uses only the non-null one.
 * - If both null, returns null.
 */
export function computeTotalSignificance(
  feelSignificance: number | null,
  functionalSignificance: number | null,
): number | null {
  if (feelSignificance === null && functionalSignificance === null) return null;
  return (feelSignificance ?? 0) + (functionalSignificance ?? 0);
}

/**
 * Compute all three composite scores from dimension scores.
 *
 * Used by both MemoryService.create() (create-time) and REM Phase 0 (scoring loop).
 */
export function computeAllComposites(
  scores: DimensionScores,
  weights?: CompositeWeights,
): CompositeResult {
  const feelSig = computeFeelSignificance(scores, weights?.feel);
  const funcSig = computeFunctionalSignificance(scores, weights?.functional);
  const totalSig = computeTotalSignificance(feelSig, funcSig);

  return {
    feel_significance: feelSig,
    functional_significance: funcSig,
    total_significance: totalSig,
  };
}
