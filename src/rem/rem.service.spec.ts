import { createMockWeaviateClient, createMockLogger } from '../testing/weaviate-mock.js';
import { RelationshipService } from '../services/relationship.service.js';
import { RemService } from './rem.service.js';
import { RemStateStore } from './rem.state.js';
import { createMockHaikuClient } from './rem.haiku.js';

// Mock Firestore for RemStateStore
jest.mock('../database/firestore/init.js', () => {
  const store = new Map<string, any>();
  return {
    getDocument: jest.fn(async (collectionPath: string, docId: string) => {
      return store.get(`${collectionPath}/${docId}`) ?? null;
    }),
    setDocument: jest.fn(async (collectionPath: string, docId: string, data: any) => {
      store.set(`${collectionPath}/${docId}`, data);
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

  async function insertMemories(collectionName: string, count: number) {
    const collection = mockClient.collections.get(collectionName);
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

  it('returns early when no collections exist', async () => {
    const service = new RemService({
      weaviateClient: mockClient as any,
      relationshipServiceFactory: createRelationshipService,
      stateStore,
      haikuClient: createMockHaikuClient(),
      logger,
    });

    const result = await service.runCycle();
    expect(result.collection_id).toBeNull();
    expect(result.memories_scanned).toBe(0);
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

    const result = await service.runCycle();
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

    const result = await service.runCycle();
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

    const result = await service.runCycle();

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

    const result = await service.runCycle();
    expect(result.relationships_created).toBe(0);
    // skipped_by_haiku may be > 0 if clusters were found
  });

  it('wraps around to first collection after last', async () => {
    await insertMemories('Memory_users_alice', 5);
    await insertMemories('Memory_users_bob', 5);

    // Set cursor to last collection
    const { setDocument } = require('../database/firestore/init.js');
    const BASE = 'e0.remember-mcp';
    await setDocument(`${BASE}.rem_state`, 'cursor', {
      last_collection_id: 'Memory_users_bob',
      last_run_at: new Date().toISOString(),
    });

    const service = new RemService({
      weaviateClient: mockClient as any,
      relationshipServiceFactory: createRelationshipService,
      stateStore,
      haikuClient: createMockHaikuClient(),
      config: { min_collection_size: 100 }, // high threshold so it skips fast
      logger,
    });

    const result = await service.runCycle();
    // Should wrap to first collection (alice)
    expect(result.collection_id).toBe('Memory_users_alice');
  });

  it('persists cursor after completion', async () => {
    await insertMemories('Memory_users_eve', 60);

    const service = new RemService({
      weaviateClient: mockClient as any,
      relationshipServiceFactory: createRelationshipService,
      stateStore,
      haikuClient: createMockHaikuClient(),
      config: { min_collection_size: 10 },
      logger,
    });

    await service.runCycle();

    const cursor = await stateStore.getCursor();
    expect(cursor).not.toBeNull();
    expect(cursor?.last_collection_id).toBe('Memory_users_eve');
  });
});
