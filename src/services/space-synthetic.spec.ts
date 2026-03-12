import { SpaceService } from './space.service';
import { ConfirmationTokenService } from './confirmation-token.service';
import { ValidationError } from '../errors/app-errors';
import {
  createMockCollection,
  createMockWeaviateClient,
  createMockLogger,
} from '../testing/weaviate-mock';
import type { SyntheticMemoryRegistry } from './synthetic-memory-registry';

// Mock Firestore
jest.mock('../database/firestore/init.js', () => ({
  addDocument: jest.fn(async () => ({ id: 'doc-1' })),
  updateDocument: jest.fn(async () => {}),
  queryDocuments: jest.fn(async () => []),
  getDocument: jest.fn(async () => null),
  setDocument: jest.fn(async () => {}),
}));

// Mock space-schema — include 'core' as valid
jest.mock('../database/weaviate/space-schema.js', () => ({
  isValidSpaceId: (id: string) => ['the_void', 'profiles', 'ghosts', 'core'].includes(id),
  ensurePublicCollection: jest.fn(async (client: any) => client.collections.get('Memory_spaces_public')),
  PUBLIC_COLLECTION_NAME: 'Memory_spaces_public',
}));

jest.mock('./space-config.service.js', () => ({
  getSpaceConfig: jest.fn(async () => ({ require_moderation: false, default_write_mode: 'owner_only' })),
  DEFAULT_SPACE_CONFIG: { require_moderation: false, default_write_mode: 'owner_only' },
}));

jest.mock('../database/weaviate/client.js', () => ({
  fetchMemoryWithAllProperties: jest.fn(async (collection: any, id: string) => collection.query.fetchObjectById(id)),
  ALL_MEMORY_PROPERTIES: ['content', 'title', 'tags', 'created_at', 'weight', 'content_type', 'doc_type', 'user_id'],
}));

describe('SpaceService — Synthetic Core Space', () => {
  let weaviateClient: ReturnType<typeof createMockWeaviateClient>;
  let userCollection: ReturnType<typeof createMockCollection>;
  let logger: ReturnType<typeof createMockLogger>;
  let confirmationService: ConfirmationTokenService;
  let mockMemoryIndex: { index: jest.Mock; lookup: jest.Mock };
  let spacesCollection: ReturnType<typeof createMockCollection>;
  let mockRegistry: SyntheticMemoryRegistry;
  const userId = 'test-user';
  const ghostId = 'ghost-abc';

  const syntheticMood = {
    id: 'synthetic:mood:test-user',
    doc_type: 'memory',
    content_type: 'system',
    content: 'Current mood: content',
    title: 'Current Mood State',
    tags: ['core', 'mood', 'synthetic'],
    user_id: 'test-user',
  };

  beforeEach(() => {
    weaviateClient = createMockWeaviateClient();
    userCollection = createMockCollection();
    logger = createMockLogger();
    confirmationService = new ConfirmationTokenService(logger);
    mockMemoryIndex = { index: jest.fn().mockResolvedValue(undefined), lookup: jest.fn().mockResolvedValue(null) };
    spacesCollection = createMockCollection();
    (weaviateClient as any)._collections.set('Memory_spaces_public', spacesCollection);

    mockRegistry = {
      register: jest.fn(),
      fetchAll: jest.fn().mockResolvedValue([syntheticMood]),
    };
  });

  function createService(registry?: SyntheticMemoryRegistry) {
    return new SpaceService(
      weaviateClient as any, userCollection as any, userId,
      confirmationService, logger, mockMemoryIndex as any,
      { syntheticRegistry: registry },
    );
  }

  async function insertSpaceMemory(overrides: Record<string, any> = {}) {
    return spacesCollection.data.insert({
      properties: {
        user_id: userId,
        doc_type: 'memory',
        content: 'real memory content',
        content_type: 'note',
        title: 'Real Memory',
        tags: ['test'],
        weight: 0.5,
        space_ids: ['the_void'],
        group_ids: [],
        created_at: new Date().toISOString(),
        moderation_status: 'approved',
        ...overrides,
      },
    });
  }

  describe('search() with core space', () => {
    it('returns synthetic results prepended to real results', async () => {
      const service = createService(mockRegistry);
      await insertSpaceMemory();

      const result = await service.search({
        query: 'test',
        spaces: ['core', 'the_void'],
        ghostCompositeId: ghostId,
      });

      expect(mockRegistry.fetchAll).toHaveBeenCalledWith(userId, ghostId);
      expect(result.memories[0]).toEqual(syntheticMood);
      expect(result.memories.length).toBeGreaterThanOrEqual(2);
      expect(result.spaces_searched).toEqual(['core', 'the_void']);
    });

    it('returns only synthetic when spaces is just core', async () => {
      const service = createService(mockRegistry);

      const result = await service.search({
        query: 'mood',
        spaces: ['core'],
        ghostCompositeId: ghostId,
      });

      expect(result.memories).toEqual([syntheticMood]);
      expect(result.total).toBe(1);
    });

    it('does not fetch synthetic when core not in spaces', async () => {
      const service = createService(mockRegistry);
      await insertSpaceMemory();

      const result = await service.search({
        query: 'test',
        spaces: ['the_void'],
      });

      expect(mockRegistry.fetchAll).not.toHaveBeenCalled();
      expect(result.memories.length).toBe(1);
      expect((result.memories[0] as any).content).toBe('real memory content');
    });

    it('returns empty synthetic when no registry provided', async () => {
      const service = createService(); // no registry

      const result = await service.search({
        query: 'mood',
        spaces: ['core'],
        ghostCompositeId: ghostId,
      });

      expect(result.memories).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns empty synthetic when no ghostCompositeId provided', async () => {
      const service = createService(mockRegistry);

      const result = await service.search({
        query: 'mood',
        spaces: ['core'],
        // no ghostCompositeId
      });

      expect(mockRegistry.fetchAll).not.toHaveBeenCalled();
      expect(result.memories).toEqual([]);
    });
  });

  describe('publish() guard', () => {
    it('rejects publishing to core synthetic space', async () => {
      const service = createService(mockRegistry);

      await expect(service.publish({
        memory_id: 'mem-1',
        spaces: ['core'],
      })).rejects.toThrow(ValidationError);

      await expect(service.publish({
        memory_id: 'mem-1',
        spaces: ['core'],
      })).rejects.toThrow("Cannot publish to synthetic space 'core'");
    });

    it('rejects publishing when core is mixed with real spaces', async () => {
      const service = createService(mockRegistry);

      await expect(service.publish({
        memory_id: 'mem-1',
        spaces: ['the_void', 'core'],
      })).rejects.toThrow("Cannot publish to synthetic space 'core'");
    });
  });

  describe('retract() guard', () => {
    it('rejects retracting from core synthetic space', async () => {
      const service = createService(mockRegistry);

      await expect(service.retract({
        memory_id: 'mem-1',
        spaces: ['core'],
      })).rejects.toThrow(ValidationError);

      await expect(service.retract({
        memory_id: 'mem-1',
        spaces: ['core'],
      })).rejects.toThrow("Cannot retract from synthetic space 'core'");
    });
  });

  describe('byTime() with core space', () => {
    it('prepends synthetic results to time-sorted results', async () => {
      const service = createService(mockRegistry);
      await insertSpaceMemory({ created_at: '2026-03-12T00:00:00Z' });

      const result = await service.byTime({
        spaces: ['core', 'the_void'],
        ghostCompositeId: ghostId,
      });

      expect(result.memories[0]).toEqual(syntheticMood);
      expect(result.memories.length).toBeGreaterThanOrEqual(2);
    });

    it('returns only synthetic for core-only byTime', async () => {
      const service = createService(mockRegistry);

      const result = await service.byTime({
        spaces: ['core'],
        ghostCompositeId: ghostId,
      });

      expect(result.memories).toEqual([syntheticMood]);
      expect(result.total).toBe(1);
    });
  });

  describe('SYNTHETIC_SPACES constants', () => {
    it('exports from types', async () => {
      const { SYNTHETIC_SPACES, SYNTHETIC_SPACE_DESCRIPTIONS, SYNTHETIC_SPACE_DISPLAY_NAMES } = await import('../types/space.types');
      expect(SYNTHETIC_SPACES).toEqual(['core']);
      expect(SYNTHETIC_SPACE_DESCRIPTIONS.core).toContain('Internal state');
      expect(SYNTHETIC_SPACE_DISPLAY_NAMES.core).toBe('Core');
    });
  });
});
