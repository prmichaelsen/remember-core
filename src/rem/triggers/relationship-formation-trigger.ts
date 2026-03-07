/**
 * Relationship Formation Re-evaluation Trigger (Trigger B).
 *
 * Event-driven trigger that fires when REM forms a new relationship
 * involving a memory. Gathers relationship context and runs selective
 * re-evaluation on the affected memory's emotional scores.
 */

import type { Logger } from '../../utils/logger.js';
import { ALL_SCORING_DIMENSIONS } from '../../database/weaviate/v2-collections.js';
import type { SelectiveReEvaluationService, ReEvaluationContext } from '../reeval/selective-reevaluation.js';
import type { ScoringContextService } from '../../services/scoring-context.service.js';
import { createCollectionStatsCache } from '../../services/scoring-context.service.js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface RelationshipFormationTriggerResult {
  memory_id: string;
  reevaluated: boolean;
  dimensions_rescored: number;
  skipped_reason?: string;
}

export interface RelationshipFormationTriggerDeps {
  reEvaluationService: SelectiveReEvaluationService;
  scoringContextService: ScoringContextService;
  logger?: Logger;
}

export interface NewRelationship {
  observation?: string;
  relationship_type?: string;
}

// ─── Trigger Execution ───────────────────────────────────────────────────

/**
 * Execute the relationship formation re-evaluation trigger for a single memory.
 * Called when REM forms a new relationship involving the given memory.
 */
export async function runRelationshipFormationTrigger(
  collection: any,
  collectionName: string,
  memoryId: string,
  newRelationships: NewRelationship[],
  deps: RelationshipFormationTriggerDeps,
): Promise<RelationshipFormationTriggerResult> {
  const logger: Logger = deps.logger ?? (console as any);
  const statsCache = createCollectionStatsCache();

  // 1. Fetch the memory from the collection
  let memoryObj: any;
  try {
    memoryObj = await collection.query.fetchObjectById(memoryId);
  } catch (err) {
    logger.warn?.(`[RelationshipFormationTrigger] Error fetching memory ${memoryId}: ${err}`);
    return {
      memory_id: memoryId,
      reevaluated: false,
      dimensions_rescored: 0,
      skipped_reason: 'memory_fetch_error',
    };
  }

  if (!memoryObj) {
    logger.debug?.(`[RelationshipFormationTrigger] Memory ${memoryId} not found`);
    return {
      memory_id: memoryId,
      reevaluated: false,
      dimensions_rescored: 0,
      skipped_reason: 'memory_not_found',
    };
  }

  const properties = memoryObj.properties ?? {};
  const content = properties.content ?? '';
  const contentType = properties.content_type ?? 'text';
  const createdAt = properties.created_at ?? '';

  // 2. Gather current scores
  const currentScores: Partial<Record<string, number | null>> = {};
  for (const dim of ALL_SCORING_DIMENSIONS) {
    currentScores[dim] = properties[dim] ?? null;
  }

  // 3. Gather relationship observations and collection averages
  const [observations, collectionAverages] = await Promise.all([
    deps.scoringContextService.fetchRelationshipObservations(collection, memoryId),
    deps.scoringContextService.computeCollectionAverages(collection, statsCache, collectionName),
  ]);

  // 4. Gather related memories from the new relationships for context
  const recentRelatedMemories: Array<{ content: string }> = [];
  // The new relationships themselves provide context; observations from
  // existing relationships are also included via fetchRelationshipObservations.

  // 5. Build re-evaluation context
  const reEvalContext: ReEvaluationContext = {
    memory: { id: memoryId, content, content_type: contentType, created_at: createdAt },
    currentScores,
    newRelationships,
    recentRelatedMemories,
    relationshipObservations: observations,
    collectionEmotionalAverages: collectionAverages as Record<string, number>,
    triggerType: 'relationship_formation',
  };

  // 6. Build scoring context for dimension re-scoring
  const scoringContext = {
    relationship_observations: observations,
    nearest_neighbor_scores: {},
    collection_averages: collectionAverages as Record<string, number>,
  };

  // 7. Run selective re-evaluation
  try {
    const reEvalResult = await deps.reEvaluationService.reEvaluate(reEvalContext, scoringContext);

    if (reEvalResult.skipped) {
      logger.debug?.(`[RelationshipFormationTrigger] Re-evaluation skipped for ${memoryId}`);
      return {
        memory_id: memoryId,
        reevaluated: false,
        dimensions_rescored: 0,
        skipped_reason: 'no_impacted_dimensions',
      };
    }

    // 8. Build update properties
    const updateProps: Record<string, any> = {};

    // Write changed dimensions
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
    updateProps.rem_visits = (properties.rem_visits ?? 0) + 1;

    // 9. Persist
    await collection.data.update({ id: memoryId, properties: updateProps });

    logger.info?.(`[RelationshipFormationTrigger] Re-evaluated ${memoryId}: ${reEvalResult.dimensionsReScored.length} dimensions rescored`);

    return {
      memory_id: memoryId,
      reevaluated: true,
      dimensions_rescored: reEvalResult.dimensionsReScored.length,
    };
  } catch (err) {
    logger.warn?.(`[RelationshipFormationTrigger] Failed to re-evaluate ${memoryId}: ${err}`);
    return {
      memory_id: memoryId,
      reevaluated: false,
      dimensions_rescored: 0,
      skipped_reason: 'reeval_error',
    };
  }
}
