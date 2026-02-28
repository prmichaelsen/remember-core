import { SpaceService } from '../space.service.js';
import { ConfirmationTokenService } from '../confirmation-token.service.js';
import {
  createMockCollection,
  createMockWeaviateClient,
  createMockLogger,
} from '../../testing/weaviate-mock.js';

// Mock Firestore operations used by ConfirmationTokenService
jest.mock('../../database/firestore/init.js', () => {
  const store = new Map<string, { id: string; data: any }>();
  let counter = 0;
  return {
    addDocument: jest.fn(async (_path: string, data: any) => {
      const id = `doc-${++counter}`;
      store.set(id, { id, data });
      return { id };
    }),
    updateDocument: jest.fn(async (_path: string, docId: string, updates: any) => {
      const existing = store.get(docId);
      if (existing) {
        existing.data = { ...existing.data, ...updates };
      }
    }),
    queryDocuments: jest.fn(async (_path: string, opts: any) => {
      const results: any[] = [];
      for (const [id, entry] of store.entries()) {
        let match = true;
        for (const where of opts.where || []) {
          if (entry.data[where.field] !== where.value) {
            match = false;
            break;
          }
        }
        if (match) results.push({ id, data: entry.data });
        if (opts.limit && results.length >= opts.limit) break;
      }
      return results;
    }),
    getDocument: jest.fn(async () => null),
    setDocument: jest.fn(async () => {}),
  };
});

// Mock space-schema functions
jest.mock('../../database/weaviate/space-schema.js', () => ({
  isValidSpaceId: (id: string) => ['the_void', 'dogs', 'cooking'].includes(id),
  ensurePublicCollection: jest.fn(async (client: any) => {
    return client.collections.get('Memory_spaces_public');
  }),
  PUBLIC_COLLECTION_NAME: 'Memory_spaces_public',
}));

// Mock space-config
jest.mock('../space-config.service.js', () => ({
  getSpaceConfig: jest.fn(async () => ({
    require_moderation: false,
    default_write_mode: 'owner_only',
  })),
  DEFAULT_SPACE_CONFIG: { require_moderation: false, default_write_mode: 'owner_only' },
}));

// Mock fetchMemoryWithAllProperties
jest.mock('../../database/weaviate/client.js', () => ({
  fetchMemoryWithAllProperties: jest.fn(async (collection: any, id: string) => {
    return collection.query.fetchObjectById(id);
  }),
}));

describe('SpaceService', () => {
  let weaviateClient: ReturnType<typeof createMockWeaviateClient>;
  let userCollection: ReturnType<typeof createMockCollection>;
  let logger: ReturnType<typeof createMockLogger>;
  let confirmationService: ConfirmationTokenService;
  let service: SpaceService;
  const userId = 'test-user';

  beforeEach(() => {
    weaviateClient = createMockWeaviateClient();
    userCollection = createMockCollection();
    logger = createMockLogger();
    confirmationService = new ConfirmationTokenService(logger);
    service = new SpaceService(
      weaviateClient as any,
      userCollection as any,
      userId,
      confirmationService,
      logger,
    );
    // Register user collection with client
    (weaviateClient as any)._collections.set(`Memory_users_${userId}`, userCollection);
  });

  async function insertUserMemory(overrides: Record<string, any> = {}) {
    return userCollection.data.insert({
      properties: {
        user_id: userId,
        doc_type: 'memory',
        content: 'test memory',
        title: 'Test',
        tags: ['test'],
        space_ids: [],
        group_ids: [],
        deleted_at: null,
        ...overrides,
      },
    });
  }

  describe('publish', () => {
    it('generates confirmation token for space publish', async () => {
      const memoryId = await insertUserMemory();
      const result = await service.publish({
        memory_id: memoryId,
        spaces: ['the_void'],
      });
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
    });

    it('throws if no destinations', async () => {
      const memoryId = await insertUserMemory();
      await expect(
        service.publish({ memory_id: memoryId, spaces: [], groups: [] }),
      ).rejects.toThrow('Must specify at least one');
    });

    it('throws for invalid space ID', async () => {
      const memoryId = await insertUserMemory();
      await expect(
        service.publish({ memory_id: memoryId, spaces: ['invalid_space'] }),
      ).rejects.toThrow('Invalid space IDs');
    });

    it('throws for nonexistent memory', async () => {
      await expect(
        service.publish({ memory_id: 'nonexistent', spaces: ['the_void'] }),
      ).rejects.toThrow('Memory not found');
    });

    it('throws for non-owned memory', async () => {
      const memoryId = await insertUserMemory({ user_id: 'other-user' });
      await expect(
        service.publish({ memory_id: memoryId, spaces: ['the_void'] }),
      ).rejects.toThrow('Permission denied');
    });

    it('throws for relationship documents', async () => {
      const relId = await userCollection.data.insert({
        properties: { user_id: userId, doc_type: 'relationship' },
      });
      await expect(
        service.publish({ memory_id: relId, spaces: ['the_void'] }),
      ).rejects.toThrow('Only memories can be published');
    });
  });

  describe('retract', () => {
    it('generates confirmation token for retraction', async () => {
      const memoryId = await insertUserMemory({
        space_ids: ['the_void'],
        group_ids: [],
      });
      const result = await service.retract({
        memory_id: memoryId,
        spaces: ['the_void'],
      });
      expect(result.token).toBeDefined();
    });

    it('throws if memory not published to destination', async () => {
      const memoryId = await insertUserMemory();
      await expect(
        service.retract({ memory_id: memoryId, spaces: ['the_void'] }),
      ).rejects.toThrow('not published to some destinations');
    });

    it('throws if no destinations', async () => {
      const memoryId = await insertUserMemory();
      await expect(
        service.retract({ memory_id: memoryId }),
      ).rejects.toThrow('Must specify at least one');
    });
  });

  describe('revise', () => {
    it('generates confirmation token for revision', async () => {
      const memoryId = await insertUserMemory({
        space_ids: ['the_void'],
      });
      const result = await service.revise({ memory_id: memoryId });
      expect(result.token).toBeDefined();
    });

    it('throws if memory not published anywhere', async () => {
      const memoryId = await insertUserMemory();
      await expect(service.revise({ memory_id: memoryId })).rejects.toThrow(
        'no published copies',
      );
    });
  });

  describe('confirm (publish flow)', () => {
    it('executes publish to spaces', async () => {
      const memoryId = await insertUserMemory();

      // Phase 1: get token
      const { token } = await service.publish({
        memory_id: memoryId,
        spaces: ['the_void'],
      });

      // Phase 2: confirm
      const result = await service.confirm({ token });
      expect(result.success).toBe(true);
      expect(result.action).toBe('publish_memory');
      expect(result.composite_id).toBe(`${userId}.${memoryId}`);
      expect(result.published_to).toBeDefined();
      expect(result.space_ids).toContain('the_void');

      // Verify source memory tracking arrays updated
      const source = userCollection._store.get(memoryId);
      expect(source!.properties.space_ids).toContain('the_void');
    });
  });

  describe('deny', () => {
    it('denies a pending action', async () => {
      const memoryId = await insertUserMemory();
      const { token } = await service.publish({
        memory_id: memoryId,
        spaces: ['the_void'],
      });

      const result = await service.deny({ token });
      expect(result.success).toBe(true);

      // Token should no longer be usable
      await expect(service.confirm({ token })).rejects.toThrow('Invalid or expired');
    });

    it('throws for invalid token', async () => {
      await expect(service.deny({ token: 'invalid-token' })).rejects.toThrow(
        'Token not found',
      );
    });
  });

  describe('moderate', () => {
    it('throws without destination', async () => {
      await expect(
        service.moderate({ memory_id: 'x', action: 'approve' }),
      ).rejects.toThrow('Must specify either space_id or group_id');
    });

    it('throws without moderator permissions for groups', async () => {
      await expect(
        service.moderate(
          { memory_id: 'x', group_id: 'g1', action: 'approve' },
          undefined,
        ),
      ).rejects.toThrow('Moderator access required');
    });

    it('throws without moderator permissions for spaces', async () => {
      await expect(
        service.moderate(
          { memory_id: 'x', space_id: 'the_void', action: 'approve' },
          undefined,
        ),
      ).rejects.toThrow('Moderator access required');
    });
  });

  describe('search', () => {
    it('throws for invalid space IDs', async () => {
      await expect(
        service.search({ query: 'test', spaces: ['invalid_space'] }),
      ).rejects.toThrow('Invalid space IDs');
    });

    it('searches all public when no destinations specified', async () => {
      // Insert a memory in the public collection
      const publicCollection = weaviateClient.collections.get('Memory_spaces_public');
      await publicCollection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'public memory',
          deleted_at: null,
          moderation_status: 'approved',
          content_type: 'note',
        },
      });

      const result = await service.search({ query: 'public' });
      expect(result.spaces_searched).toBe('all_public');
      expect(result.memories.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('query', () => {
    it('throws for empty question', async () => {
      await expect(
        service.query({ question: '', spaces: ['the_void'] }),
      ).rejects.toThrow('Question cannot be empty');
    });

    it('throws for empty spaces array', async () => {
      await expect(
        service.query({ question: 'test', spaces: [] }),
      ).rejects.toThrow('Must specify at least one space');
    });

    it('throws for invalid space IDs', async () => {
      await expect(
        service.query({ question: 'test', spaces: ['invalid'] }),
      ).rejects.toThrow('Invalid space IDs');
    });

    it('returns query results', async () => {
      // Ensure public collection exists with the mock client
      const publicCollection = weaviateClient.collections.get('Memory_spaces_public');
      await publicCollection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'hiking trail info',
          spaces: ['the_void'],
          moderation_status: 'approved',
          content_type: 'note',
          deleted_at: null,
        },
      });

      const result = await service.query({ question: 'hiking', spaces: ['the_void'] });
      expect(result.question).toBe('hiking');
      expect(result.spaces_queried).toEqual(['the_void']);
      expect(result.memories).toBeDefined();
    });
  });
});
