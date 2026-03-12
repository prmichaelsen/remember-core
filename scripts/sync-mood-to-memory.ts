#!/usr/bin/env node
/**
 * Sync a user's mood state to a Weaviate memory.
 *
 * Reads the user's CoreMoodMemory from Firestore and upserts it as a real
 * Weaviate memory in their user collection with content_type: 'system'.
 *
 * Uses a deterministic UUID so repeated runs overwrite rather than duplicate.
 *
 * Usage:
 *   set -a && source .env.e1.local && set +a && \
 *     npx tsx scripts/sync-mood-to-memory.ts <userId> <ghostCompositeId>
 *
 * Example:
 *   npx tsx scripts/sync-mood-to-memory.ts e1_test_user ghost_owner:assistant
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';
import { ensureUserCollection } from '../src/database/weaviate/v2-collections.js';
import { MoodService, type CoreMoodMemory } from '../src/services/mood.service.js';
import { v5 as uuidv5 } from 'uuid';

// ─── Config ──────────────────────────────────────────────────────────────

const userId = process.argv[2];
const ghostCompositeId = process.argv[3];

if (!userId || !ghostCompositeId) {
  console.error('Usage: npx tsx scripts/sync-mood-to-memory.ts <userId> <ghostCompositeId>');
  console.error('Example: npx tsx scripts/sync-mood-to-memory.ts e1_test_user ghost_owner:assistant');
  process.exit(1);
}

if (!process.env.WEAVIATE_REST_URL) {
  console.error('Error: WEAVIATE_REST_URL environment variable required');
  process.exit(1);
}

// ─── Deterministic UUID ──────────────────────────────────────────────────

const MOOD_MEMORY_NAMESPACE = uuidv5.DNS;

function getMoodMemoryId(uid: string, ghostId: string): string {
  return uuidv5(`mood:${uid}:${ghostId}`, MOOD_MEMORY_NAMESPACE);
}

// ─── Format mood as memory content ──────────────────────────────────────

function formatMoodContent(mood: CoreMoodMemory): string {
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

// ─── Main ────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n  Sync Mood → Memory`);
  console.log(`  User:   ${userId}`);
  console.log(`  Ghost:  ${ghostCompositeId}`);

  // 1. Read mood from Firestore
  const moodService = new MoodService();
  const mood = await moodService.getMood(userId, ghostCompositeId);

  if (!mood) {
    console.error(`\n  No mood found for ${userId}/${ghostCompositeId}`);
    process.exit(1);
  }

  console.log(`  Mood found: ${mood.dominant_emotion || '(no label)'} (${mood.color || 'no color'})`);
  console.log(`  State: val=${mood.state.valence.toFixed(3)} aro=${mood.state.arousal.toFixed(3)} conf=${mood.state.confidence.toFixed(3)}`);
  console.log(`         warm=${mood.state.social_warmth.toFixed(3)} cohr=${mood.state.coherence.toFixed(3)} trust=${mood.state.trust.toFixed(3)}`);
  console.log(`  Pressures: ${mood.pressures.length}`);
  console.log(`  Last updated: ${mood.last_updated}`);

  // 2. Connect to Weaviate
  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_EMBEDDINGS_API_KEY ?? process.env.OPENAI_API_KEY,
  });

  await ensureUserCollection(client, userId);
  const collection = client.collections.get(`Memory_users_${userId}`);

  // 3. Build the memory
  const moodMemoryId = getMoodMemoryId(userId, ghostCompositeId);
  const content = formatMoodContent(mood);
  const now = new Date().toISOString();

  const properties: Record<string, unknown> = {
    content,
    content_type: 'ghost',
    doc_type: 'memory',
    user_id: userId,
    title: `Core Mood State — ${ghostCompositeId}`,
    tags: ['ghost', `ghost_type:${ghostCompositeId.includes('space:') ? 'space' : 'personal'}`, ghostCompositeId, 'system:mood', 'auto_sync'],
    created_at: now,
    updated_at: now,
    version: 1,
    weight: 0.5,
    trust_score: 5,
  };

  // 4. Upsert — try replace first (existing), fall back to insert (new)
  console.log(`\n  Memory ID: ${moodMemoryId}`);
  console.log(`  Collection: Memory_users_${userId}`);

  try {
    // Check if it exists
    const existing = await collection.query.fetchObjectById(moodMemoryId, { returnProperties: ['version'] });
    if (existing) {
      const existingVersion = (existing.properties as any).version ?? 0;
      properties.version = existingVersion + 1;
      await collection.data.replace({
        id: moodMemoryId,
        properties,
      });
      console.log(`  ✅ Replaced existing mood memory (v${properties.version})`);
    } else {
      await collection.data.insert({
        id: moodMemoryId,
        properties,
      });
      console.log(`  ✅ Inserted new mood memory (v1)`);
    }
  } catch (err: any) {
    console.error(`  ❌ Failed to upsert mood memory: ${err.message}`);
    process.exit(1);
  }

  // 5. Verify
  const verify = await collection.query.fetchObjectById(moodMemoryId, {
    returnProperties: ['content_type', 'title', 'tags', 'version', 'updated_at'],
  });

  if (verify) {
    const vProps = verify.properties as Record<string, unknown>;
    console.log(`\n  Verification:`);
    console.log(`    content_type: ${vProps.content_type}`);
    console.log(`    title:        ${vProps.title}`);
    console.log(`    tags:         ${(vProps.tags as string[])?.join(', ')}`);
    console.log(`    version:      ${vProps.version}`);
    console.log(`    updated_at:   ${vProps.updated_at}`);
  }

  console.log(`\n  Content preview:`);
  console.log(content.split('\n').map(l => `    ${l}`).join('\n'));
  console.log();

  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
