import {
  SelectiveReEvaluationService,
  mergeScores,
  type ReEvaluationContext,
} from './selective-reevaluation.js';
import { ALL_SCORING_DIMENSIONS } from '../../database/weaviate/v2-collections.js';
import type { SubLlmProvider } from '../../services/emotional-scoring.service.js';
import type { EmotionalScoringService } from '../../services/emotional-scoring.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function createMockSubLlm(response: string): SubLlmProvider & { score: jest.Mock } {
  return { score: jest.fn().mockResolvedValue(response) };
}

function createMockEmotionalScoring(defaultScore = 0.7): EmotionalScoringService & { scoreDimension: jest.Mock } {
  return {
    scoreDimension: jest.fn().mockImplementation(({ dimension }: any) => ({
      property: dimension.property,
      score: defaultScore,
    })),
    scoreAllDimensions: jest.fn(),
    getDimension: jest.fn(),
  } as any;
}

function createMockLogger() {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function makeContext(overrides?: Partial<ReEvaluationContext>): ReEvaluationContext {
  const baseScores: Partial<Record<string, number | null>> = {};
  for (const dim of ALL_SCORING_DIMENSIONS) {
    baseScores[dim] = 0.3;
  }

  return {
    memory: { id: 'm1', content: 'Met Alex at coffee shop', content_type: 'text', created_at: '2026-03-01T00:00:00Z' },
    currentScores: baseScores,
    newRelationships: [],
    recentRelatedMemories: [],
    relationshipObservations: [],
    collectionEmotionalAverages: {},
    triggerType: 'rem_cycle',
    ...overrides,
  };
}

// ─── mergeScores ──────────────────────────────────────────────────────────

describe('mergeScores', () => {
  it('merges partial new scores into existing', () => {
    const existing: Partial<Record<string, number | null>> = {};
    for (const dim of ALL_SCORING_DIMENSIONS) existing[dim] = 0.3;

    const merged = mergeScores(existing, { functional_salience: 0.7, feel_happiness: 0.9 });
    expect(merged.functional_salience).toBe(0.7);
    expect(merged.feel_happiness).toBe(0.9);
    expect(merged.feel_sadness).toBe(0.3);
  });

  it('preserves null values for non-re-scored dimensions', () => {
    const existing: Partial<Record<string, number | null>> = {};
    for (const dim of ALL_SCORING_DIMENSIONS) existing[dim] = null;
    existing.feel_happiness = 0.5;

    const merged = mergeScores(existing, { feel_sadness: 0.6 });
    expect(merged.feel_happiness).toBe(0.5);
    expect(merged.feel_sadness).toBe(0.6);
    expect(merged.feel_anger).toBeNull();
  });

  it('handles empty partial (no new scores)', () => {
    const existing: Partial<Record<string, number | null>> = {};
    for (const dim of ALL_SCORING_DIMENSIONS) existing[dim] = 0.4;

    const merged = mergeScores(existing, {});
    for (const dim of ALL_SCORING_DIMENSIONS) expect(merged[dim]).toBe(0.4);
  });

  it('returns all 31 dimensions', () => {
    const merged = mergeScores({}, { feel_happiness: 0.5 });
    expect(Object.keys(merged)).toHaveLength(31);
  });

  it('sets missing existing dimensions to null', () => {
    const merged = mergeScores({}, {});
    for (const dim of ALL_SCORING_DIMENSIONS) expect(merged[dim]).toBeNull();
  });
});

// ─── analyzeImpactedDimensions ────────────────────────────────────────────

describe('analyzeImpactedDimensions', () => {
  it('returns valid dimension names from sub-LLM response', async () => {
    const subLlm = createMockSubLlm('["functional_salience", "functional_narrative_importance"]');
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: createMockEmotionalScoring(),
      logger: createMockLogger(),
    });

    const result = await service.analyzeImpactedDimensions(makeContext());
    expect(result).toEqual(['functional_salience', 'functional_narrative_importance']);
  });

  it('filters out invalid dimension names with warning', async () => {
    const subLlm = createMockSubLlm('["functional_salience", "invalid_dim", "feel_happiness"]');
    const logger = createMockLogger();
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: createMockEmotionalScoring(),
      logger,
    });

    const result = await service.analyzeImpactedDimensions(makeContext());
    expect(result).toEqual(['functional_salience', 'feel_happiness']);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns empty array on malformed JSON', async () => {
    const subLlm = createMockSubLlm('not valid json');
    const logger = createMockLogger();
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: createMockEmotionalScoring(),
      logger,
    });

    const result = await service.analyzeImpactedDimensions(makeContext());
    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns empty array when sub-LLM returns []', async () => {
    const subLlm = createMockSubLlm('[]');
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: createMockEmotionalScoring(),
      logger: createMockLogger(),
    });

    const result = await service.analyzeImpactedDimensions(makeContext());
    expect(result).toEqual([]);
  });

  it('returns empty array when sub-LLM throws', async () => {
    const subLlm = createMockSubLlm('');
    subLlm.score.mockRejectedValue(new Error('api error'));
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: createMockEmotionalScoring(),
      logger: createMockLogger(),
    });

    const result = await service.analyzeImpactedDimensions(makeContext());
    expect(result).toEqual([]);
  });

  it('returns empty array when sub-LLM returns non-array', async () => {
    const subLlm = createMockSubLlm('"functional_salience"');
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: createMockEmotionalScoring(),
      logger: createMockLogger(),
    });

    const result = await service.analyzeImpactedDimensions(makeContext());
    expect(result).toEqual([]);
  });
});

// ─── reEvaluate (full pipeline) ──────────────────────────────────────────

describe('reEvaluate', () => {
  it('skips re-scoring when no dimensions impacted', async () => {
    const subLlm = createMockSubLlm('[]');
    const emotionalScoring = createMockEmotionalScoring();
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: emotionalScoring,
      logger: createMockLogger(),
    });

    const result = await service.reEvaluate(makeContext(), {});
    expect(result.skipped).toBe(true);
    expect(result.dimensionsReScored).toEqual([]);
    expect(emotionalScoring.scoreDimension).not.toHaveBeenCalled();
  });

  it('re-scores only impacted dimensions (not all 31)', async () => {
    const subLlm = createMockSubLlm('["functional_salience", "functional_narrative_importance"]');
    const emotionalScoring = createMockEmotionalScoring(0.8);
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: emotionalScoring,
      logger: createMockLogger(),
    });

    const result = await service.reEvaluate(makeContext(), {});
    expect(result.skipped).toBe(false);
    expect(result.dimensionsAnalyzed).toEqual(['functional_salience', 'functional_narrative_importance']);
    expect(emotionalScoring.scoreDimension).toHaveBeenCalledTimes(2);
  });

  it('merges new scores with existing and preserves unchanged', async () => {
    const subLlm = createMockSubLlm('["functional_salience"]');
    const emotionalScoring = createMockEmotionalScoring(0.9);
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: emotionalScoring,
      logger: createMockLogger(),
    });

    const result = await service.reEvaluate(makeContext(), {});
    expect(result.mergedScores.functional_salience).toBe(0.9);
    expect(result.mergedScores.feel_happiness).toBe(0.3); // preserved
  });

  it('recomputes composites after partial re-scoring', async () => {
    const subLlm = createMockSubLlm('["feel_happiness"]');
    const emotionalScoring = createMockEmotionalScoring(0.9);
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: emotionalScoring,
      logger: createMockLogger(),
    });

    const result = await service.reEvaluate(makeContext(), {});
    expect(result.composites.feel_significance).not.toBeNull();
    expect(result.composites.functional_significance).not.toBeNull();
    expect(result.composites.total_significance).not.toBeNull();
  });

  it('total LLM calls = 1 (impact) + N (re-scored)', async () => {
    const subLlm = createMockSubLlm('["functional_salience", "feel_fear", "feel_anger"]');
    const emotionalScoring = createMockEmotionalScoring(0.6);
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: emotionalScoring,
      logger: createMockLogger(),
    });

    await service.reEvaluate(makeContext(), {});
    expect(subLlm.score).toHaveBeenCalledTimes(1);
    expect(emotionalScoring.scoreDimension).toHaveBeenCalledTimes(3);
  });

  it('works with relationship_formation trigger', async () => {
    const subLlm = createMockSubLlm('["feel_emotional_significance", "feel_sadness"]');
    const emotionalScoring = createMockEmotionalScoring(0.8);
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: emotionalScoring,
      logger: createMockLogger(),
    });

    const context = makeContext({
      triggerType: 'relationship_formation',
      newRelationships: [{ observation: 'Family cooking memories', relationship_type: 'thematic' }],
      recentRelatedMemories: [{ content: 'Cooking with family on holidays' }],
    });

    const result = await service.reEvaluate(context, {});
    expect(result.skipped).toBe(false);
    expect(result.dimensionsReScored).toHaveLength(2);
  });

  it('works with retrieval_threshold trigger', async () => {
    const subLlm = createMockSubLlm('["functional_urgency", "functional_retrieval_utility"]');
    const emotionalScoring = createMockEmotionalScoring(0.9);
    const service = new SelectiveReEvaluationService({
      subLlm,
      emotionalScoringService: emotionalScoring,
      logger: createMockLogger(),
    });

    const context = makeContext({
      triggerType: 'retrieval_threshold',
      retrievalMetadata: { retrievalCount: 8, thresholdCrossed: 5, retrievalFrequency: 1.14, recentRetrievals: 8 },
    });

    const result = await service.reEvaluate(context, {});
    expect(result.skipped).toBe(false);
    expect(result.dimensionsReScored).toHaveLength(2);
  });
});
