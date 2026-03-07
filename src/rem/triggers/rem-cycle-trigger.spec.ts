jest.mock('weaviate-client', () => {
  const actual = jest.requireActual('weaviate-client');
  return {
    ...actual,
    Filters: { and: (...args: any[]) => 'mock-combined-filter' },
  };
});

import {
  getReEvaluationCandidates,
  runRemCycleTrigger,
  DEFAULT_REM_CYCLE_TRIGGER_CONFIG,
  type RemCycleTriggerDeps,
} from './rem-cycle-trigger.js';

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

function createMockCollection(objects: any[] = []) {
  return {
    filter: {
      byProperty: (prop: string) => ({
        equal: (val: any) => `mock-filter-${prop}-eq-${val}`,
        isNull: (val: boolean) => `mock-filter-${prop}-isNull-${val}`,
      }),
    },
    sort: {
      byProperty: () => 'mock-sort',
    },
    query: {
      fetchObjects: jest.fn().mockResolvedValue({ objects }),
    },
    data: {
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function createMockDeps(overrides?: Partial<RemCycleTriggerDeps>): RemCycleTriggerDeps {
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

// ─── getReEvaluationCandidates ───────────────────────────────────────────

describe('getReEvaluationCandidates', () => {
  it('returns memories with rem_touched_at before lastCycleTimestamp', async () => {
    const objects = [
      makeMemoryObject('m1', { rem_touched_at: '2026-01-01T00:00:00Z' }),
      makeMemoryObject('m2', { rem_touched_at: '2026-02-01T00:00:00Z' }),
    ];
    const collection = createMockCollection(objects);

    const result = await getReEvaluationCandidates(collection, '2026-03-01T00:00:00Z', 20);
    expect(result).toHaveLength(2);
  });

  it('filters out memories touched after lastCycleTimestamp', async () => {
    const objects = [
      makeMemoryObject('m1', { rem_touched_at: '2026-01-01T00:00:00Z' }),
      makeMemoryObject('m2', { rem_touched_at: '2026-04-01T00:00:00Z' }), // after cycle
    ];
    const collection = createMockCollection(objects);

    const result = await getReEvaluationCandidates(collection, '2026-03-01T00:00:00Z', 20);
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe('m1');
  });

  it('returns empty array when no candidates', async () => {
    const collection = createMockCollection([]);
    const result = await getReEvaluationCandidates(collection, '2026-03-01T00:00:00Z', 20);
    expect(result).toEqual([]);
  });

  it('respects batch size limit', async () => {
    const collection = createMockCollection([]);
    await getReEvaluationCandidates(collection, '2026-03-01T00:00:00Z', 5);
    expect(collection.query.fetchObjects).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 }),
    );
  });
});

// ─── runRemCycleTrigger ──────────────────────────────────────────────────

describe('runRemCycleTrigger', () => {
  it('returns zero counts when no candidates found', async () => {
    const collection = createMockCollection([]);
    const deps = createMockDeps();

    const result = await runRemCycleTrigger(collection, 'test-col', '2026-03-01T00:00:00Z', deps);
    expect(result.candidates_found).toBe(0);
    expect(result.memories_reevaluated).toBe(0);
    expect(result.stopped_by_cap).toBe(false);
  });

  it('re-evaluates eligible candidates and updates properties', async () => {
    const objects = [makeMemoryObject('m1', { rem_touched_at: '2026-01-01T00:00:00Z' })];
    const collection = createMockCollection(objects);
    const deps = createMockDeps();

    const result = await runRemCycleTrigger(collection, 'test-col', '2026-03-01T00:00:00Z', deps);
    expect(result.candidates_found).toBe(1);
    expect(result.memories_reevaluated).toBe(1);
    expect(collection.data.update).toHaveBeenCalledTimes(1);

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.id).toBe('m1');
    expect(updateCall.properties.functional_salience).toBe(0.8);
    expect(updateCall.properties.rem_visits).toBe(2);
    expect(updateCall.properties.rem_touched_at).toBeDefined();
  });

  it('writes composite scores to update', async () => {
    const objects = [makeMemoryObject('m1', { rem_touched_at: '2026-01-01T00:00:00Z' })];
    const collection = createMockCollection(objects);
    const deps = createMockDeps();

    await runRemCycleTrigger(collection, 'test-col', '2026-03-01T00:00:00Z', deps);

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.properties.feel_significance).toBe(0.5);
    expect(updateCall.properties.functional_significance).toBe(0.6);
    expect(updateCall.properties.total_significance).toBe(1.1);
  });

  it('skips memories when re-evaluation says skipped', async () => {
    const objects = [makeMemoryObject('m1', { rem_touched_at: '2026-01-01T00:00:00Z' })];
    const collection = createMockCollection(objects);
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

    const result = await runRemCycleTrigger(collection, 'test-col', '2026-03-01T00:00:00Z', deps);
    expect(result.memories_skipped).toBe(1);
    expect(result.memories_reevaluated).toBe(0);
    expect(collection.data.update).not.toHaveBeenCalled();
  });

  it('stops when cost cap is reached', async () => {
    const objects = Array.from({ length: 10 }, (_, i) =>
      makeMemoryObject(`m${i}`, { rem_touched_at: '2026-01-01T00:00:00Z' }),
    );
    const collection = createMockCollection(objects);
    const deps = createMockDeps({
      config: { cost_cap: 0.01, cost_per_memory: 0.005 },
    });

    const result = await runRemCycleTrigger(collection, 'test-col', '2026-03-01T00:00:00Z', deps);
    expect(result.stopped_by_cap).toBe(true);
    expect(result.memories_reevaluated).toBe(2);
  });

  it('assembles correct re-evaluation context with relationship observations', async () => {
    const objects = [makeMemoryObject('m1', { rem_touched_at: '2026-01-01T00:00:00Z' })];
    const collection = createMockCollection(objects);
    const mockObservations = ['User likes coffee', 'Related to morning routine'];
    const deps = createMockDeps({
      scoringContextService: {
        computeCollectionAverages: jest.fn().mockResolvedValue({ feel_happiness: 0.5 }),
        fetchRelationshipObservations: jest.fn().mockResolvedValue(mockObservations),
      } as any,
    });

    await runRemCycleTrigger(collection, 'test-col', '2026-03-01T00:00:00Z', deps);

    const reEvalCall = (deps.reEvaluationService.reEvaluate as jest.Mock).mock.calls[0];
    const context = reEvalCall[0];
    expect(context.triggerType).toBe('rem_cycle');
    expect(context.memory.id).toBe('m1');
    expect(context.relationshipObservations).toEqual(mockObservations);
    expect(context.collectionEmotionalAverages).toEqual({ feel_happiness: 0.5 });
  });

  it('handles errors in individual memories gracefully', async () => {
    const objects = [
      makeMemoryObject('m1', { rem_touched_at: '2026-01-01T00:00:00Z' }),
      makeMemoryObject('m2', { rem_touched_at: '2026-01-01T00:00:00Z' }),
    ];
    const collection = createMockCollection(objects);
    const reEvaluateMock = jest.fn()
      .mockRejectedValueOnce(new Error('LLM error'))
      .mockResolvedValueOnce({
        skipped: false,
        dimensionsAnalyzed: ['feel_happiness'],
        dimensionsReScored: ['feel_happiness'],
        mergedScores: { feel_happiness: 0.9 },
        composites: { feel_significance: 0.5, functional_significance: 0.4, total_significance: 0.9 },
      });
    const deps = createMockDeps({
      reEvaluationService: { reEvaluate: reEvaluateMock } as any,
    });

    const result = await runRemCycleTrigger(collection, 'test-col', '2026-03-01T00:00:00Z', deps);
    expect(result.memories_skipped).toBe(1);
    expect(result.memories_reevaluated).toBe(1);
  });

  it('increments rem_visits from existing value', async () => {
    const objects = [makeMemoryObject('m1', { rem_touched_at: '2026-01-01T00:00:00Z', rem_visits: 5 })];
    const collection = createMockCollection(objects);
    const deps = createMockDeps();

    await runRemCycleTrigger(collection, 'test-col', '2026-03-01T00:00:00Z', deps);

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.properties.rem_visits).toBe(6);
  });

  it('tracks dimensions_rescored count across all memories', async () => {
    const objects = [
      makeMemoryObject('m1', { rem_touched_at: '2026-01-01T00:00:00Z' }),
      makeMemoryObject('m2', { rem_touched_at: '2026-01-01T00:00:00Z' }),
    ];
    const collection = createMockCollection(objects);
    const deps = createMockDeps({
      reEvaluationService: {
        reEvaluate: jest.fn().mockResolvedValue({
          skipped: false,
          dimensionsAnalyzed: ['feel_happiness', 'feel_sadness'],
          dimensionsReScored: ['feel_happiness', 'feel_sadness'],
          mergedScores: {},
          composites: { feel_significance: 0.5, functional_significance: 0.4, total_significance: 0.9 },
        }),
      } as any,
    });

    const result = await runRemCycleTrigger(collection, 'test-col', '2026-03-01T00:00:00Z', deps);
    expect(result.dimensions_rescored).toBe(4); // 2 dims x 2 memories
  });
});
