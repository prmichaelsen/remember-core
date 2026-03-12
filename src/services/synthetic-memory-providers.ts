/**
 * Concrete SyntheticMemoryProvider implementations for mood and perception.
 *
 * Each provider fetches internal state from Firestore via its respective service
 * and formats it as a memory-shaped object for the synthetic 'core' space.
 */

import { DefaultSyntheticMemoryRegistry, type SyntheticMemoryProvider, type SyntheticMemoryRegistry } from './synthetic-memory-registry.js';
import type { MoodService, CoreMoodMemory, MoodState } from './mood.service.js';
import type { PerceptionService, UserPerception } from './perception.service.js';

// ─── Mood Formatter ─────────────────────────────────────────────────────

function flattenMoodState(state: MoodState): Record<string, number> {
  return {
    mood_valence: state.valence,
    mood_arousal: state.arousal,
    mood_confidence: state.confidence,
    mood_social_warmth: state.social_warmth,
    mood_coherence: state.coherence,
    mood_trust: state.trust,
  };
}

function buildMoodContent(mood: CoreMoodMemory): string {
  const lines: string[] = [];

  if (mood.dominant_emotion || mood.color) {
    lines.push(`Current mood: ${mood.dominant_emotion || mood.color}`);
  }
  if (mood.reasoning) {
    lines.push(`Reasoning: ${mood.reasoning}`);
  }

  const s = mood.state;
  lines.push(`Valence: ${s.valence}, Arousal: ${s.arousal}, Confidence: ${s.confidence}`);
  lines.push(`Social Warmth: ${s.social_warmth}, Coherence: ${s.coherence}, Trust: ${s.trust}`);

  if (mood.motivation) lines.push(`Motivation: ${mood.motivation}`);
  if (mood.goal) lines.push(`Goal: ${mood.goal}`);
  if (mood.purpose) lines.push(`Purpose: ${mood.purpose}`);

  lines.push(`Active pressures: ${mood.pressures.length}`);
  lines.push(`Last updated: ${mood.last_updated}`);

  return lines.join('\n');
}

export function formatMoodAsMemory(
  mood: CoreMoodMemory,
  userId: string,
): Record<string, unknown> {
  return {
    id: `synthetic:mood:${userId}`,
    doc_type: 'memory',
    content_type: 'system',
    content: buildMoodContent(mood),
    title: 'Current Mood State',
    tags: ['core', 'mood', 'synthetic'],
    created_at: mood.last_updated,
    updated_at: mood.last_updated,
    user_id: userId,
    ...flattenMoodState(mood.state),
  };
}

// ─── Perception Formatter ───────────────────────────────────────────────

function buildPerceptionContent(perception: UserPerception): string {
  const lines: string[] = [];

  if (perception.personality_sketch) lines.push(`Personality: ${perception.personality_sketch}`);
  if (perception.communication_style) lines.push(`Communication style: ${perception.communication_style}`);
  if (perception.emotional_baseline) lines.push(`Emotional baseline: ${perception.emotional_baseline}`);
  if (perception.interests.length > 0) lines.push(`Interests: ${perception.interests.join(', ')}`);
  if (perception.patterns.length > 0) lines.push(`Patterns: ${perception.patterns.join(', ')}`);
  if (perception.needs.length > 0) lines.push(`Needs: ${perception.needs.join(', ')}`);
  if (perception.evolution_notes) lines.push(`Evolution notes: ${perception.evolution_notes}`);
  lines.push(`Confidence: ${perception.confidence_level}`);
  lines.push(`Last updated: ${perception.last_updated}`);

  return lines.join('\n');
}

export function formatPerceptionAsMemory(
  perception: UserPerception,
  userId: string,
): Record<string, unknown> {
  return {
    id: `synthetic:perception:${userId}`,
    doc_type: 'memory',
    content_type: 'system',
    content: buildPerceptionContent(perception),
    title: 'User Perception',
    tags: ['core', 'perception', 'synthetic'],
    created_at: perception.last_updated,
    updated_at: perception.last_updated,
    user_id: userId,
  };
}

// ─── Provider Classes ───────────────────────────────────────────────────

export class MoodMemoryProvider implements SyntheticMemoryProvider {
  key = 'mood';

  constructor(private moodService: MoodService) {}

  async fetch(userId: string, ghostCompositeId: string): Promise<Record<string, unknown> | null> {
    const mood = await this.moodService.getMood(userId, ghostCompositeId);
    if (!mood) return null;
    return formatMoodAsMemory(mood, userId);
  }
}

export class PerceptionMemoryProvider implements SyntheticMemoryProvider {
  key = 'perception';

  constructor(private perceptionService: PerceptionService) {}

  async fetch(userId: string, ghostCompositeId: string): Promise<Record<string, unknown> | null> {
    const perception = await this.perceptionService.getPerception(userId, ghostCompositeId);
    if (!perception) return null;
    return formatPerceptionAsMemory(perception, userId);
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

/**
 * Create a core registry wired to available services.
 * Providers are only registered if the corresponding service is provided.
 */
export function createCoreRegistry(deps: {
  moodService?: MoodService;
  perceptionService?: PerceptionService;
}): SyntheticMemoryRegistry {
  const registry = new DefaultSyntheticMemoryRegistry();
  if (deps.moodService) registry.register(new MoodMemoryProvider(deps.moodService));
  if (deps.perceptionService) registry.register(new PerceptionMemoryProvider(deps.perceptionService));
  return registry;
}
