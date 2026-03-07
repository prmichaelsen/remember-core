import {
  runRetrievalThresholdTrigger,
  type RetrievalThresholdTriggerDeps,
  type RetrievalMetadata,
} from './retrieval-threshold-trigger.js';

// ─── Mock Helpers ────────────────────────────────────────────────────────

function makeMemoryObject(id: string, overrides: Record<string, any> = {}) {
  return {
    uuid: id,
    properties: {
      doc_type: 'memory',
      content: `Memory ${id}`,
      content_type: 'text',
      created_at: '2026-01-01T00:00:00Z',
      rem_touched_at: '2026-01-01T00:00:00Z',
      rem_visits: 1,
      ...overrides,
    },
  };
}

function createMockCollection(memoryObj: any | null = null) {
  return {
    query: {
      fetchObjectById: jest.fn().mockResolvedValue(memoryObj),
    },
    data: {
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function createMockDeps(overrides?: Partial<RetrievalThresholdTriggerDeps>): RetrievalThresholdTriggerDeps {
  return {
    reEvaluationService: {
      analyzeImpactedDimensions: jest.fn(),
      reScoreDimensions: jest.fn(),
      reEvaluate: jest.fn().mockResolvedValue({
        skipped: false,
        dimensionsAnalyzed: ['functional_salience'],
        dimensionsReScored: ['functional_salience'],
        mergedScores: { functional_salience: 0.8 },
        composites: {
          feel_significance: 0.5,
          functional_significance: 0.6,
          total_significance: 1.1,
        },
      }),
    } as any,
    scoringContextService: {
      computeCollectionAverages: jest.fn().mockResolvedValue({}),
      fetchRelationshipObservations: jest.fn().mockResolvedValue([]),
      fetchNearestNeighborScores: jest.fn(),
      gatherScoringContext: jest.fn(),
    } as any,
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ...overrides,
  };
}

const DEFAULT_RETRIEVAL_METADATA: RetrievalMetadata = {
  retrievalCount: 10,
  thresholdCrossed: 10,
  retrievalFrequency: 2.5,
  recentRetrievals: 3,
};

// ─── runRetrievalThresholdTrigger ────────────────────────────────────────

describe('runRetrievalThresholdTrigger', () => {
  it('fetches memory from collection by ID', async () => {
    const memObj = makeMemoryObject('m1');
    const collection = createMockCollection(memObj);
    const deps = createMockDeps();

    await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    expect(collection.query.fetchObjectById).toHaveBeenCalledWith('m1');
  });

  it('passes retrievalMetadata in re-evaluation context', async () => {
    const memObj = makeMemoryObject('m1');
    const collection = createMockCollection(memObj);
    const deps = createMockDeps();

    await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    const reEvalCall = (deps.reEvaluationService.reEvaluate as jest.Mock).mock.calls[0];
    const context = reEvalCall[0];
    expect(context.retrievalMetadata).toEqual(DEFAULT_RETRIEVAL_METADATA);
  });

  it('sets triggerType to retrieval_threshold', async () => {
    const memObj = makeMemoryObject('m1');
    const collection = createMockCollection(memObj);
    const deps = createMockDeps();

    await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    const reEvalCall = (deps.reEvaluationService.reEvaluate as jest.Mock).mock.calls[0];
    const context = reEvalCall[0];
    expect(context.triggerType).toBe('retrieval_threshold');
  });

  it('writes composite scores to update', async () => {
    const memObj = makeMemoryObject('m1');
    const collection = createMockCollection(memObj);
    const deps = createMockDeps();

    await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.properties.feel_significance).toBe(0.5);
    expect(updateCall.properties.functional_significance).toBe(0.6);
    expect(updateCall.properties.total_significance).toBe(1.1);
  });

  it('updates rem_touched_at and rem_visits', async () => {
    const memObj = makeMemoryObject('m1', { rem_visits: 3 });
    const collection = createMockCollection(memObj);
    const deps = createMockDeps();

    await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.properties.rem_touched_at).toBeDefined();
    expect(updateCall.properties.rem_visits).toBe(4);
  });

  it('returns skipped with reason when memory not found', async () => {
    const collection = createMockCollection(null);
    const deps = createMockDeps();

    const result = await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    expect(result.reevaluated).toBe(false);
    expect(result.skipped_reason).toBe('memory_not_found');
    expect(result.memory_id).toBe('m1');
    expect(collection.data.update).not.toHaveBeenCalled();
  });

  it('returns skipped when re-evaluation returns skipped', async () => {
    const memObj = makeMemoryObject('m1');
    const collection = createMockCollection(memObj);
    const deps = createMockDeps({
      reEvaluationService: {
        reEvaluate: jest.fn().mockResolvedValue({
          skipped: true,
          dimensionsAnalyzed: [],
          dimensionsReScored: [],
          mergedScores: {},
          composites: { feel_significance: null, functional_significance: null, total_significance: null },
        }),
      } as any,
    });

    const result = await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    expect(result.reevaluated).toBe(false);
    expect(result.skipped_reason).toBe('no_dimensions_impacted');
    expect(result.dimensions_rescored).toBe(0);
    expect(collection.data.update).not.toHaveBeenCalled();
  });

  it('handles errors during re-evaluation gracefully', async () => {
    const memObj = makeMemoryObject('m1');
    const collection = createMockCollection(memObj);
    const deps = createMockDeps({
      reEvaluationService: {
        reEvaluate: jest.fn().mockRejectedValue(new Error('LLM error')),
      } as any,
    });

    const result = await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    expect(result.reevaluated).toBe(false);
    expect(result.skipped_reason).toContain('reevaluation_error');
    expect(result.memory_id).toBe('m1');
  });

  it('handles errors during memory fetch gracefully', async () => {
    const collection = {
      query: {
        fetchObjectById: jest.fn().mockRejectedValue(new Error('DB connection error')),
      },
      data: {
        update: jest.fn(),
      },
    };
    const deps = createMockDeps();

    const result = await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    expect(result.reevaluated).toBe(false);
    expect(result.skipped_reason).toContain('fetch_error');
  });

  it('returns correct dimensions_rescored count on success', async () => {
    const memObj = makeMemoryObject('m1');
    const collection = createMockCollection(memObj);
    const deps = createMockDeps({
      reEvaluationService: {
        reEvaluate: jest.fn().mockResolvedValue({
          skipped: false,
          dimensionsAnalyzed: ['feel_happiness', 'feel_sadness', 'functional_salience'],
          dimensionsReScored: ['feel_happiness', 'feel_sadness', 'functional_salience'],
          mergedScores: { feel_happiness: 0.7, feel_sadness: 0.2, functional_salience: 0.8 },
          composites: { feel_significance: 0.5, functional_significance: 0.6, total_significance: 1.1 },
        }),
      } as any,
    });

    const result = await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    expect(result.reevaluated).toBe(true);
    expect(result.dimensions_rescored).toBe(3);
  });

  it('gathers relationship observations for context', async () => {
    const memObj = makeMemoryObject('m1');
    const collection = createMockCollection(memObj);
    const mockObservations = ['User likes coffee', 'Related to morning routine'];
    const deps = createMockDeps({
      scoringContextService: {
        computeCollectionAverages: jest.fn().mockResolvedValue({ feel_happiness: 0.5 }),
        fetchRelationshipObservations: jest.fn().mockResolvedValue(mockObservations),
      } as any,
    });

    await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    const reEvalCall = (deps.reEvaluationService.reEvaluate as jest.Mock).mock.calls[0];
    const context = reEvalCall[0];
    expect(context.relationshipObservations).toEqual(mockObservations);
    expect(context.collectionEmotionalAverages).toEqual({ feel_happiness: 0.5 });
  });

  it('writes rescored dimension values to update', async () => {
    const memObj = makeMemoryObject('m1');
    const collection = createMockCollection(memObj);
    const deps = createMockDeps();

    await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.id).toBe('m1');
    expect(updateCall.properties.functional_salience).toBe(0.8);
  });

  it('defaults rem_visits to 1 when not previously set', async () => {
    const memObj = makeMemoryObject('m1', { rem_visits: undefined });
    // Set rem_visits to undefined to simulate unset
    (memObj.properties as any).rem_visits = undefined;
    const collection = createMockCollection(memObj);
    const deps = createMockDeps();

    await runRetrievalThresholdTrigger(collection, 'test-col', 'm1', DEFAULT_RETRIEVAL_METADATA, deps);

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.properties.rem_visits).toBe(1);
  });
});
