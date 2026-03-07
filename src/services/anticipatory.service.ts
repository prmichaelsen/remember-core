/**
 * Anticipatory Emotion — forward-looking pressure generation from memory patterns.
 *
 * Runs during the REM cycle, before pressure aggregation. Detects recurring
 * patterns in recent memories and creates anticipatory pressures (anxiety,
 * excitement, dread) based on projected outcomes.
 *
 * See: agent/design/core-mood-memory.md — "Anticipatory Emotion"
 */

import type { Pressure } from './mood.service.js';

// ─── Constants ────────────────────────────────────────────────────────────

/** Maximum anticipatory pressures per REM cycle. */
export const MAX_ANTICIPATORY_PRESSURES = 3;

/** Minimum memories to consider a pattern. */
export const MIN_PATTERN_MEMORIES = 2;

/** Default decay rate for anticipatory pressures (high — fades fast if prediction doesn't materialize). */
export const DEFAULT_ANTICIPATORY_DECAY = 0.4;

// ─── Types ────────────────────────────────────────────────────────────────

/** A detected pattern in recent memories. */
export interface DetectedPattern {
  /** IDs of the memories forming this pattern. */
  memory_ids: string[];
  /** Description of the recurring pattern. */
  pattern_description: string;
  /** Projected outcome based on historical patterns. */
  projection: string;
  /** Anticipated valence of the outcome (-1 to 1). */
  anticipated_valence: number;
  /** Which mood dimension this most affects. */
  dimension: string;
  /** Magnitude of the anticipated pressure (-0.15 to 0.15). */
  magnitude: number;
}

/** Sub-LLM provider for pattern detection. */
export interface AnticipatoryLlmProvider {
  detectPatterns(recentMemories: RecentMemory[]): Promise<DetectedPattern[]>;
}

/** Minimal memory shape for anticipatory analysis. */
export interface RecentMemory {
  id: string;
  content: string;
  tags?: string[];
  created_at: string;
}

// ─── Core Function ────────────────────────────────────────────────────────

/**
 * Generate anticipatory pressures from detected patterns.
 *
 * Caps at MAX_ANTICIPATORY_PRESSURES per cycle. Each pressure has a high
 * decay rate (0.3-0.5) so it fades quickly if the prediction doesn't materialize.
 */
export function createAnticipatoryPressures(
  patterns: DetectedPattern[],
): Pressure[] {
  const capped = patterns.slice(0, MAX_ANTICIPATORY_PRESSURES);

  return capped.map((pattern) => {
    // Clamp magnitude to [-0.15, 0.15]
    const clampedMagnitude = Math.min(Math.max(pattern.magnitude, -0.15), 0.15);

    return {
      source_memory_id: pattern.memory_ids[pattern.memory_ids.length - 1],
      direction: `${pattern.dimension}:${clampedMagnitude >= 0 ? '+' : ''}${clampedMagnitude.toFixed(2)}`,
      dimension: pattern.dimension,
      magnitude: clampedMagnitude,
      reason: `anticipating: ${pattern.projection}`,
      created_at: new Date().toISOString(),
      decay_rate: DEFAULT_ANTICIPATORY_DECAY,
    };
  });
}

/**
 * Build the prompt for sub-LLM pattern detection.
 *
 * Used by the REM cycle to detect recurring themes in recent memories
 * and project likely future scenarios.
 */
export function buildPatternDetectionPrompt(memories: RecentMemory[]): string {
  const memoryList = memories.map((m, i) =>
    `${i + 1}. [${m.created_at}] ${m.content}${m.tags?.length ? ` (tags: ${m.tags.join(', ')})` : ''}`
  ).join('\n');

  return `Analyze these recent memories for recurring patterns that might predict future events.

Memories:
${memoryList}

For each pattern found, respond with JSON array:
[{
  "memory_ids": ["id1", "id2"],
  "pattern_description": "what recurs",
  "projection": "what might happen next",
  "anticipated_valence": -0.1,
  "dimension": "valence",
  "magnitude": -0.1
}]

Rules:
- Only report patterns with 2+ memories
- magnitude must be between -0.15 and 0.15
- dimension must be: valence, arousal, confidence, social_warmth, coherence, or trust
- If no patterns detected, return []`;
}

/**
 * Parse sub-LLM response for detected patterns.
 * Returns empty array on parse failure (safe fallback).
 */
export function parsePatternResponse(response: string): DetectedPattern[] {
  try {
    // Extract JSON array from response (may be wrapped in markdown code blocks)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const validDimensions = new Set(['valence', 'arousal', 'confidence', 'social_warmth', 'coherence', 'trust']);

    return parsed
      .filter((p: any) =>
        Array.isArray(p.memory_ids) &&
        p.memory_ids.length >= MIN_PATTERN_MEMORIES &&
        typeof p.pattern_description === 'string' &&
        typeof p.projection === 'string' &&
        typeof p.magnitude === 'number' &&
        typeof p.dimension === 'string' &&
        validDimensions.has(p.dimension)
      )
      .map((p: any) => ({
        memory_ids: p.memory_ids,
        pattern_description: p.pattern_description,
        projection: p.projection,
        anticipated_valence: typeof p.anticipated_valence === 'number' ? p.anticipated_valence : p.magnitude,
        dimension: p.dimension,
        magnitude: p.magnitude,
      }));
  } catch {
    return [];
  }
}
