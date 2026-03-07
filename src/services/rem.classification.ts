/**
 * REM Classification Pipeline — classifies unclassified memories during REM cycle.
 *
 * Uses Haiku sub-LLM with findSimilar context. Assigns genre, quality signals,
 * thematic groups. Detects duplicates and merge candidates.
 *
 * See: agent/design/core-mood-memory.md — "Memory Classification"
 */

import type { Logger } from '../utils/logger.js';
import type { ClassificationService, Genre, QualitySignal, MergeCandidate, ClassifyInput } from './classification.service.js';
import { GENRES, QUALITY_SIGNALS } from './classification.service.js';
import type { SubLlmProvider } from './emotional-scoring.service.js';
import type { MoodService, Pressure } from './mood.service.js';
import { CLASSIFICATION_BATCH_SIZE, CONTRADICTION_PRESSURE_MAGNITUDE } from './rem.constants.js';

// ─── Types ───────────────────────────────────────────────────────────────

export interface ClassificationPipelineResult {
  memories_classified: number;
  memories_skipped: number;
  duplicates_found: number;
  merge_candidates_found: number;
  contradictions_found: number;
}

export interface ClassificationResponse {
  genre: string;
  qualities: string[];
  thematic_groups: string[];
  is_duplicate: boolean;
  duplicate_of?: string;
  merge_candidates?: Array<{ memory_id: string; reason: string }>;
  contradictions?: Array<{ memory_id: string; description: string }>;
}

export interface ClassificationPipelineDeps {
  collection: any;
  collectionId: string;
  subLlm: SubLlmProvider;
  classificationService: ClassificationService;
  moodService?: MoodService;
  ghostCompositeId?: string;
  logger: Logger;
}

// ─── Prompt Building ─────────────────────────────────────────────────────

export function buildClassificationPrompt(
  memory: { id: string; content: string; content_type?: string },
  neighbors: Array<{ id: string; content: string; similarity: number }>,
): string {
  const genreList = GENRES.join(', ');
  const qualityList = QUALITY_SIGNALS.join(', ');

  let neighborSection = 'No similar memories found.';
  if (neighbors.length > 0) {
    neighborSection = neighbors
      .map((n, i) => `Neighbor ${i + 1} (id: ${n.id}, similarity: ${n.similarity.toFixed(3)}):\n${n.content.slice(0, 500)}`)
      .join('\n\n');
  }

  return `You are classifying a memory for a personal knowledge system. Analyze the memory and its nearest neighbors, then return a JSON classification.

## Memory to classify
ID: ${memory.id}
Content type: ${memory.content_type ?? 'text'}

${memory.content.slice(0, 2000)}

## Similar memories (nearest neighbors)
${neighborSection}

## Instructions

1. **Genre** — Pick exactly one from this list: ${genreList}
2. **Quality signals** — Pick one or more from: ${qualityList}
   - "substantive" = real content with value
   - "draft" = work in progress
   - "low_value" = test data, throwaway notes, very short meaningless content
   - "duplicate" = substantially identical to a neighbor
   - "stale" = was relevant but no longer is
3. **Thematic groups** — Generate 1-3 descriptive snake_case tags for the topic/theme
4. **Duplicate detection** — If the memory content is essentially identical to any neighbor, set is_duplicate=true and duplicate_of to that neighbor's ID
5. **Merge candidates** — If a neighbor is similar but NOT identical (could be merged/consolidated), list it
6. **Contradictions** — If the memory contradicts any neighbor, describe the contradiction

CRITICAL: Return ONLY the raw JSON object. Do NOT wrap in markdown fences (\`\`\`json). Do NOT include any text before or after the JSON.
{"genre":"...","qualities":["..."],"thematic_groups":["..."],"is_duplicate":false,"duplicate_of":null,"merge_candidates":[],"contradictions":[]}`;
}

// ─── Response Parsing ────────────────────────────────────────────────────

const GENRE_SET = new Set<string>(GENRES);
const QUALITY_SET = new Set<string>(QUALITY_SIGNALS);

export function parseClassificationResponse(raw: string): ClassificationResponse | null {
  try {
    // Strip markdown fences if present
    let cleaned = raw.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();

    // Try direct parse first, then extract first JSON object from mixed text
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      parsed = JSON.parse(jsonMatch[0]);
    }

    // Validate and coerce genre
    const genre = GENRE_SET.has(parsed.genre) ? parsed.genre : 'other';

    // Validate qualities
    const qualities = (parsed.qualities ?? [])
      .filter((q: string) => QUALITY_SET.has(q));
    if (qualities.length === 0) qualities.push('substantive');

    // Normalize thematic groups to snake_case
    const thematic_groups = (parsed.thematic_groups ?? [])
      .map((g: string) => g.replace(/[\s-]+/g, '_').toLowerCase())
      .filter((g: string) => g.length > 0);

    return {
      genre,
      qualities,
      thematic_groups,
      is_duplicate: parsed.is_duplicate === true,
      duplicate_of: parsed.duplicate_of ?? undefined,
      merge_candidates: parsed.merge_candidates ?? [],
      contradictions: parsed.contradictions ?? [],
    };
  } catch {
    return null;
  }
}

// ─── Pipeline ────────────────────────────────────────────────────────────

/**
 * Run classification pipeline on unclassified memories in the collection.
 */
export async function runClassificationPipeline(
  deps: ClassificationPipelineDeps,
): Promise<ClassificationPipelineResult> {
  const { collection, collectionId, subLlm, classificationService, logger } = deps;

  const stats: ClassificationPipelineResult = {
    memories_classified: 0,
    memories_skipped: 0,
    duplicates_found: 0,
    merge_candidates_found: 0,
    contradictions_found: 0,
  };

  // Get current classification index to find already-classified memory IDs
  const index = await classificationService.getOrInitialize(collectionId);
  const classifiedIds = new Set<string>();
  for (const ids of Object.values(index.genres)) {
    for (const id of ids) classifiedIds.add(id);
  }

  // Fetch oldest unclassified memories
  const memories = await selectUnclassifiedMemories(collection, classifiedIds);

  if (memories.length === 0) {
    logger.info?.('Classification: No unclassified memories');
    return stats;
  }

  logger.info?.('Classification: Processing batch', {
    batch_size: memories.length,
    already_classified: classifiedIds.size,
  });

  for (const memory of memories) {
    try {
      // Find similar memories for context
      const neighbors = await findSimilarMemories(collection, memory.uuid);

      // Build prompt and call sub-LLM
      const prompt = buildClassificationPrompt(
        {
          id: memory.uuid,
          content: memory.properties.content ?? '',
          content_type: memory.properties.content_type,
        },
        neighbors,
      );

      const rawResponse = await subLlm.score(prompt, { maxTokens: 512 });
      const classification = parseClassificationResponse(rawResponse);

      if (!classification) {
        stats.memories_skipped++;
        logger.warn?.('Classification: Failed to parse Haiku response', {
          memoryId: memory.uuid,
          rawResponse: rawResponse.slice(0, 500),
        });
        continue;
      }

      // Write classification via service
      const classifyInput: ClassifyInput = {
        genre: classification.genre as Genre,
        qualities: classification.qualities as QualitySignal[],
        thematic_groups: classification.thematic_groups,
      };
      await classificationService.classify(collectionId, memory.uuid, classifyInput);

      // Handle duplicates
      if (classification.is_duplicate && classification.duplicate_of) {
        stats.duplicates_found++;
      }

      // Handle merge candidates
      if (classification.merge_candidates && classification.merge_candidates.length > 0) {
        for (const mc of classification.merge_candidates) {
          const candidate: MergeCandidate = {
            memory_id_a: memory.uuid,
            memory_id_b: mc.memory_id,
            reason: mc.reason,
          };
          await classificationService.addMergeCandidate(collectionId, candidate);
          stats.merge_candidates_found++;
        }
      }

      // Handle contradictions — create coherence pressure
      if (classification.contradictions && classification.contradictions.length > 0 && deps.moodService && deps.ghostCompositeId) {
        for (const contradiction of classification.contradictions) {
          const userId = extractUserId(collectionId);
          const pressure: Pressure = {
            source_memory_id: memory.uuid,
            direction: `coherence:${CONTRADICTION_PRESSURE_MAGNITUDE}`,
            dimension: 'coherence',
            magnitude: CONTRADICTION_PRESSURE_MAGNITUDE,
            reason: `Contradiction detected: ${contradiction.description}`,
            created_at: new Date().toISOString(),
            decay_rate: 0.1,
          };
          await deps.moodService.addPressure(userId, deps.ghostCompositeId, pressure);
          stats.contradictions_found++;
        }
      }

      stats.memories_classified++;
    } catch (err) {
      stats.memories_skipped++;
      logger.warn?.('Classification: Failed to classify memory', {
        memoryId: memory.uuid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Update unclassified count
  const totalMemories = (await collection.aggregate.overAll()).totalCount ?? 0;
  const newClassifiedCount = classifiedIds.size + stats.memories_classified;
  const remaining = Math.max(0, totalMemories - newClassifiedCount);
  await classificationService.setUnclassifiedCount(collectionId, remaining);

  logger.info?.('Classification: Batch complete', { ...stats });

  return stats;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

async function selectUnclassifiedMemories(
  collection: any,
  classifiedIds: Set<string>,
): Promise<any[]> {
  // Fetch recent memories and filter out already-classified ones
  const filter = collection.filter.byProperty('doc_type').equal('memory');

  const result = await collection.query.fetchObjects({
    filters: filter,
    limit: CLASSIFICATION_BATCH_SIZE * 2, // over-fetch to account for filtering
    sort: collection.sort.byProperty('created_at', true), // oldest first
  });

  return (result.objects ?? [])
    .filter((m: any) => !classifiedIds.has(m.uuid))
    .slice(0, CLASSIFICATION_BATCH_SIZE);
}

async function findSimilarMemories(
  collection: any,
  memoryUuid: string,
): Promise<Array<{ id: string; content: string; similarity: number }>> {
  try {
    const result = await collection.query.nearObject({
      nearObject: memoryUuid,
      limit: 5,
      returnProperties: ['content'],
    });

    return (result.objects ?? [])
      .filter((obj: any) => obj.uuid !== memoryUuid)
      .map((obj: any) => ({
        id: obj.uuid,
        content: obj.properties?.content ?? '',
        similarity: obj.metadata?.distance != null ? 1 - obj.metadata.distance : 0,
      }));
  } catch {
    return [];
  }
}

function extractUserId(collectionId: string): string {
  if (collectionId.startsWith('Memory_users_')) {
    return collectionId.replace('Memory_users_', '');
  }
  if (collectionId.startsWith('Memory_groups_')) {
    return collectionId.replace('Memory_groups_', '');
  }
  return 'system';
}
