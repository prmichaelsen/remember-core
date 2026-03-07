/**
 * Mood-aware significance scoring for new memories.
 *
 * Computes a significance bonus based on the ghost's current mood state.
 * Applied at memory creation time as a modifier on top of base content significance.
 *
 * See: agent/design/core-mood-memory.md — "Significance Scoring for New Memories"
 */

import type { CoreMoodMemory } from './mood.service.js';

// ─── Types ────────────────────────────────────────────────────────────────

/** Minimal memory shape for significance calculation. */
export interface SignificanceInput {
  /** Base content significance (0-1) from composite scoring or user weight. */
  base_significance?: number;
  /** Was this memory created by the ghost's own action? */
  triggered_by?: 'self' | 'user' | string;
  /** Does this memory involve other users (conversations, shared context)? */
  involves_other_users?: boolean;
}

/** Breakdown of the significance score. */
export interface SignificanceBreakdown {
  base: number;
  salience: number;
  valence_intensity: number;
  agency: number;
  coherence_tension: number;
  social_weight: number;
  trust_flux: number;
  total: number;
}

// ─── Core Function ────────────────────────────────────────────────────────

/**
 * Calculate mood-influenced significance for a new memory.
 *
 * If mood is null/undefined, returns base significance only.
 * Final result clamped to [0, 1].
 */
export function calculateMemorySignificance(
  memory: SignificanceInput,
  mood: CoreMoodMemory | null | undefined,
): SignificanceBreakdown {
  const base = memory.base_significance ?? 0.5;

  if (!mood) {
    return {
      base,
      salience: 0,
      valence_intensity: 0,
      agency: 0,
      coherence_tension: 0,
      social_weight: 0,
      trust_flux: 0,
      total: clamp(base),
    };
  }

  const { valence, arousal, confidence: _confidence, social_warmth, coherence, trust } = mood.state;

  // Salience: high arousal = more unexpected/novel → more significant
  const salience = arousal * 0.2;

  // Valence intensity: strong positive OR negative = more significant
  const valence_intensity = Math.abs(valence) * 0.15;

  // Agency: memories triggered by the ghost's own actions weight higher
  const agency = memory.triggered_by === 'self' ? 0.1 : 0;

  // Coherence tension: memories that conflict with beliefs are significant
  const coherence_tension = (1 - coherence) * 0.15;

  // Social weight: memories affecting relationships
  const social_weight = memory.involves_other_users ? social_warmth * 0.1 : 0;

  // Trust flux: peaks at trust=0.5 (deciding), zero at extremes
  const trust_flux = memory.involves_other_users
    ? (1 - Math.abs(trust - 0.5) * 2) * 0.15
    : 0;

  const total = clamp(base + salience + valence_intensity + agency + coherence_tension + social_weight + trust_flux);

  return {
    base,
    salience,
    valence_intensity,
    agency,
    coherence_tension,
    social_weight,
    trust_flux,
    total,
  };
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
