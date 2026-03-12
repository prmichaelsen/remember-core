/**
 * Mood-to-Memory Sync — upserts mood state as a real Weaviate memory.
 *
 * Uses a deterministic UUID so repeated syncs overwrite rather than duplicate.
 * Tagged with content_type: 'ghost' and ghost ownership tags.
 */

import { v5 as uuidv5 } from 'uuid';
import type { CoreMoodMemory } from './mood.service.js';

// ─── Deterministic UUID ──────────────────────────────────────────────────

const MOOD_MEMORY_NAMESPACE = uuidv5.DNS;

/**
 * Compute a deterministic UUID for a user+ghost mood memory.
 * Same inputs always produce the same UUID — upserts overwrite.
 */
export function getMoodMemoryId(userId: string, ghostCompositeId: string): string {
  return uuidv5(`mood:${userId}:${ghostCompositeId}`, MOOD_MEMORY_NAMESPACE);
}

// ─── Format mood as memory content ──────────────────────────────────────

/**
 * Format a CoreMoodMemory into human-readable content for a Weaviate memory.
 */
export function formatMoodContent(mood: CoreMoodMemory): string {
  const s = mood.state;
  const lines: string[] = [];

  // Derived labels
  if (mood.dominant_emotion && mood.color) {
    lines.push(`Current mood: ${mood.dominant_emotion} (${mood.color})`);
  }
  if (mood.reasoning) {
    lines.push(`Reasoning: ${mood.reasoning}`);
  }

  // Dimensional state
  lines.push('');
  lines.push(`Valence: ${s.valence.toFixed(3)}`);
  lines.push(`Arousal: ${s.arousal.toFixed(3)}`);
  lines.push(`Confidence: ${s.confidence.toFixed(3)}`);
  lines.push(`Social Warmth: ${s.social_warmth.toFixed(3)}`);
  lines.push(`Coherence: ${s.coherence.toFixed(3)}`);
  lines.push(`Trust: ${s.trust.toFixed(3)}`);

  // Directional state
  if (mood.motivation) lines.push(`\nMotivation: ${mood.motivation}`);
  if (mood.goal) lines.push(`Goal: ${mood.goal}`);
  if (mood.purpose) lines.push(`Purpose: ${mood.purpose}`);

  // Perception
  if (mood.personality_sketch) lines.push(`\nPersonality: ${mood.personality_sketch}`);
  if (mood.communication_style) lines.push(`Communication style: ${mood.communication_style}`);
  if (mood.emotional_baseline) lines.push(`Emotional baseline: ${mood.emotional_baseline}`);
  if (mood.interests?.length) lines.push(`Interests: ${mood.interests.join(', ')}`);
  if (mood.patterns?.length) lines.push(`Patterns: ${mood.patterns.join(', ')}`);
  if (mood.needs?.length) lines.push(`Needs: ${mood.needs.join(', ')}`);
  if (mood.evolution_notes) lines.push(`Evolution: ${mood.evolution_notes}`);

  // Pressures
  lines.push(`\nActive pressures: ${mood.pressures.length}`);
  lines.push(`REM cycles since shift: ${mood.rem_cycles_since_shift}`);
  lines.push(`Last updated: ${mood.last_updated}`);

  return lines.join('\n');
}

// ─── Build mood memory properties ───────────────────────────────────────

/**
 * Build ghost ownership tags from a ghostCompositeId.
 * e.g. "ghost_owner:space:the_void" → ['ghost', 'ghost_type:space', 'ghost_owner:space:the_void']
 */
export function buildGhostTags(ghostCompositeId: string): string[] {
  const ghostType = ghostCompositeId.includes('space:') ? 'space' : 'personal';
  return ['ghost', `ghost_type:${ghostType}`, ghostCompositeId];
}

/**
 * Build the full Weaviate properties object for a mood memory.
 */
export function buildMoodMemoryProperties(
  mood: CoreMoodMemory,
  userId: string,
  ghostCompositeId: string,
): Record<string, unknown> {
  const content = formatMoodContent(mood);
  const ghostTags = buildGhostTags(ghostCompositeId);
  const now = new Date().toISOString();

  return {
    content,
    content_type: 'ghost',
    doc_type: 'memory',
    user_id: userId,
    title: `Core Mood State`,
    tags: [...ghostTags, 'system:mood', 'auto_sync'],
    created_at: now,
    updated_at: now,
    version: 1,
    weight: 0.5,
    trust_score: 5,
  };
}

// ─── Upsert ─────────────────────────────────────────────────────────────

/**
 * Upsert mood state as a Weaviate memory in the user's collection.
 * Uses deterministic UUID — replace if exists, insert if new.
 */
export async function syncMoodToMemory(
  collection: any,
  mood: CoreMoodMemory,
  userId: string,
  ghostCompositeId: string,
): Promise<{ id: string; action: 'inserted' | 'replaced' }> {
  const moodMemoryId = getMoodMemoryId(userId, ghostCompositeId);
  const properties = buildMoodMemoryProperties(mood, userId, ghostCompositeId);

  try {
    // Try replace first (existing memory)
    const existing = await collection.query.fetchObjectById(moodMemoryId, {
      returnProperties: ['version'],
    });

    if (existing) {
      const existingVersion = (existing.properties as any).version ?? 0;
      properties.version = existingVersion + 1;
      properties.updated_at = new Date().toISOString();
      await collection.data.replace({ id: moodMemoryId, properties });
      return { id: moodMemoryId, action: 'replaced' };
    }
  } catch {
    // fetchObjectById may throw if object doesn't exist — fall through to insert
  }

  await collection.data.insert({ id: moodMemoryId, properties });
  return { id: moodMemoryId, action: 'inserted' };
}
