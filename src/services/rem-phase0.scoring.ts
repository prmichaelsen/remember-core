/**
 * REM Phase 0 — Emotional scoring phase.
 *
 * Runs before relationship discovery (Phase 1+). Selects unscored/outdated
 * memories by priority, scores them on all 31 dimensions via per-dimension
 * Haiku calls, computes composites, and updates REM metadata.
 *
 * Has its own cost cap separate from relationship/curation scoring.
 */

import { Filters } from 'weaviate-client';
import type { Logger } from '../utils/logger.js';
import { ALL_SCORING_DIMENSIONS } from '../database/weaviate/v2-collections.js';
import type { EmotionalScoringService, ScoringContext } from './emotional-scoring.service.js';
import type { ScoringContextService, CollectionStatsCache } from './scoring-context.service.js';
import { createCollectionStatsCache } from './scoring-context.service.js';
import { computeAllComposites } from './composite-scoring.js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface Phase0Config {
  batch_size: number;
  cost_cap: number;
  cost_per_memory: number;
}

export const DEFAULT_PHASE0_CONFIG: Phase0Config = {
  batch_size: 50,
  cost_cap: 5.0,
  cost_per_memory: 0.0015,
};

export interface Phase0Result {
  memories_scored: number;
  memories_skipped: number;
  dimensions_scored: number;
  cost_consumed: number;
  stopped_by_cap: boolean;
}

export interface Phase0Deps {
  emotionalScoringService: EmotionalScoringService;
  scoringContextService: ScoringContextService;
  config?: Partial<Phase0Config>;
  logger?: Logger;
}

// ─── Memory Selection ─────────────────────────────────────────────────────

/**
 * Select memories for scoring in priority order:
 * 1. Unscored (rem_touched_at is null)
 * 2. Outdated (oldest rem_touched_at first)
 */
export async function selectMemoriesForScoring(
  collection: any,
  batchSize: number,
): Promise<Array<{ uuid: string; properties: Record<string, any> }>> {
  const memories: Array<{ uuid: string; properties: Record<string, any> }> = [];

  // Priority 1: Unscored memories (rem_touched_at is null)
  const unscoredFilter = Filters.and(
    collection.filter.byProperty('doc_type').equal('memory'),
    collection.filter.byProperty('rem_touched_at').isNull(true),
  );

  const unscoredResult = await collection.query.fetchObjects({
    filters: unscoredFilter,
    limit: batchSize,
  });

  for (const obj of unscoredResult.objects) {
    if (memories.length >= batchSize) break;
    memories.push(obj);
  }

  // Priority 2: Outdated memories (oldest rem_touched_at first)
  if (memories.length < batchSize) {
    const remaining = batchSize - memories.length;
    const scoredFilter = Filters.and(
      collection.filter.byProperty('doc_type').equal('memory'),
      collection.filter.byProperty('rem_touched_at').isNull(false),
    );

    const scoredResult = await collection.query.fetchObjects({
      filters: scoredFilter,
      limit: remaining,
      sort: collection.sort.byProperty('rem_touched_at', true),
    });

    const existingIds = new Set(memories.map((m) => m.uuid));
    for (const obj of scoredResult.objects) {
      if (existingIds.has(obj.uuid)) continue;
      if (memories.length >= batchSize) break;
      memories.push(obj);
    }
  }

  return memories;
}

// ─── Phase 0 Execution ───────────────────────────────────────────────────

/**
 * Execute Phase 0 emotional scoring for a collection.
 */
export async function runPhase0(
  collection: any,
  collectionName: string,
  deps: Phase0Deps,
): Promise<Phase0Result> {
  const config = { ...DEFAULT_PHASE0_CONFIG, ...deps.config };
  const logger: Logger = deps.logger ?? (console as any);
  const statsCache = createCollectionStatsCache();

  const result: Phase0Result = {
    memories_scored: 0,
    memories_skipped: 0,
    dimensions_scored: 0,
    cost_consumed: 0,
    stopped_by_cap: false,
  };

  // Select memories by priority
  const memories = await selectMemoriesForScoring(collection, config.batch_size);
  if (memories.length === 0) {
    logger.debug?.('[Phase0] No memories to score');
    return result;
  }

  logger.info?.(`[Phase0] Selected ${memories.length} memories for scoring`);

  // Process each memory
  for (const memory of memories) {
    // Check cost cap before processing
    if (result.cost_consumed + config.cost_per_memory > config.cost_cap) {
      logger.info?.(`[Phase0] Cost cap reached (${result.cost_consumed.toFixed(4)} / ${config.cost_cap})`);
      result.stopped_by_cap = true;
      break;
    }

    try {
      const content = memory.properties.content ?? '';
      const contentType = memory.properties.content_type ?? 'text';
      const createdAt = memory.properties.created_at ?? new Date().toISOString();

      // 1. Gather scoring context
      const context: ScoringContext = await deps.scoringContextService.gatherScoringContext(
        collection,
        collectionName,
        memory.uuid,
        statsCache,
      );

      // 2. Score all 31 dimensions
      const scores = await deps.emotionalScoringService.scoreAllDimensions(
        { content, content_type: contentType, created_at: createdAt },
        context,
      );

      // 3. Compute composite scores
      const composites = computeAllComposites(scores);

      // 4. Build update properties
      const updateProps: Record<string, any> = {};

      // Dimension scores
      for (const dim of ALL_SCORING_DIMENSIONS) {
        if (scores[dim] !== null && scores[dim] !== undefined) {
          updateProps[dim] = scores[dim];
          result.dimensions_scored++;
        }
      }

      // Composites
      if (composites.feel_significance !== null) {
        updateProps.feel_significance = composites.feel_significance;
      }
      if (composites.functional_significance !== null) {
        updateProps.functional_significance = composites.functional_significance;
      }
      if (composites.total_significance !== null) {
        updateProps.total_significance = composites.total_significance;
      }

      // 5. REM metadata
      updateProps.rem_touched_at = new Date().toISOString();
      updateProps.rem_visits = (memory.properties.rem_visits ?? 0) + 1;

      // 6. Persist all scores + composites + metadata in single update
      await collection.data.update({
        id: memory.uuid,
        properties: updateProps,
      });

      result.memories_scored++;
      result.cost_consumed += config.cost_per_memory;
    } catch (err) {
      logger.warn?.(`[Phase0] Failed to score memory ${memory.uuid}: ${err}`);
      result.memories_skipped++;
    }
  }

  logger.info?.(`[Phase0] Complete: ${result.memories_scored} scored, ${result.memories_skipped} skipped, cost: $${result.cost_consumed.toFixed(4)}`);

  return result;
}
