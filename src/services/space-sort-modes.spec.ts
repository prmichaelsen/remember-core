import { SpaceService } from './space.service.js';
import { ConfirmationTokenService } from './confirmation-token.service.js';
import { ValidationError, ForbiddenError } from '../errors/app-errors.js';
import {
  createMockCollection,
  createMockWeaviateClient,
  createMockLogger,
} from '../testing/weaviate-mock.js';

// Mock Firestore
jest.mock('../database/firestore/init.js', () => ({
  addDocument: jest.fn(async () => ({ id: 'doc-1' })),
  updateDocument: jest.fn(async () => {}),
  queryDocuments: jest.fn(async () => []),
  getDocument: jest.fn(async () => null),
  setDocument: jest.fn(async () => {}),
}));

// Mock space-schema
jest.mock('../database/weaviate/space-schema.js', () => ({
  isValidSpaceId: (id: string) => ['the_void', 'dogs', 'cooking'].includes(id),
  ensurePublicCollection: jest.fn(async (client: any) => {
    return client.collections.get('Memory_spaces_public');
  }),
  PUBLIC_COLLECTION_NAME: 'Memory_spaces_public',
}));

// Mock space-config
jest.mock('./space-config.service.js', () => ({
  getSpaceConfig: jest.fn(async () => ({
    require_moderation: false,
    default_write_mode: 'owner_only',
  })),
  DEFAULT_SPACE_CONFIG: { require_moderation: false, default_write_mode: 'owner_only' },
}));

// Mock fetchMemoryWithAllProperties + ALL_MEMORY_PROPERTIES
jest.mock('../database/weaviate/client.js', () => ({
  fetchMemoryWithAllProperties: jest.fn(async (collection: any, id: string) => {
    return collection.query.fetchObjectById(id);
  }),
  ALL_MEMORY_PROPERTIES: [
    'content', 'title', 'tags', 'created_at', 'weight', 'content_type',
    'doc_type', 'rating_bayesian', 'rating_count', 'rating_sum',
    'feel_significance', 'functional_significance', 'total_significance',
    'relationship_count', 'user_id', 'trust', 'deleted_at',
  ],
}));

describe('SpaceService Sort Modes', () => {
  let weaviateClient: ReturnType<typeof createMockWeaviateClient>;
  let userCollection: ReturnType<typeof createMockCollection>;
  let logger: ReturnType<typeof createMockLogger>;
  let confirmationService: ConfirmationTokenService;
  let mockMemoryIndex: { index: jest.Mock; lookup: jest.Mock };
  let service: SpaceService;
  let spacesCollection: ReturnType<typeof createMockCollection>;
  const userId = 'test-user';

  beforeEach(() => {
    weaviateClient = createMockWeaviateClient();
    userCollection = createMockCollection();
    logger = createMockLogger();
    confirmationService = new ConfirmationTokenService(logger);
    mockMemoryIndex = { index: jest.fn().mockResolvedValue(undefined), lookup: jest.fn().mockResolvedValue(null) };
    service = new SpaceService(
      weaviateClient as any,
      userCollection as any,
      userId,
      confirmationService,
      logger,
      mockMemoryIndex as any,
    );
    // Register the spaces collection
    spacesCollection = createMockCollection();
    (weaviateClient as any)._collections.set('Memory_spaces_public', spacesCollection);
  });

  async function insertSpaceMemory(collection: ReturnType<typeof createMockCollection>, overrides: Record<string, any> = {}) {
    return collection.data.insert({
      properties: {
        user_id: userId,
        doc_type: 'memory',
        content: 'space memory content',
        content_type: 'note',
        title: 'Test',
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

  // ── Shared validation tests ──

  describe('shared validation', () => {
    it('throws ValidationError for invalid space IDs', async () => {
      await expect(
        service.byTime({ spaces: ['invalid_space'] }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for invalid group IDs', async () => {
      await expect(
        service.byTime({ groups: [''] }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for group IDs with dots', async () => {
      await expect(
        service.byTime({ groups: ['group.with.dots'] }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ForbiddenError for non-approved moderation filter without auth', async () => {
      await expect(
        service.byTime({ spaces: ['the_void'], moderation_filter: 'pending' }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // ── byTime ──

  describe('byTime', () => {
    it('sorts by created_at descending by default', async () => {
      await insertSpaceMemory(spacesCollection, { created_at: '2026-01-01T00:00:00Z', title: 'Old' });
      await insertSpaceMemory(spacesCollection, { created_at: '2026-03-01T00:00:00Z', title: 'New' });
      await insertSpaceMemory(spacesCollection, { created_at: '2026-02-01T00:00:00Z', title: 'Mid' });

      const result = await service.byTime({ spaces: ['the_void'] });
      expect(result.memories).toHaveLength(3);
      expect(result.memories[0].title).toBe('New');
      expect(result.memories[2].title).toBe('Old');
      expect(result.spaces_searched).toEqual(['the_void']);
    });

    it('sorts ascending when direction=asc', async () => {
      await insertSpaceMemory(spacesCollection, { created_at: '2026-01-01T00:00:00Z', title: 'Old' });
      await insertSpaceMemory(spacesCollection, { created_at: '2026-03-01T00:00:00Z', title: 'New' });

      const result = await service.byTime({ spaces: ['the_void'], direction: 'asc' });
      expect(result.memories[0].title).toBe('Old');
      expect(result.memories[1].title).toBe('New');
    });

    it('respects limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        await insertSpaceMemory(spacesCollection, { created_at: `2026-0${i + 1}-01T00:00:00Z`, title: `M${i}` });
      }

      const result = await service.byTime({ spaces: ['the_void'], limit: 2, offset: 1 });
      expect(result.memories).toHaveLength(2);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(1);
    });

    it('searches all_public when no spaces/groups specified', async () => {
      await insertSpaceMemory(spacesCollection, { created_at: '2026-01-01T00:00:00Z' });
      const result = await service.byTime({});
      expect(result.spaces_searched).toBe('all_public');
      expect(result.groups_searched).toEqual([]);
    });

    it('searches group collections', async () => {
      const groupCollection = createMockCollection();
      (weaviateClient as any)._collections.set('Memory_groups_mygroup', groupCollection);
      await insertSpaceMemory(groupCollection, { created_at: '2026-01-01T00:00:00Z', title: 'Group Memory' });

      const result = await service.byTime({ groups: ['mygroup'] });
      expect(result.groups_searched).toEqual(['mygroup']);
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].title).toBe('Group Memory');
    });

    it('skips non-existent group collections', async () => {
      const result = await service.byTime({ groups: ['nonexistent'] });
      expect(result.memories).toHaveLength(0);
      expect(result.groups_searched).toEqual(['nonexistent']);
    });
  });

  // ── byRating ──

  describe('byRating', () => {
    it('sorts by rating_bayesian descending by default', async () => {
      await insertSpaceMemory(spacesCollection, { rating_bayesian: 4.5, title: 'High' });
      await insertSpaceMemory(spacesCollection, { rating_bayesian: 2.0, title: 'Low' });
      await insertSpaceMemory(spacesCollection, { rating_bayesian: 3.5, title: 'Mid' });

      const result = await service.byRating({ spaces: ['the_void'] });
      expect(result.memories).toHaveLength(3);
      expect(result.memories[0].title).toBe('High');
      expect(result.memories[2].title).toBe('Low');
    });

    it('handles memories without rating_bayesian', async () => {
      await insertSpaceMemory(spacesCollection, { rating_bayesian: 4.0, title: 'Rated' });
      await insertSpaceMemory(spacesCollection, { title: 'Unrated' });

      const result = await service.byRating({ spaces: ['the_void'] });
      expect(result.memories).toHaveLength(2);
      // Rated should be first (desc), unrated defaults to 0
      expect(result.memories[0].title).toBe('Rated');
    });

    it('sorts ascending when direction=asc', async () => {
      await insertSpaceMemory(spacesCollection, { rating_bayesian: 4.5, title: 'High' });
      await insertSpaceMemory(spacesCollection, { rating_bayesian: 2.0, title: 'Low' });

      const result = await service.byRating({ spaces: ['the_void'], direction: 'asc' });
      expect(result.memories[0].title).toBe('Low');
    });
  });

  // ── byProperty ──

  describe('byProperty', () => {
    it('sorts by specified property', async () => {
      await insertSpaceMemory(spacesCollection, { weight: 0.9, title: 'Heavy' });
      await insertSpaceMemory(spacesCollection, { weight: 0.1, title: 'Light' });

      const result = await service.byProperty({
        spaces: ['the_void'],
        sort_field: 'weight',
        sort_direction: 'desc',
      });
      expect(result.memories[0].title).toBe('Heavy');
      expect(result.memories[1].title).toBe('Light');
      expect(result.sort_field).toBe('weight');
      expect(result.sort_direction).toBe('desc');
    });

    it('throws ValidationError for invalid sort_field', async () => {
      await expect(
        service.byProperty({
          spaces: ['the_void'],
          sort_field: 'invalid_field',
          sort_direction: 'desc',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('sorts string fields lexicographically', async () => {
      await insertSpaceMemory(spacesCollection, { content_type: 'poem', title: 'Poem' });
      await insertSpaceMemory(spacesCollection, { content_type: 'essay', title: 'Essay' });

      const result = await service.byProperty({
        spaces: ['the_void'],
        sort_field: 'content_type',
        sort_direction: 'asc',
      });
      expect(result.memories[0].content_type).toBe('essay');
      expect(result.memories[1].content_type).toBe('poem');
    });
  });

  // ── byBroad ──

  describe('byBroad', () => {
    it('returns truncated content with head/mid/tail', async () => {
      const longContent = 'A'.repeat(1000);
      await insertSpaceMemory(spacesCollection, { content: longContent });

      const result = await service.byBroad({ spaces: ['the_void'] });
      expect(result.results).toHaveLength(1);
      expect(result.results[0].content_head).toBeDefined();
      expect(result.results[0].content_mid).toBeDefined();
      expect(result.results[0].content_tail).toBeDefined();
      expect(result.results[0].memory_id).toBeDefined();
    });

    it('includes significance scores when present', async () => {
      await insertSpaceMemory(spacesCollection, {
        content: 'test',
        total_significance: 0.8,
        feel_significance: 0.7,
        functional_significance: 0.6,
      });

      const result = await service.byBroad({ spaces: ['the_void'] });
      expect(result.results[0].total_significance).toBe(0.8);
      expect(result.results[0].feel_significance).toBe(0.7);
      expect(result.results[0].functional_significance).toBe(0.6);
    });

    it('includes title when present', async () => {
      await insertSpaceMemory(spacesCollection, { content: 'test', title: 'My Title' });

      const result = await service.byBroad({ spaces: ['the_void'] });
      expect(result.results[0].title).toBe('My Title');
    });

    it('sorts by created_at descending by default', async () => {
      await insertSpaceMemory(spacesCollection, { created_at: '2026-01-01T00:00:00Z', content: 'Old' });
      await insertSpaceMemory(spacesCollection, { created_at: '2026-03-01T00:00:00Z', content: 'New' });

      const result = await service.byBroad({ spaces: ['the_void'] });
      expect(result.results[0].created_at).toBe('2026-03-01T00:00:00Z');
    });
  });

  // ── byRandom ──

  describe('byRandom', () => {
    it('returns random sample from pool', async () => {
      for (let i = 0; i < 10; i++) {
        await insertSpaceMemory(spacesCollection, { title: `M${i}` });
      }

      const result = await service.byRandom({ spaces: ['the_void'], limit: 3 });
      expect(result.results).toHaveLength(3);
      expect(result.total_pool_size).toBe(10);
    });

    it('returns all when limit exceeds pool size', async () => {
      await insertSpaceMemory(spacesCollection, { title: 'Only' });

      const result = await service.byRandom({ spaces: ['the_void'], limit: 10 });
      expect(result.results).toHaveLength(1);
      expect(result.total_pool_size).toBe(1);
    });

    it('returns empty for empty collection', async () => {
      const result = await service.byRandom({ spaces: ['the_void'] });
      expect(result.results).toHaveLength(0);
      expect(result.total_pool_size).toBe(0);
    });

    it('samples across multiple collections', async () => {
      const groupCollection = createMockCollection();
      (weaviateClient as any)._collections.set('Memory_groups_mygroup', groupCollection);

      for (let i = 0; i < 5; i++) {
        await insertSpaceMemory(spacesCollection, { title: `Space${i}` });
      }
      for (let i = 0; i < 5; i++) {
        await insertSpaceMemory(groupCollection, { title: `Group${i}` });
      }

      const result = await service.byRandom({ spaces: ['the_void'], groups: ['mygroup'], limit: 8 });
      expect(result.results).toHaveLength(8);
      expect(result.total_pool_size).toBe(10);
    });
  });

  // ── Cross-collection tests ──

  describe('cross-collection', () => {
    it('merges results from spaces and groups', async () => {
      const groupCollection = createMockCollection();
      (weaviateClient as any)._collections.set('Memory_groups_mygroup', groupCollection);

      await insertSpaceMemory(spacesCollection, { created_at: '2026-03-01T00:00:00Z', title: 'SpaceMem' });
      await insertSpaceMemory(groupCollection, { created_at: '2026-02-01T00:00:00Z', title: 'GroupMem' });

      const result = await service.byTime({ spaces: ['the_void'], groups: ['mygroup'] });
      expect(result.memories).toHaveLength(2);
      expect(result.spaces_searched).toEqual(['the_void']);
      expect(result.groups_searched).toEqual(['mygroup']);
      // SpaceMem (March) should come before GroupMem (Feb) in desc order
      expect(result.memories[0].title).toBe('SpaceMem');
      expect(result.memories[1].title).toBe('GroupMem');
    });

    it('excludes non-memory documents', async () => {
      await spacesCollection.data.insert({
        properties: {
          doc_type: 'relationship',
          content: 'not a memory',
          space_ids: ['the_void'],
          moderation_status: 'approved',
          created_at: '2026-01-01T00:00:00Z',
        },
      });
      await insertSpaceMemory(spacesCollection, { created_at: '2026-01-01T00:00:00Z' });

      const result = await service.byTime({ spaces: ['the_void'] });
      expect(result.memories).toHaveLength(1);
    });
  });
});
