/**
 * Retrieval Threshold Re-evaluation Trigger (Trigger C).
 *
 * Fires when a memory's retrieval count crosses a configured threshold,
 * indicating the memory is frequently accessed and may warrant re-scoring.
 * Usage-driven: high retrieval frequency suggests the memory's significance
 * may have shifted relative to current collection context.
 */

import type { Logger } from '../../utils/logger.js';
import { ALL_SCORING_DIMENSIONS } from '../../database/weaviate/v2-collections.js';
import type { SelectiveReEvaluationService, ReEvaluationContext } from '../reeval/selective-reevaluation.js';
import type { ScoringContextService } from '../../services/scoring-context.service.js';
import { createCollectionStatsCache } from '../../services/scoring-context.service.js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface RetrievalMetadata {
  retrievalCount: number;
  thresholdCrossed: number;
  retrievalFrequency: number;
  recentRetrievals: number;
}

export interface RetrievalThresholdTriggerResult {
  memory_id: string;
  reevaluated: boolean;
  dimensions_rescored: number;
  skipped_reason?: string;
}

export interface RetrievalThresholdTriggerDeps {
  reEvaluationService: SelectiveReEvaluationService;
  scoringContextService: ScoringContextService;
  logger?: Logger;
}

// ─── Trigger Execution ───────────────────────────────────────────────────

/**
 * Execute the retrieval threshold re-evaluation trigger for a single memory.
 * Called when a memory's retrieval count crosses a threshold, indicating
 * that usage patterns may warrant a re-scoring of emotional dimensions.
 */
export async function runRetrievalThresholdTrigger(
  collection: any,
  collectionName: string,
  memoryId: string,
  retrievalMetadata: RetrievalMetadata,
  deps: RetrievalThresholdTriggerDeps,
): Promise<RetrievalThresholdTriggerResult> {
  const logger: Logger = deps.logger ?? (console as any);
  const statsCache = createCollectionStatsCache();

  // 1. Fetch the memory from the collection
  let memoryObj: { uuid: string; properties: Record<string, any> };
  try {
    const result = await collection.query.fetchObjectById(memoryId);
    if (!result) {
      logger.debug?.(`[RetrievalThresholdTrigger] Memory ${memoryId} not found`);
      return {
        memory_id: memoryId,
        reevaluated: false,
        dimensions_rescored: 0,
        skipped_reason: 'memory_not_found',
      };
    }
    memoryObj = result;
  } catch (err) {
    logger.warn?.(`[RetrievalThresholdTrigger] Failed to fetch memory ${memoryId}: ${err}`);
    return {
      memory_id: memoryId,
      reevaluated: false,
      dimensions_rescored: 0,
      skipped_reason: `fetch_error: ${err}`,
    };
  }

  try {
    const content = memoryObj.properties.content ?? '';
    const contentType = memoryObj.properties.content_type ?? 'text';
    const createdAt = memoryObj.properties.created_at ?? '';

    // Gather current scores
    const currentScores: Partial<Record<string, number | null>> = {};
    for (const dim of ALL_SCORING_DIMENSIONS) {
      currentScores[dim] = memoryObj.properties[dim] ?? null;
    }

    // 2. Get relationship observations for context
    const observations = await deps.scoringContextService.fetchRelationshipObservations(
      collection, memoryId,
    );

    // 3. Get collection averages
    const collectionAverages = await deps.scoringContextService.computeCollectionAverages(
      collection, statsCache, collectionName,
    );

    // 4. Build re-evaluation context
    const reEvalContext: ReEvaluationContext = {
      memory: { id: memoryId, content, content_type: contentType, created_at: createdAt },
      currentScores,
      newRelationships: [],
      recentRelatedMemories: [],
      relationshipObservations: observations,
      collectionEmotionalAverages: collectionAverages as Record<string, number>,
      triggerType: 'retrieval_threshold',
      retrievalMetadata,
    };

    // 5. Build scoring context for dimension re-scoring
    const scoringContext = {
      relationship_observations: observations,
      nearest_neighbor_scores: {},
      collection_averages: collectionAverages as Record<string, number>,
    };

    // 6. Run selective re-evaluation
    const reEvalResult = await deps.reEvaluationService.reEvaluate(reEvalContext, scoringContext);

    if (reEvalResult.skipped) {
      logger.debug?.(`[RetrievalThresholdTrigger] Re-evaluation skipped for ${memoryId}`);
      return {
        memory_id: memoryId,
        reevaluated: false,
        dimensions_rescored: 0,
        skipped_reason: 'no_dimensions_impacted',
      };
    }

    // 7. Build update properties
    const updateProps: Record<string, any> = {};

    // Only write changed dimensions
    for (const dim of reEvalResult.dimensionsReScored) {
      updateProps[dim] = reEvalResult.mergedScores[dim];
    }

    // Always write composites
    if (reEvalResult.composites.feel_significance !== null) {
      updateProps.feel_significance = reEvalResult.composites.feel_significance;
    }
    if (reEvalResult.composites.functional_significance !== null) {
      updateProps.functional_significance = reEvalResult.composites.functional_significance;
    }
    if (reEvalResult.composites.total_significance !== null) {
      updateProps.total_significance = reEvalResult.composites.total_significance;
    }

    // REM metadata
    updateProps.rem_touched_at = new Date().toISOString();
    updateProps.rem_visits = (memoryObj.properties.rem_visits ?? 0) + 1;

    // 8. Persist
    await collection.data.update({ id: memoryId, properties: updateProps });

    logger.info?.(`[RetrievalThresholdTrigger] Re-evaluated ${memoryId}: ${reEvalResult.dimensionsReScored.length} dimensions rescored`);

    return {
      memory_id: memoryId,
      reevaluated: true,
      dimensions_rescored: reEvalResult.dimensionsReScored.length,
    };
  } catch (err) {
    logger.warn?.(`[RetrievalThresholdTrigger] Failed to re-evaluate ${memoryId}: ${err}`);
    return {
      memory_id: memoryId,
      reevaluated: false,
      dimensions_rescored: 0,
      skipped_reason: `reevaluation_error: ${err}`,
    };
  }
}
