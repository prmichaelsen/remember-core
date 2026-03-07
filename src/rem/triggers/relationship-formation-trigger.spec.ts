import {
  runRelationshipFormationTrigger,
  type RelationshipFormationTriggerDeps,
  type NewRelationship,
} from './relationship-formation-trigger.js';

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

function createMockDeps(overrides?: Partial<RelationshipFormationTriggerDeps>): RelationshipFormationTriggerDeps {
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

const DEFAULT_NEW_RELATIONSHIPS: NewRelationship[] = [
  { observation: 'User enjoys morning runs', relationship_type: 'preference' },
];

// ─── Tests ───────────────────────────────────────────────────────────────

describe('runRelationshipFormationTrigger', () => {
  it('fetches memory from collection by ID', async () => {
    const memory = makeMemoryObject('m1');
    const collection = createMockCollection(memory);
    const deps = createMockDeps();

    await runRelationshipFormationTrigger(collection, 'test-col', 'm1', DEFAULT_NEW_RELATIONSHIPS, deps);

    expect(collection.query.fetchObjectById).toHaveBeenCalledWith('m1');
  });

  it('passes newRelationships and related memories in context', async () => {
    const memory = makeMemoryObject('m1');
    const collection = createMockCollection(memory);
    const deps = createMockDeps();

    await runRelationshipFormationTrigger(collection, 'test-col', 'm1', DEFAULT_NEW_RELATIONSHIPS, deps);

    const reEvalCall = (deps.reEvaluationService.reEvaluate as jest.Mock).mock.calls[0];
    const context = reEvalCall[0];
    expect(context.newRelationships).toEqual(DEFAULT_NEW_RELATIONSHIPS);
    expect(context.recentRelatedMemories).toEqual([]);
  });

  it('sets triggerType to relationship_formation', async () => {
    const memory = makeMemoryObject('m1');
    const collection = createMockCollection(memory);
    const deps = createMockDeps();

    await runRelationshipFormationTrigger(collection, 'test-col', 'm1', DEFAULT_NEW_RELATIONSHIPS, deps);

    const reEvalCall = (deps.reEvaluationService.reEvaluate as jest.Mock).mock.calls[0];
    const context = reEvalCall[0];
    expect(context.triggerType).toBe('relationship_formation');
  });

  it('writes composite scores to update', async () => {
    const memory = makeMemoryObject('m1');
    const collection = createMockCollection(memory);
    const deps = createMockDeps();

    await runRelationshipFormationTrigger(collection, 'test-col', 'm1', DEFAULT_NEW_RELATIONSHIPS, deps);

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.properties.feel_significance).toBe(0.5);
    expect(updateCall.properties.functional_significance).toBe(0.6);
    expect(updateCall.properties.total_significance).toBe(1.1);
  });

  it('updates rem_touched_at and rem_visits', async () => {
    const memory = makeMemoryObject('m1', { rem_visits: 3 });
    const collection = createMockCollection(memory);
    const deps = createMockDeps();

    await runRelationshipFormationTrigger(collection, 'test-col', 'm1', DEFAULT_NEW_RELATIONSHIPS, deps);

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.properties.rem_touched_at).toBeDefined();
    expect(updateCall.properties.rem_visits).toBe(4);
  });

  it('returns skipped with reason when memory not found', async () => {
    const collection = createMockCollection(null);
    const deps = createMockDeps();

    const result = await runRelationshipFormationTrigger(collection, 'test-col', 'm1', DEFAULT_NEW_RELATIONSHIPS, deps);

    expect(result.reevaluated).toBe(false);
    expect(result.skipped_reason).toBe('memory_not_found');
    expect(result.memory_id).toBe('m1');
    expect(collection.data.update).not.toHaveBeenCalled();
  });

  it('returns skipped when re-evaluation returns skipped', async () => {
    const memory = makeMemoryObject('m1');
    const collection = createMockCollection(memory);
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

    const result = await runRelationshipFormationTrigger(collection, 'test-col', 'm1', DEFAULT_NEW_RELATIONSHIPS, deps);

    expect(result.reevaluated).toBe(false);
    expect(result.skipped_reason).toBe('no_impacted_dimensions');
    expect(result.dimensions_rescored).toBe(0);
    expect(collection.data.update).not.toHaveBeenCalled();
  });

  it('handles LLM failure gracefully', async () => {
    const memory = makeMemoryObject('m1');
    const collection = createMockCollection(memory);
    const deps = createMockDeps({
      reEvaluationService: {
        reEvaluate: jest.fn().mockRejectedValue(new Error('LLM provider timeout')),
      } as any,
    });

    const result = await runRelationshipFormationTrigger(collection, 'test-col', 'm1', DEFAULT_NEW_RELATIONSHIPS, deps);

    expect(result.reevaluated).toBe(false);
    expect(result.skipped_reason).toBe('reeval_error');
    expect(result.memory_id).toBe('m1');
    expect(collection.data.update).not.toHaveBeenCalled();
  });

  it('includes relationship observations in re-evaluation context', async () => {
    const memory = makeMemoryObject('m1');
    const collection = createMockCollection(memory);
    const mockObservations = ['User likes coffee', 'Related to morning routine'];
    const deps = createMockDeps({
      scoringContextService: {
        computeCollectionAverages: jest.fn().mockResolvedValue({ feel_happiness: 0.5 }),
        fetchRelationshipObservations: jest.fn().mockResolvedValue(mockObservations),
      } as any,
    });

    await runRelationshipFormationTrigger(collection, 'test-col', 'm1', DEFAULT_NEW_RELATIONSHIPS, deps);

    const reEvalCall = (deps.reEvaluationService.reEvaluate as jest.Mock).mock.calls[0];
    const context = reEvalCall[0];
    expect(context.relationshipObservations).toEqual(mockObservations);
    expect(context.collectionEmotionalAverages).toEqual({ feel_happiness: 0.5 });
  });

  it('writes rescored dimensions to update', async () => {
    const memory = makeMemoryObject('m1');
    const collection = createMockCollection(memory);
    const deps = createMockDeps();

    const result = await runRelationshipFormationTrigger(collection, 'test-col', 'm1', DEFAULT_NEW_RELATIONSHIPS, deps);

    expect(result.reevaluated).toBe(true);
    expect(result.dimensions_rescored).toBe(1);

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.id).toBe('m1');
    expect(updateCall.properties.functional_salience).toBe(0.8);
  });

  it('handles memory fetch error gracefully', async () => {
    const collection = {
      query: {
        fetchObjectById: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      },
      data: {
        update: jest.fn(),
      },
    };
    const deps = createMockDeps();

    const result = await runRelationshipFormationTrigger(collection, 'test-col', 'm1', DEFAULT_NEW_RELATIONSHIPS, deps);

    expect(result.reevaluated).toBe(false);
    expect(result.skipped_reason).toBe('memory_fetch_error');
    expect(collection.data.update).not.toHaveBeenCalled();
  });

  it('defaults rem_visits to 1 when property is missing', async () => {
    const memory = makeMemoryObject('m1', { rem_visits: undefined });
    const collection = createMockCollection(memory);
    const deps = createMockDeps();

    await runRelationshipFormationTrigger(collection, 'test-col', 'm1', DEFAULT_NEW_RELATIONSHIPS, deps);

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.properties.rem_visits).toBe(1);
  });
});
