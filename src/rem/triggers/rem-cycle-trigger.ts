/**
 * REM Cycle Re-evaluation Trigger (Trigger A).
 *
 * Each REM cycle identifies memories whose emotional scores may be stale
 * due to accumulated newer context, and triggers selective re-scoring.
 * Runs as Phase 2 (Reweight) of the REM cycle.
 */

import type { Logger } from '../../utils/logger.js';
import { ALL_SCORING_DIMENSIONS } from '../../database/weaviate/v2-collections.js';
import type { SelectiveReEvaluationService, ReEvaluationContext } from '../reeval/selective-reevaluation.js';
import type { ScoringContextService, CollectionStatsCache } from '../../services/scoring-context.service.js';
import { createCollectionStatsCache } from '../../services/scoring-context.service.js';
import { computeAllComposites } from '../../services/composite-scoring.js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface RemCycleTriggerConfig {
  batch_size: number;
  cost_cap: number;
  cost_per_memory: number;
}

export const DEFAULT_REM_CYCLE_TRIGGER_CONFIG: RemCycleTriggerConfig = {
  batch_size: 20,
  cost_cap: 2.0,
  cost_per_memory: 0.005,
};

export interface RemCycleTriggerResult {
  candidates_found: number;
  memories_reevaluated: number;
  memories_skipped: number;
  dimensions_rescored: number;
  cost_consumed: number;
  stopped_by_cap: boolean;
}

export interface RemCycleTriggerDeps {
  reEvaluationService: SelectiveReEvaluationService;
  scoringContextService: ScoringContextService;
  config?: Partial<RemCycleTriggerConfig>;
  logger?: Logger;
}

// ─── Candidate Selection ──────────────────────────────────────────────────

/**
 * Find memories eligible for re-evaluation in this REM cycle.
 * A memory is eligible if it was scored before the last cycle timestamp
 * and has potential new context (relationships or related memories).
 */
export async function getReEvaluationCandidates(
  collection: any,
  lastCycleTimestamp: string,
  batchSize: number,
): Promise<Array<{ uuid: string; properties: Record<string, any> }>> {
  // Select memories scored before the last cycle
  const filter = collection.filter.byProperty('doc_type').equal('memory')
    .and().byProperty('rem_touched_at').isNull(false);

  const result = await collection.query.fetchObjects({
    filters: filter,
    limit: batchSize,
    sort: collection.sort.byProperty('rem_touched_at', true), // oldest first
  });

  // Filter to memories touched before the last cycle
  return result.objects.filter((obj: any) => {
    const touchedAt = obj.properties?.rem_touched_at;
    return touchedAt && touchedAt < lastCycleTimestamp;
  });
}

// ─── Trigger Execution ───────────────────────────────────────────────────

/**
 * Execute the REM cycle re-evaluation trigger.
 * Identifies stale memories and selectively re-scores impacted dimensions.
 */
export async function runRemCycleTrigger(
  collection: any,
  collectionName: string,
  lastCycleTimestamp: string,
  deps: RemCycleTriggerDeps,
): Promise<RemCycleTriggerResult> {
  const config = { ...DEFAULT_REM_CYCLE_TRIGGER_CONFIG, ...deps.config };
  const logger: Logger = deps.logger ?? (console as any);
  const statsCache = createCollectionStatsCache();

  const result: RemCycleTriggerResult = {
    candidates_found: 0,
    memories_reevaluated: 0,
    memories_skipped: 0,
    dimensions_rescored: 0,
    cost_consumed: 0,
    stopped_by_cap: false,
  };

  // 1. Find candidates
  const candidates = await getReEvaluationCandidates(collection, lastCycleTimestamp, config.batch_size);
  result.candidates_found = candidates.length;

  if (candidates.length === 0) {
    logger.debug?.('[RemCycleTrigger] No candidates for re-evaluation');
    return result;
  }

  logger.info?.(`[RemCycleTrigger] Found ${candidates.length} candidates for re-evaluation`);

  // 2. Get collection averages (cached for this cycle)
  const collectionAverages = await deps.scoringContextService.computeCollectionAverages(
    collection, statsCache, collectionName,
  );

  // 3. Process each candidate
  for (const candidate of candidates) {
    // Check cost cap
    if (result.cost_consumed + config.cost_per_memory > config.cost_cap) {
      logger.info?.(`[RemCycleTrigger] Cost cap reached`);
      result.stopped_by_cap = true;
      break;
    }

    try {
      const content = candidate.properties.content ?? '';
      const contentType = candidate.properties.content_type ?? 'text';
      const createdAt = candidate.properties.created_at ?? '';

      // Gather current scores
      const currentScores: Partial<Record<string, number | null>> = {};
      for (const dim of ALL_SCORING_DIMENSIONS) {
        currentScores[dim] = candidate.properties[dim] ?? null;
      }

      // Get relationship observations for context
      const observations = await deps.scoringContextService.fetchRelationshipObservations(
        collection, candidate.uuid,
      );

      // Build re-evaluation context
      const reEvalContext: ReEvaluationContext = {
        memory: { id: candidate.uuid, content, content_type: contentType, created_at: createdAt },
        currentScores,
        newRelationships: [],
        recentRelatedMemories: [],
        relationshipObservations: observations,
        collectionEmotionalAverages: collectionAverages as Record<string, number>,
        triggerType: 'rem_cycle',
      };

      // Build scoring context for dimension re-scoring
      const scoringContext = {
        relationship_observations: observations,
        nearest_neighbor_scores: {},
        collection_averages: collectionAverages as Record<string, number>,
      };

      // Run selective re-evaluation
      const reEvalResult = await deps.reEvaluationService.reEvaluate(reEvalContext, scoringContext);

      if (reEvalResult.skipped) {
        result.memories_skipped++;
        continue;
      }

      // Build update properties
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
      updateProps.rem_visits = (candidate.properties.rem_visits ?? 0) + 1;

      // Persist
      await collection.data.update({ id: candidate.uuid, properties: updateProps });

      result.memories_reevaluated++;
      result.dimensions_rescored += reEvalResult.dimensionsReScored.length;
      result.cost_consumed += config.cost_per_memory;
    } catch (err) {
      logger.warn?.(`[RemCycleTrigger] Failed to re-evaluate ${candidate.uuid}: ${err}`);
      result.memories_skipped++;
    }
  }

  logger.info?.(`[RemCycleTrigger] Complete: ${result.memories_reevaluated} re-evaluated, ${result.memories_skipped} skipped`);

  return result;
}
