/**
 * NarrationService — Sub-LLM narration for mood derivation labels.
 *
 * Uses a SubLlmProvider to derive emotional labels (dominant_emotion, color, reasoning)
 * from the current dimensional mood state and active pressures.
 *
 * Also provides helper functions for motivation/goal/purpose derivation.
 */

import type { MoodState, Pressure, MoodDerivation } from './mood.service.js';
import type { SubLlmProvider } from './emotional-scoring.service.js';

// ─── Constants ──────────────────────────────────────────────────────────────

export const FALLBACK_DERIVATION: MoodDerivation = {
  dominant_emotion: '',
  color: '',
  reasoning: '',
};

// ─── deriveMoodLabels ───────────────────────────────────────────────────────

export async function deriveMoodLabels(
  state: MoodState,
  pressures: Pressure[],
  motivation: string,
  goal: string,
  purpose: string,
  subLlm: SubLlmProvider,
): Promise<MoodDerivation> {
  // Sort pressures by abs(magnitude) descending, take top 5
  const topPressures = [...pressures]
    .sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude))
    .slice(0, 5);

  const pressureLines = topPressures.length > 0
    ? topPressures.map(
        (p, i) => `  ${i + 1}. direction="${p.direction}" magnitude=${p.magnitude.toFixed(2)} reason="${p.reason}"`,
      ).join('\n')
    : '  (none)';

  const prompt = `You are the introspective voice of a digital ghost — specific, honest, no editorializing.

Given the current dimensional mood state and active pressures, derive the dominant emotion, a color metaphor, and brief reasoning.

Dimensional State:
  valence: ${state.valence.toFixed(2)} (-1 miserable to 1 elated)
  arousal: ${state.arousal.toFixed(2)} (0 calm to 1 activated)
  confidence: ${state.confidence.toFixed(2)} (0 uncertain to 1 sure)
  social_warmth: ${state.social_warmth.toFixed(2)} (0 withdrawn to 1 seeking connection)
  coherence: ${state.coherence.toFixed(2)} (0 confused to 1 things make sense)
  trust: ${state.trust.toFixed(2)} (0 suspicious to 1 fully trusting)

Top Active Pressures:
${pressureLines}

Motivation: ${motivation || '(none)'}
Goal: ${goal || '(none)'}
Purpose: ${purpose || '(none)'}

Respond with ONLY valid JSON (no markdown, no explanation):
{ "dominant_emotion": "...", "color": "...", "reasoning": "..." }`;

  let raw: string;
  try {
    raw = await subLlm.score(prompt);
  } catch {
    return { ...FALLBACK_DERIVATION };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      dominant_emotion: typeof parsed.dominant_emotion === 'string' ? parsed.dominant_emotion : '',
      color: typeof parsed.color === 'string' ? parsed.color : '',
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    return { ...FALLBACK_DERIVATION };
  }
}

// ─── Motivation ─────────────────────────────────────────────────────────────

export function deriveMotivation(pressures: Pressure[]): string {
  if (pressures.length === 0) return '';

  const top = [...pressures].sort(
    (a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude),
  )[0];

  return `Driven by ${top.reason}`;
}

// ─── Goal ───────────────────────────────────────────────────────────────────

export function shouldUpdateGoal(currentGoal: string, pressures: Pressure[]): boolean {
  if (pressures.length === 0) return false;

  // Goal persists unless a very strong pressure (abs > 0.7) contradicts it
  return pressures.some((p) => Math.abs(p.magnitude) > 0.7);
}

// ─── Purpose ────────────────────────────────────────────────────────────────

export function shouldUpdatePurpose(remCyclesSinceShift: number): boolean {
  return remCyclesSinceShift >= 10;
}
