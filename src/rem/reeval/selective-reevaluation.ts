/**
 * Selective re-evaluation engine.
 *
 * Core re-evaluation pipeline used by all three triggers (rem_cycle,
 * relationship_formation, retrieval_threshold). Uses a sub-LLM call
 * to determine which dimensions are impacted, then re-scores only those.
 */

import type { Logger } from '../../utils/logger.js';
import { ALL_SCORING_DIMENSIONS } from '../../database/weaviate/v2-collections.js';
import type { EmotionalScoringService, ScoringContext } from '../../services/emotional-scoring.service.js';
import { DIMENSION_REGISTRY } from '../../services/emotional-scoring.service.js';
import { computeAllComposites } from '../../services/composite-scoring.js';
import { buildDimensionImpactPrompt } from './dimension-impact-prompt.js';
import type { SubLlmProvider } from '../../services/emotional-scoring.service.js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface ReEvaluationContext {
  memory: { id: string; content: string; content_type: string; created_at: string };
  currentScores: Partial<Record<string, number | null>>;
  newRelationships: Array<{ observation?: string; relationship_type?: string }>;
  recentRelatedMemories: Array<{ content: string }>;
  relationshipObservations: string[];
  collectionEmotionalAverages: Record<string, number>;
  triggerType: 'rem_cycle' | 'relationship_formation' | 'retrieval_threshold';
  retrievalMetadata?: {
    retrievalCount: number;
    thresholdCrossed: number;
    retrievalFrequency: number;
    recentRetrievals: number;
  };
}

export interface ReEvaluationResult {
  dimensionsAnalyzed: string[];
  dimensionsReScored: string[];
  mergedScores: Record<string, number | null>;
  composites: {
    feel_significance: number | null;
    functional_significance: number | null;
    total_significance: number | null;
  };
  skipped: boolean;
}

export interface SelectiveReEvaluationServiceParams {
  subLlm: SubLlmProvider;
  emotionalScoringService: EmotionalScoringService;
  logger?: Logger;
}

// ─── Valid Dimensions Set ─────────────────────────────────────────────────

const VALID_DIMENSIONS = new Set<string>(ALL_SCORING_DIMENSIONS);

// ─── Service ──────────────────────────────────────────────────────────────

export class SelectiveReEvaluationService {
  private readonly subLlm: SubLlmProvider;
  private readonly emotionalScoringService: EmotionalScoringService;
  private readonly logger: Logger;

  constructor(params: SelectiveReEvaluationServiceParams) {
    this.subLlm = params.subLlm;
    this.emotionalScoringService = params.emotionalScoringService;
    this.logger = params.logger ?? (console as any);
  }

  /**
   * Analyze which dimensions are impacted by new context.
   * Returns array of valid dimension property names.
   */
  async analyzeImpactedDimensions(context: ReEvaluationContext): Promise<string[]> {
    try {
      const prompt = buildDimensionImpactPrompt(
        context.memory.content,
        context.currentScores,
        context,
      );

      const response = await this.subLlm.score(prompt);
      const parsed = JSON.parse(response.trim());

      if (!Array.isArray(parsed)) {
        this.logger.warn?.('[SelectiveReEval] Sub-LLM returned non-array response');
        return [];
      }

      const valid: string[] = [];
      for (const dim of parsed) {
        if (typeof dim === 'string' && VALID_DIMENSIONS.has(dim)) {
          valid.push(dim);
        } else {
          this.logger.warn?.(`[SelectiveReEval] Invalid dimension name: "${dim}"`);
        }
      }

      return valid;
    } catch (err) {
      this.logger.warn?.(`[SelectiveReEval] Failed to analyze impacted dimensions: ${err}`);
      return [];
    }
  }

  /**
   * Re-score only the specified dimensions for a memory.
   */
  async reScoreDimensions(
    memory: { content: string; content_type: string; created_at: string },
    dimensions: string[],
    scoringContext: ScoringContext,
  ): Promise<Partial<Record<string, number>>> {
    const newScores: Partial<Record<string, number>> = {};

    for (const dimName of dimensions) {
      const definition = DIMENSION_REGISTRY.find((d) => d.property === dimName);
      if (!definition) continue;

      const result = await this.emotionalScoringService.scoreDimension({
        memory,
        dimension: definition,
        context: scoringContext,
      });

      if (result.score !== null) {
        newScores[dimName] = result.score;
      }
    }

    return newScores;
  }

  /**
   * Full re-evaluation pipeline:
   * 1. Analyze impacted dimensions
   * 2. Re-score impacted dimensions
   * 3. Merge with existing scores
   * 4. Recompute composites
   */
  async reEvaluate(
    context: ReEvaluationContext,
    scoringContext: ScoringContext,
  ): Promise<ReEvaluationResult> {
    // 1. Determine impacted dimensions
    const impacted = await this.analyzeImpactedDimensions(context);

    if (impacted.length === 0) {
      return {
        dimensionsAnalyzed: [],
        dimensionsReScored: [],
        mergedScores: context.currentScores as Record<string, number | null>,
        composites: computeAllComposites(context.currentScores),
        skipped: true,
      };
    }

    // 2. Re-score only impacted dimensions
    const newPartialScores = await this.reScoreDimensions(
      context.memory,
      impacted,
      scoringContext,
    );

    // 3. Merge scores
    const merged = mergeScores(context.currentScores, newPartialScores);

    // 4. Recompute composites
    const composites = computeAllComposites(merged);

    return {
      dimensionsAnalyzed: impacted,
      dimensionsReScored: Object.keys(newPartialScores),
      mergedScores: merged,
      composites,
      skipped: false,
    };
  }
}

// ─── Score Merging ────────────────────────────────────────────────────────

/**
 * Merge new partial scores into existing scores.
 * New values overwrite existing; non-re-scored dimensions preserved.
 */
export function mergeScores(
  existing: Partial<Record<string, number | null>>,
  partial: Partial<Record<string, number>>,
): Record<string, number | null> {
  const result: Record<string, number | null> = {};

  for (const dim of ALL_SCORING_DIMENSIONS) {
    result[dim] = existing[dim] ?? null;
  }

  for (const [dim, score] of Object.entries(partial)) {
    if (VALID_DIMENSIONS.has(dim) && score !== undefined) {
      result[dim] = score;
    }
  }

  return result;
}
