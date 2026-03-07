/**
 * Mood-biased retrieval reranking.
 *
 * Post-search reranking that adjusts computed_weight based on the ghost's
 * current mood state. Multiple bias rules can stack multiplicatively.
 */

import type { CoreMoodMemory } from './mood.service.js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface BiasableMemory {
  computed_weight: number;
  weight?: number;
  trust?: number;
  content_type?: string;
  tags?: string[];
  [key: string]: unknown;
}

// ─── Bias Rules ───────────────────────────────────────────────────────────

/**
 * Apply mood-based bias to search results, then re-sort by updated computed_weight.
 *
 * If mood is null/undefined, returns results unchanged.
 * Neutral mood (valence=0, others=0.5) produces no change (no rules trigger).
 */
export function applyMoodBias<T extends BiasableMemory>(
  results: T[],
  mood: CoreMoodMemory | null | undefined,
): T[] {
  if (!mood || results.length === 0) return results;

  const biased = results.map((memory) => {
    let biasMultiplier = 1.0;

    // Low confidence: boost memories of past failures (checking for pitfalls)
    if (mood.state.confidence < 0.3) {
      if (memory.tags?.includes('failure') || memory.tags?.includes('lesson')) {
        biasMultiplier *= 1.3;
      }
    }

    // High social warmth: boost collaborative/positive interaction memories
    if (mood.state.social_warmth > 0.7) {
      if (memory.content_type === 'conversation' || memory.tags?.includes('collaboration')) {
        biasMultiplier *= 1.2;
      }
    }

    // Low coherence: boost contradictory memories (trying to resolve them)
    if (mood.state.coherence < 0.4) {
      if (memory.tags?.includes('contradiction') || memory.tags?.includes('unresolved')) {
        biasMultiplier *= 1.4;
      }
    }

    // Negative valence: slight boost to positive memories (self-correction)
    if (mood.state.valence < -0.5) {
      if ((memory.weight ?? 0) > 0.7 && memory.tags?.includes('positive')) {
        biasMultiplier *= 1.15;
      }
    }

    // Low trust: boost memories that validate caution
    if (mood.state.trust < 0.3) {
      if (memory.tags?.includes('betrayal') || memory.tags?.includes('broken_promise')) {
        biasMultiplier *= 1.3;
      }
      // Suppress overly personal memories
      if ((memory.trust ?? 0) > 0.7) {
        biasMultiplier *= 0.7;
      }
    }

    // High trust: boost memories that deepen connection
    if (mood.state.trust > 0.8) {
      if (memory.tags?.includes('shared_experience') || memory.tags?.includes('vulnerability')) {
        biasMultiplier *= 1.2;
      }
    }

    return {
      ...memory,
      computed_weight: memory.computed_weight * biasMultiplier,
    };
  });

  // Re-sort by updated computed_weight (descending)
  biased.sort((a, b) => b.computed_weight - a.computed_weight);

  return biased;
}
