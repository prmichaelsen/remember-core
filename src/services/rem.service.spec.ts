import { createMockWeaviateClient, createMockLogger } from '../testing/weaviate-mock.js';
import { RelationshipService } from './relationship.service.js';
import { RemService } from './rem.service.js';
import { RemStateStore } from './rem.state.js';
import { createMockHaikuClient } from './rem.haiku.js';
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

      // Sort by collection_name ascending
      entries.sort((a: any, b: any) =>
        ((a.data.collection_name as string) ?? a.id).localeCompare(
          (b.data.collection_name as string) ?? b.id,
        ),
      );

      // Apply startAfter cursor
      let filtered = entries;
      if (options?.startAfter?.length) {
        const cursor = options.startAfter[0];
        const idx = filtered.findIndex(
          (e: any) => ((e.data.collection_name as string) ?? e.id) > cursor,
        );
        filtered = idx >= 0 ? filtered.slice(idx) : [];
      }

      // Apply limit
      if (options?.limit) {
        filtered = filtered.slice(0, options.limit);
      }

      return filtered;
    }),
    __store: store,
  };
});

describe('RemService', () => {
  let mockClient: ReturnType<typeof createMockWeaviateClient>;
  let logger: ReturnType<typeof createMockLogger>;
  let stateStore: RemStateStore;
  const userId = 'test-user';

  function createRelationshipService(collection: any, uid: string) {
    return new RelationshipService(collection, uid, logger);
  }

  /**
   * Register a collection in the mock Firestore registry so
   * getNextRegisteredCollection can find it.
   */
  function registerInRegistry(collectionName: string) {
    const { __store } = require('../database/firestore/init.js');
    const { getCollectionRegistryPath } = require('../database/firestore/paths.js');
    const registryPath = getCollectionRegistryPath();
    __store.set(`${registryPath}/${collectionName}`, {
      collection_name: collectionName,
      collection_type: 'users',
      owner_id: null,
      created_at: new Date().toISOString(),
    });
  }

  async function insertMemories(collectionName: string, count: number) {
    const collection = mockClient.collections.get(collectionName);
    registerInRegistry(collectionName);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = await collection.data.insert({
        properties: {
          user_id: userId,
          doc_type: 'memory',
          content: `memory ${i} in ${collectionName}`,
          created_at: new Date(2026, 0, i + 1).toISOString(),
          tags: ['auto'],
          deleted_at: null,
          relationship_ids: [],
        },
      });
      ids.push(id);
    }
    return ids;
  }

  beforeEach(() => {
    mockClient = createMockWeaviateClient();
    logger = createMockLogger();
    stateStore = new RemStateStore();

    // Clear mock Firestore store
    const { __store } = require('../database/firestore/init.js');
    __store.clear();
  });

  it('skips collections below min size', async () => {
    // Insert fewer memories than min_collection_size
    await insertMemories('Memory_users_alice', 5);

    const service = new RemService({
      weaviateClient: mockClient as any,
      relationshipServiceFactory: createRelationshipService,
      stateStore,
      haikuClient: createMockHaikuClient(),
      config: { min_collection_size: 10 },
      logger,
    });

    const result = await service.runCycle({ collectionId: 'Memory_users_alice' });
    expect(result.collection_id).toBe('Memory_users_alice');
    expect(result.memories_scanned).toBe(0);
  });

  it('processes a collection and creates relationships', async () => {
    // Insert enough memories to exceed min_collection_size and form clusters
    await insertMemories('Memory_users_bob', 60);

    const service = new RemService({
      weaviateClient: mockClient as any,
      relationshipServiceFactory: createRelationshipService,
      stateStore,
      haikuClient: createMockHaikuClient(),
      config: { min_collection_size: 10 },
      logger,
    });

    const result = await service.runCycle({ collectionId: 'Memory_users_bob' });
    expect(result.collection_id).toBe('Memory_users_bob');
    expect(result.memories_scanned).toBeGreaterThan(0);
  });

  it('creates relationships with source=rem', async () => {
    await insertMemories('Memory_users_carol', 60);

    const service = new RemService({
      weaviateClient: mockClient as any,
      relationshipServiceFactory: createRelationshipService,
      stateStore,
      haikuClient: createMockHaikuClient(),
      config: { min_collection_size: 10 },
      logger,
    });

    const result = await service.runCycle({ collectionId: 'Memory_users_carol' });

    // Check if any relationships were created with source=rem
    if (result.relationships_created > 0) {
      const collection = mockClient.collections.get('Memory_users_carol');
      const allObjects = Array.from(collection._store.values());
      const rels = allObjects.filter((o) => o.properties.doc_type === 'relationship');
      for (const rel of rels) {
        expect(rel.properties.source).toBe('rem');
      }
    }
  });

  it('skips clusters rejected by Haiku', async () => {
    await insertMemories('Memory_users_dave', 60);

    const rejectingClient = createMockHaikuClient({
      valid: false,
      reason: 'not a meaningful group',
    });

    const service = new RemService({
      weaviateClient: mockClient as any,
      relationshipServiceFactory: createRelationshipService,
      stateStore,
      haikuClient: rejectingClient,
      config: { min_collection_size: 10 },
      logger,
    });

    const result = await service.runCycle({ collectionId: 'Memory_users_dave' });
    expect(result.relationships_created).toBe(0);
    // skipped_by_haiku may be > 0 if clusters were found
  });

  it('logs collection selection and cycle progress', async () => {
    await insertMemories('Memory_users_frank', 60);

    const loggerSpy = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const service = new RemService({
      weaviateClient: mockClient as any,
      relationshipServiceFactory: createRelationshipService,
      stateStore,
      haikuClient: createMockHaikuClient(),
      config: { min_collection_size: 10 },
      logger: loggerSpy,
    });

    await service.runCycle({ collectionId: 'Memory_users_frank' });

    // Verify key logging calls
    expect(loggerSpy.info).toHaveBeenCalledWith('REM cycle starting', { collectionId: 'Memory_users_frank' });
    expect(loggerSpy.info).toHaveBeenCalledWith('Starting cluster formation', expect.any(Object));
    expect(loggerSpy.info).toHaveBeenCalledWith('Cluster formation complete', expect.any(Object));
    expect(loggerSpy.info).toHaveBeenCalledWith('REM cycle complete', expect.objectContaining({
      collection_id: 'Memory_users_frank',
      duration_seconds: expect.any(Number),
    }));
    expect(loggerSpy.info).toHaveBeenCalledWith('Multi-strategy candidate selection complete', expect.any(Object));
    expect(loggerSpy.debug).toHaveBeenCalledWith('Cursor advanced', expect.any(Object));
  });

  // ── Phase 0: Emotional Scoring ──────────────────────────────────────────

  describe('Phase 0: Emotional Scoring', () => {
    // 31 dimension property names (21 feel + 10 functional)
    const MOCK_DIMENSIONS = [
      'feel_emotional_significance', 'feel_vulnerability', 'feel_trauma', 'feel_humor',
      'feel_happiness', 'feel_sadness', 'feel_fear', 'feel_anger', 'feel_surprise',
      'feel_disgust', 'feel_contempt', 'feel_embarrassment', 'feel_shame', 'feel_guilt',
      'feel_excitement', 'feel_pride', 'feel_valence', 'feel_arousal', 'feel_dominance',
      'feel_intensity', 'feel_coherence_tension',
      'functional_salience', 'functional_urgency', 'functional_social_weight',
      'functional_agency', 'functional_novelty', 'functional_retrieval_utility',
      'functional_narrative_importance', 'functional_aesthetic_quality',
      'functional_valence', 'functional_coherence_tension',
    ];

    function createMockScoringService(scoreValue = 0.5) {
      return {
        scoreAllDimensions: jest.fn(async () => {
          const scores: Record<string, number | null> = {};
          for (const dim of MOCK_DIMENSIONS) {
            scores[dim] = scoreValue;
          }
          return scores;
        }),
        scoreDimension: jest.fn(),
        getDimension: jest.fn(),
      };
    }

    function createMockContextService() {
      return {
        gatherScoringContext: jest.fn(async () => ({
          relationship_observations: [] as string[],
          nearest_neighbor_scores: {} as Record<string, number>,
          collection_averages: {} as Record<string, number>,
        })),
        fetchRelationshipObservations: jest.fn(),
        fetchNearestNeighborScores: jest.fn(),
        computeCollectionAverages: jest.fn(),
      };
    }

    it('runs Phase 0 before relationship discovery', async () => {
      await insertMemories('Memory_users_phase0', 60);

      const scoringService = createMockScoringService();
      const contextService = createMockContextService();

      const service = new RemService({
        weaviateClient: mockClient as any,
        relationshipServiceFactory: createRelationshipService,
        stateStore,
        haikuClient: createMockHaikuClient(),
        config: { min_collection_size: 10, scoring_batch_size: 5 },
        logger,
        emotionalScoringService: scoringService as any,
        scoringContextService: contextService as any,
      });

      const result = await service.runCycle({ collectionId: 'Memory_users_phase0' });
      expect(result.phase0).toBeDefined();
      expect(result.phase0!.memories_scored).toBe(5);
    });

    it('skips Phase 0 when services not provided', async () => {
      await insertMemories('Memory_users_nophase0', 60);

      const service = new RemService({
        weaviateClient: mockClient as any,
        relationshipServiceFactory: createRelationshipService,
        stateStore,
        haikuClient: createMockHaikuClient(),
        config: { min_collection_size: 10 },
        logger,
      });

      const result = await service.runCycle({ collectionId: 'Memory_users_nophase0' });
      expect(result.phase0).toBeUndefined();
    });

    it('selects unscored memories (null rem_touched_at) before outdated ones', async () => {
      const collName = 'Memory_users_priority';
      registerInRegistry(collName);
      const collection = mockClient.collections.get(collName);

      // Insert 3 unscored memories
      for (let i = 0; i < 3; i++) {
        await collection.data.insert({
          properties: {
            doc_type: 'memory',
            content: `unscored ${i}`,
            created_at: new Date(2026, 0, i + 1).toISOString(),
            rem_touched_at: null,
          },
        });
      }

      // Insert 3 already-scored (outdated) memories
      for (let i = 0; i < 3; i++) {
        await collection.data.insert({
          properties: {
            doc_type: 'memory',
            content: `scored ${i}`,
            created_at: new Date(2026, 0, i + 1).toISOString(),
            rem_touched_at: new Date(2025, 0, i + 1).toISOString(),
            rem_visits: 1,
          },
        });
      }

      // Insert enough extra to meet min_collection_size
      for (let i = 0; i < 54; i++) {
        await collection.data.insert({
          properties: { doc_type: 'memory', content: `filler ${i}`, created_at: new Date().toISOString() },
        });
      }

      const scoringService = createMockScoringService();
      const contextService = createMockContextService();

      const service = new RemService({
        weaviateClient: mockClient as any,
        relationshipServiceFactory: createRelationshipService,
        stateStore,
        haikuClient: createMockHaikuClient(),
        config: { min_collection_size: 10, scoring_batch_size: 4 },
        logger,
        emotionalScoringService: scoringService as any,
        scoringContextService: contextService as any,
      });

      const result = await service.runCycle({ collectionId: collName });

      // 3 unscored + 1 outdated = 4 (batch size)
      expect(result.phase0!.memories_scored).toBe(4);
      // The scoring service should have been called with unscored first
      expect(scoringService.scoreAllDimensions).toHaveBeenCalledTimes(4);
    });

    it('limits processing by batch size', async () => {
      await insertMemories('Memory_users_batch', 60);

      const scoringService = createMockScoringService();
      const contextService = createMockContextService();

      const service = new RemService({
        weaviateClient: mockClient as any,
        relationshipServiceFactory: createRelationshipService,
        stateStore,
        haikuClient: createMockHaikuClient(),
        config: { min_collection_size: 10, scoring_batch_size: 3 },
        logger,
        emotionalScoringService: scoringService as any,
        scoringContextService: contextService as any,
      });

      const result = await service.runCycle({ collectionId: 'Memory_users_batch' });
      expect(result.phase0!.memories_scored).toBeLessThanOrEqual(3);
    });

    it('stops when cost cap is reached', async () => {
      await insertMemories('Memory_users_costcap', 60);

      const scoringService = createMockScoringService();
      const contextService = createMockContextService();

      const service = new RemService({
        weaviateClient: mockClient as any,
        relationshipServiceFactory: createRelationshipService,
        stateStore,
        haikuClient: createMockHaikuClient(),
        config: {
          min_collection_size: 10,
          scoring_batch_size: 100,
          scoring_cost_cap: 0.003,       // Enough for 2 memories
          scoring_cost_per_memory: 0.0015,
        },
        logger,
        emotionalScoringService: scoringService as any,
        scoringContextService: contextService as any,
      });

      const result = await service.runCycle({ collectionId: 'Memory_users_costcap' });
      expect(result.phase0!.memories_scored).toBe(2);
      expect(result.phase0!.stopped_by_cost_cap).toBe(true);
    });

    it('scores all 31 dimensions per memory', async () => {
      await insertMemories('Memory_users_dims', 60);

      const scoringService = createMockScoringService();
      const contextService = createMockContextService();

      const service = new RemService({
        weaviateClient: mockClient as any,
        relationshipServiceFactory: createRelationshipService,
        stateStore,
        haikuClient: createMockHaikuClient(),
        config: { min_collection_size: 10, scoring_batch_size: 1 },
        logger,
        emotionalScoringService: scoringService as any,
        scoringContextService: contextService as any,
      });

      await service.runCycle({ collectionId: 'Memory_users_dims' });

      // scoreAllDimensions returns all 31 dimensions
      const callResult = await scoringService.scoreAllDimensions.mock.results[0].value;
      expect(Object.keys(callResult)).toHaveLength(31);
    });

    it('computes composite scores after dimension scoring', async () => {
      const collName = 'Memory_users_composites';
      registerInRegistry(collName);
      const collection = mockClient.collections.get(collName);

      const memId = await collection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'test memory',
          created_at: new Date().toISOString(),
          rem_touched_at: null,
        },
      });

      // Fill to meet min size
      for (let i = 0; i < 59; i++) {
        await collection.data.insert({
          properties: { doc_type: 'memory', content: `filler ${i}`, created_at: new Date().toISOString() },
        });
      }

      const scoringService = createMockScoringService(0.6);
      const contextService = createMockContextService();

      const service = new RemService({
        weaviateClient: mockClient as any,
        relationshipServiceFactory: createRelationshipService,
        stateStore,
        haikuClient: createMockHaikuClient(),
        config: { min_collection_size: 10, scoring_batch_size: 1 },
        logger,
        emotionalScoringService: scoringService as any,
        scoringContextService: contextService as any,
      });

      await service.runCycle({ collectionId: collName });

      // Check that composites were stored
      const updated = await collection.query.fetchObjectById(memId);
      expect(updated!.properties.feel_significance).toBeDefined();
      expect(updated!.properties.functional_significance).toBeDefined();
      expect(updated!.properties.total_significance).toBeDefined();
    });

    it('updates rem_touched_at and increments rem_visits', async () => {
      const collName = 'Memory_users_metadata';
      registerInRegistry(collName);
      const collection = mockClient.collections.get(collName);

      const memId = await collection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'metadata test',
          created_at: new Date().toISOString(),
          rem_touched_at: null,
          rem_visits: 0,
        },
      });

      // Fill to meet min size
      for (let i = 0; i < 59; i++) {
        await collection.data.insert({
          properties: { doc_type: 'memory', content: `filler ${i}`, created_at: new Date().toISOString() },
        });
      }

      const scoringService = createMockScoringService();
      const contextService = createMockContextService();

      const service = new RemService({
        weaviateClient: mockClient as any,
        relationshipServiceFactory: createRelationshipService,
        stateStore,
        haikuClient: createMockHaikuClient(),
        config: { min_collection_size: 10, scoring_batch_size: 1 },
        logger,
        emotionalScoringService: scoringService as any,
        scoringContextService: contextService as any,
      });

      await service.runCycle({ collectionId: collName });

      const updated = await collection.query.fetchObjectById(memId);
      expect(updated!.properties.rem_touched_at).toBeDefined();
      expect(typeof updated!.properties.rem_touched_at).toBe('string');
      expect(updated!.properties.rem_visits).toBe(1);
    });

    it('persists all scores to Weaviate in single update', async () => {
      const collName = 'Memory_users_persist';
      registerInRegistry(collName);
      const collection = mockClient.collections.get(collName);

      const memId = await collection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'persist test',
          created_at: new Date().toISOString(),
          rem_touched_at: null,
        },
      });

      // Fill to meet min size
      for (let i = 0; i < 59; i++) {
        await collection.data.insert({
          properties: { doc_type: 'memory', content: `filler ${i}`, created_at: new Date().toISOString() },
        });
      }

      const scoringService = createMockScoringService(0.7);
      const contextService = createMockContextService();

      const service = new RemService({
        weaviateClient: mockClient as any,
        relationshipServiceFactory: createRelationshipService,
        stateStore,
        haikuClient: createMockHaikuClient(),
        config: { min_collection_size: 10, scoring_batch_size: 1 },
        logger,
        emotionalScoringService: scoringService as any,
        scoringContextService: contextService as any,
      });

      await service.runCycle({ collectionId: collName });

      const updated = await collection.query.fetchObjectById(memId);
      // Check that dimension scores were persisted
      expect(updated!.properties.feel_happiness).toBe(0.7);
      expect(updated!.properties.functional_salience).toBe(0.7);
    });

    it('Phase 0 failures do not block subsequent phases', async () => {
      await insertMemories('Memory_users_failsafe', 60);

      const scoringService = createMockScoringService();
      (scoringService.scoreAllDimensions as jest.Mock).mockRejectedValue(new Error('Scoring API down'));
      const contextService = createMockContextService();

      const service = new RemService({
        weaviateClient: mockClient as any,
        relationshipServiceFactory: createRelationshipService,
        stateStore,
        haikuClient: createMockHaikuClient(),
        config: { min_collection_size: 10, scoring_batch_size: 2 },
        logger,
        emotionalScoringService: scoringService as any,
        scoringContextService: contextService as any,
      });

      const result = await service.runCycle({ collectionId: 'Memory_users_failsafe' });

      // Phase 0 had failures but cycle continued
      expect(result.phase0!.memories_skipped).toBeGreaterThan(0);
      expect(result.memories_scanned).toBeGreaterThan(0); // Phase 1 still ran
    });

    it('handles empty collection (no memories to score)', async () => {
      const collName = 'Memory_users_empty_score';
      registerInRegistry(collName);
      const collection = mockClient.collections.get(collName);

      // Insert only relationship docs (no memories with doc_type=memory matching unscored filter)
      for (let i = 0; i < 60; i++) {
        await collection.data.insert({
          properties: {
            doc_type: 'memory',
            content: `already scored ${i}`,
            created_at: new Date().toISOString(),
            rem_touched_at: new Date().toISOString(),
            rem_visits: 5,
          },
        });
      }

      const scoringService = createMockScoringService();
      const contextService = createMockContextService();

      const service = new RemService({
        weaviateClient: mockClient as any,
        relationshipServiceFactory: createRelationshipService,
        stateStore,
        haikuClient: createMockHaikuClient(),
        config: { min_collection_size: 10, scoring_batch_size: 10 },
        logger,
        emotionalScoringService: scoringService as any,
        scoringContextService: contextService as any,
      });

      const result = await service.runCycle({ collectionId: collName });

      // All memories already scored but still processed as "outdated"
      expect(result.phase0).toBeDefined();
      expect(result.phase0!.memories_scored).toBeLessThanOrEqual(10);
    });

    it('passes scoring context to emotional scoring service', async () => {
      await insertMemories('Memory_users_ctx', 60);

      const scoringService = createMockScoringService();
      const contextService = createMockContextService();
      (contextService.gatherScoringContext as jest.Mock).mockResolvedValue({
        relationship_observations: ['connected to music'],
        nearest_neighbor_scores: { feel_happiness: 0.8 },
        collection_averages: { feel_happiness: 0.5 },
      });

      const service = new RemService({
        weaviateClient: mockClient as any,
        relationshipServiceFactory: createRelationshipService,
        stateStore,
        haikuClient: createMockHaikuClient(),
        config: { min_collection_size: 10, scoring_batch_size: 1 },
        logger,
        emotionalScoringService: scoringService as any,
        scoringContextService: contextService as any,
      });

      await service.runCycle({ collectionId: 'Memory_users_ctx' });

      expect(contextService.gatherScoringContext).toHaveBeenCalled();
      expect(scoringService.scoreAllDimensions).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.any(String) }),
        expect.objectContaining({
          relationship_observations: ['connected to music'],
        }),
      );
    });
  });
});
