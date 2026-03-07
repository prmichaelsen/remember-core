import { createMockWeaviateClient, createMockLogger } from '../testing/weaviate-mock.js';
import { RelationshipService } from './relationship.service.js';
import { RemService } from './rem.service.js';
import { RemStateStore } from './rem.state.js';
import { createMockHaikuClient } from './rem.haiku.js';
import { EmotionalScoringService } from './emotional-scoring.service.js';
import { ScoringContextService } from './scoring-context.service.js';

// Mock Firestore for RemStateStore + collection registry
jest.mock('../database/firestore/init.js', () => {
  const store = new Map<string, any>();
  return {
    getDocument: jest.fn(async (collectionPath: string, docId: string) => {
      return store.get(`${collectionPath}/${docId}`) ?? null;
    }),
    setDocument: jest.fn(async (collectionPath: string, docId: string, data: any) => {
      store.set(`${collectionPath}/${docId}`, data);
    }),
    deleteDocument: jest.fn(async (collectionPath: string, docId: string) => {
      store.delete(`${collectionPath}/${docId}`);
    }),
    queryDocuments: jest.fn(async (collectionPath: string, options: any) => {
      const entries = Array.from(store.entries())
        .filter(([key]) => key.startsWith(collectionPath + '/'))
        .map(([key, data]) => ({
          id: key.split('/').pop()!,
          data,
        }));

      entries.sort((a: any, b: any) =>
        ((a.data.collection_name as string) ?? a.id).localeCompare(
          (b.data.collection_name as string) ?? b.id,
        ),
      );

      let filtered = entries;
      if (options?.startAfter?.length) {
        const cursor = options.startAfter[0];
        const idx = filtered.findIndex(
          (e: any) => ((e.data.collection_name as string) ?? e.id) > cursor,
        );
        filtered = idx >= 0 ? filtered.slice(idx) : [];
      }

      if (options?.limit) {
        filtered = filtered.slice(0, options.limit);
      }

      return filtered;
    }),
    __store: store,
  };
});

function createMockSubLlm(score = 0.5) {
  // Build a batch JSON response with all 31 dimensions set to the given score
  const { DIMENSION_REGISTRY } = require('./emotional-scoring.service.js');
  const batchResponse: Record<string, number> = {};
  for (const dim of (DIMENSION_REGISTRY as Array<{ property: string }>)) {
    batchResponse[dim.property] = score;
  }
  return {
    score: jest.fn().mockResolvedValue(JSON.stringify(batchResponse)),
  };
}

describe('RemService Phase 0 Scoring', () => {
  let mockClient: ReturnType<typeof createMockWeaviateClient>;
  let logger: ReturnType<typeof createMockLogger>;
  let stateStore: RemStateStore;
  let emotionalScoringService: EmotionalScoringService;
  let scoringContextService: ScoringContextService;
  const userId = 'test-user';
  const collectionName = 'Memory_users_phase0test';

  function createRelationshipService(collection: any, uid: string) {
    return new RelationshipService(collection, uid, logger);
  }

  function registerInRegistry(name: string) {
    const { __store } = require('../database/firestore/init.js');
    const { getCollectionRegistryPath } = require('../database/firestore/paths.js');
    const registryPath = getCollectionRegistryPath();
    __store.set(`${registryPath}/${name}`, {
      collection_name: name,
      collection_type: 'users',
      owner_id: null,
      created_at: new Date().toISOString(),
    });
  }

  async function insertMemories(name: string, count: number, scored = false) {
    const collection = mockClient.collections.get(name);
    registerInRegistry(name);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const props: Record<string, any> = {
        user_id: userId,
        doc_type: 'memory',
        content: `memory ${i} content about topic ${i}`,
        content_type: 'note',
        created_at: new Date(2026, 0, i + 1).toISOString(),
        tags: ['auto'],
        deleted_at: null,
        relationship_ids: [],
        rem_touched_at: scored ? new Date(2026, 0, i + 1).toISOString() : null,
        rem_visits: scored ? 1 : 0,
      };

      if (scored) {
        props.total_significance = 0.5;
      }

      const id = await collection.data.insert({ properties: props });
      ids.push(id);
    }
    return ids;
  }

  function createService(configOverrides?: Record<string, any>) {
    return new RemService({
      weaviateClient: mockClient as any,
      relationshipServiceFactory: createRelationshipService,
      stateStore,
      haikuClient: createMockHaikuClient(),
      emotionalScoringService,
      scoringContextService,
      config: {
        min_collection_size: 10,
        scoring_batch_size: 5,
        scoring_cost_cap: 5.0,
        scoring_cost_per_memory: 0.0015,
        ...configOverrides,
      },
      logger,
    });
  }

  beforeEach(() => {
    mockClient = createMockWeaviateClient();
    logger = createMockLogger();
    stateStore = new RemStateStore();

    const subLlm = createMockSubLlm(0.5);
    emotionalScoringService = new EmotionalScoringService({ subLlm, logger });
    scoringContextService = new ScoringContextService({ logger });

    const { __store } = require('../database/firestore/init.js');
    __store.clear();
  });

  it('runs Phase 0 before relationship discovery', async () => {
    await insertMemories(collectionName, 15);

    const service = createService();
    const result = await service.runCycle({ collectionId: collectionName });

    expect(result.phase0).toBeDefined();
    expect(result.phase0!.memories_scored).toBeGreaterThan(0);
  });

  it('selects unscored memories (null rem_touched_at) before outdated ones', async () => {
    // Insert 10 scored + 5 unscored = 15 total (above min_collection_size of 10)
    await insertMemories(collectionName, 10, true);
    await insertMemories(collectionName, 5, false);

    const service = createService({ scoring_batch_size: 3 });
    const result = await service.runCycle({ collectionId: collectionName });

    // Should score the 3 unscored memories first
    expect(result.phase0).toBeDefined();
    expect(result.phase0!.memories_scored).toBe(3);
  });

  it('limits batch to scoring_batch_size', async () => {
    await insertMemories(collectionName, 20);

    const service = createService({ scoring_batch_size: 3 });
    const result = await service.runCycle({ collectionId: collectionName });

    expect(result.phase0).toBeDefined();
    expect(result.phase0!.memories_scored).toBeLessThanOrEqual(3);
  });

  it('stops processing when cost cap is reached', async () => {
    await insertMemories(collectionName, 20);

    // cost_per_memory=1.0, cost_cap=2.5 → should score exactly 2
    const service = createService({
      scoring_batch_size: 10,
      scoring_cost_per_memory: 1.0,
      scoring_cost_cap: 2.5,
    });

    const result = await service.runCycle({ collectionId: collectionName });

    expect(result.phase0).toBeDefined();
    expect(result.phase0!.memories_scored).toBe(2);
    expect(result.phase0!.stopped_by_cost_cap).toBe(true);
    expect(result.phase0!.cost_consumed).toBeCloseTo(2.0);
  });

  it('scores all 31 dimensions per memory via batch call', async () => {
    await insertMemories(collectionName, 12);

    const subLlm = createMockSubLlm(0.7);
    emotionalScoringService = new EmotionalScoringService({ subLlm, logger });

    const service = createService({ scoring_batch_size: 1 });
    const result = await service.runCycle({ collectionId: collectionName });

    expect(result.phase0).toBeDefined();
    expect(result.phase0!.memories_scored).toBe(1);

    // Batch scoring calls sub-LLM once per memory (all 31 dims in one call)
    expect(subLlm.score).toHaveBeenCalledTimes(1);
  });

  it('computes composite scores after dimension scoring', async () => {
    await insertMemories(collectionName, 12);

    const service = createService({ scoring_batch_size: 1 });
    const result = await service.runCycle({ collectionId: collectionName });

    expect(result.phase0!.memories_scored).toBe(1);

    // Verify Weaviate update included composite scores
    const collection = mockClient.collections.get(collectionName);
    const objects = Array.from(collection._store.values());
    const scoredMemory = objects.find(
      (o) => o.properties.rem_touched_at !== null && o.properties.total_significance !== undefined,
    );

    expect(scoredMemory).toBeDefined();
    expect(scoredMemory!.properties.feel_significance).toBeDefined();
    expect(scoredMemory!.properties.functional_significance).toBeDefined();
    expect(scoredMemory!.properties.total_significance).toBeDefined();
  });

  it('sets rem_touched_at and increments rem_visits after scoring', async () => {
    await insertMemories(collectionName, 12);

    const service = createService({ scoring_batch_size: 1 });
    await service.runCycle({ collectionId: collectionName });

    const collection = mockClient.collections.get(collectionName);
    const objects = Array.from(collection._store.values());
    const scoredMemory = objects.find((o) => o.properties.rem_touched_at !== null);

    expect(scoredMemory).toBeDefined();
    expect(scoredMemory!.properties.rem_touched_at).toBeTruthy();
    expect(scoredMemory!.properties.rem_visits).toBe(1);
  });

  it('skips already-scored memories', async () => {
    // Insert only already-scored memories
    await insertMemories(collectionName, 12, true);

    const service = createService({ scoring_batch_size: 5 });
    const result = await service.runCycle({ collectionId: collectionName });

    // No unscored memories → Phase 0 scores nothing
    expect(result.phase0).toBeDefined();
    expect(result.phase0!.memories_scored).toBe(0);
  });

  it('Phase 0 failures do not block subsequent phases', async () => {
    await insertMemories(collectionName, 60);

    // Use a scoring context service that throws on gatherScoringContext
    const failingContextService = {
      gatherScoringContext: jest.fn().mockRejectedValue(new Error('Context gather failed')),
    } as any;

    const service = new RemService({
      weaviateClient: mockClient as any,
      relationshipServiceFactory: createRelationshipService,
      stateStore,
      haikuClient: createMockHaikuClient(),
      emotionalScoringService,
      scoringContextService: failingContextService,
      config: {
        min_collection_size: 10,
        scoring_batch_size: 2,
      },
      logger,
    });

    const result = await service.runCycle({ collectionId: collectionName });

    // Phase 0 should have failures but relationship discovery should still run
    expect(result.phase0).toBeDefined();
    expect(result.phase0!.memories_skipped).toBeGreaterThan(0);
    expect(result.memories_scanned).toBeGreaterThan(0);
  });

  it('handles empty collection gracefully', async () => {
    // Insert just enough to pass min_collection_size but no unscored memories
    await insertMemories(collectionName, 12, true);

    const service = createService({ scoring_batch_size: 5 });
    const result = await service.runCycle({ collectionId: collectionName });

    // Should still score some (the "outdated" tier)
    expect(result.phase0).toBeDefined();
  });

  it('skips Phase 0 when scoring services not provided', async () => {
    await insertMemories(collectionName, 15);

    const service = new RemService({
      weaviateClient: mockClient as any,
      relationshipServiceFactory: createRelationshipService,
      stateStore,
      haikuClient: createMockHaikuClient(),
      config: { min_collection_size: 10 },
      logger,
      // No emotionalScoringService or scoringContextService
    });

    const result = await service.runCycle({ collectionId: collectionName });

    expect(result.phase0).toBeUndefined();
  });

  it('persists dimension scores to Weaviate', async () => {
    await insertMemories(collectionName, 12);

    const subLlm = createMockSubLlm(0.6);
    emotionalScoringService = new EmotionalScoringService({ subLlm, logger });

    const service = createService({ scoring_batch_size: 1 });
    await service.runCycle({ collectionId: collectionName });

    const collection = mockClient.collections.get(collectionName);
    const objects = Array.from(collection._store.values());
    const scoredMemory = objects.find((o) => o.properties.rem_touched_at !== null);

    expect(scoredMemory).toBeDefined();
    // Check a few dimension scores were persisted
    expect(scoredMemory!.properties.feel_emotional_significance).toBe(0.6);
    expect(scoredMemory!.properties.functional_salience).toBe(0.6);
  });
});
