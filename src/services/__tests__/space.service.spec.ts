import { SpaceService } from '../space.service.js';
import { ConfirmationTokenService } from '../confirmation-token.service.js';
import { createMockModerationClient, type ModerationClient } from '../moderation.service.js';
import { ValidationError } from '../../errors/app-errors.js';
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

// Mock ensureGroupCollection (no-op — mock client auto-creates collections)
jest.mock('../../database/weaviate/v2-collections.js', () => ({
  ...jest.requireActual('../../database/weaviate/v2-collections.js'),
  ensureGroupCollection: jest.fn(async () => {}),
}));

describe('SpaceService', () => {
  let weaviateClient: ReturnType<typeof createMockWeaviateClient>;
  let userCollection: ReturnType<typeof createMockCollection>;
  let logger: ReturnType<typeof createMockLogger>;
  let confirmationService: ConfirmationTokenService;
  let mockMemoryIndex: { index: jest.Mock; lookup: jest.Mock };
  let service: SpaceService;
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

    it('rejects publish if original_memory_id already published by another user', async () => {
      const memoryId = await insertUserMemory();

      // Pre-populate the public collection with a memory having the same original_memory_id
      // but published by a different user (different composite ID → different weaviate UUID)
      const publicCollection = weaviateClient.collections.get('Memory_spaces_public');
      await publicCollection.data.insert({
        id: 'other-user-weaviate-id',
        properties: {
          original_memory_id: memoryId,
          author_id: 'other-user',
          composite_id: `other-user.${memoryId}`,
          space_ids: ['the_void'],
          group_ids: [],
        },
      });

      // Phase 1: get token (should succeed — validation happens at confirm)
      const { token } = await service.publish({
        memory_id: memoryId,
        spaces: ['the_void'],
      });

      // Phase 2: confirm should reject due to duplicate original_memory_id
      await expect(service.confirm({ token })).rejects.toThrow(
        'already published by another user',
      );
    });

    it('allows re-publish by the same user (update flow)', async () => {
      const memoryId = await insertUserMemory();

      // First publish
      const { token: token1 } = await service.publish({
        memory_id: memoryId,
        spaces: ['the_void'],
      });
      const result1 = await service.confirm({ token: token1 });
      expect(result1.success).toBe(true);

      // Second publish to another space by same user should succeed
      const { token: token2 } = await service.publish({
        memory_id: memoryId,
        spaces: ['the_void', 'dogs'],
      });
      const result2 = await service.confirm({ token: token2 });
      expect(result2.success).toBe(true);
    });

    it('indexes published memory UUID in memory index', async () => {
      const memoryId = await insertUserMemory();

      const { token } = await service.publish({
        memory_id: memoryId,
        spaces: ['the_void'],
      });
      await service.confirm({ token });

      expect(mockMemoryIndex.index).toHaveBeenCalledWith(
        expect.any(String), // weaviateId (UUID v5 of composite ID)
        'Memory_spaces_public',
      );
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

  describe('content moderation', () => {
    let moderatedService: SpaceService;
    let blockingClient: ModerationClient;

    beforeEach(() => {
      blockingClient = createMockModerationClient({
        pass: false,
        reason: 'Contains explicit hate speech',
        category: 'hate_speech',
      });
    });

    function createServiceWithModeration(client: ModerationClient) {
      return new SpaceService(
        weaviateClient as any,
        userCollection as any,
        userId,
        confirmationService,
        logger,
        mockMemoryIndex as any,
        { moderationClient: client },
      );
    }

    it('publish succeeds when moderation passes', async () => {
      moderatedService = createServiceWithModeration(createMockModerationClient());
      const memoryId = await insertUserMemory();
      const result = await moderatedService.publish({
        memory_id: memoryId,
        spaces: ['the_void'],
      });
      expect(result.token).toBeDefined();
    });

    it('publish throws ValidationError when moderation blocks', async () => {
      moderatedService = createServiceWithModeration(blockingClient);
      const memoryId = await insertUserMemory();

      await expect(
        moderatedService.publish({ memory_id: memoryId, spaces: ['the_void'] }),
      ).rejects.toThrow(ValidationError);

      try {
        await moderatedService.publish({ memory_id: memoryId, spaces: ['the_void'] });
      } catch (e) {
        const err = e as ValidationError;
        expect(err.message).toBe('Contains explicit hate speech');
        expect(err.fields.moderation).toEqual(['blocked']);
        expect(err.fields.category).toEqual(['hate_speech']);
      }
    });

    it('revise succeeds when moderation passes', async () => {
      moderatedService = createServiceWithModeration(createMockModerationClient());
      const memoryId = await insertUserMemory({ space_ids: ['the_void'] });
      const result = await moderatedService.revise({ memory_id: memoryId });
      expect(result.token).toBeDefined();
    });

    it('revise throws ValidationError when moderation blocks', async () => {
      moderatedService = createServiceWithModeration(blockingClient);
      const memoryId = await insertUserMemory({ space_ids: ['the_void'] });

      await expect(
        moderatedService.revise({ memory_id: memoryId }),
      ).rejects.toThrow(ValidationError);
    });

    it('publish works normally without moderationClient', async () => {
      // Default service has no moderationClient
      const memoryId = await insertUserMemory();
      const result = await service.publish({
        memory_id: memoryId,
        spaces: ['the_void'],
      });
      expect(result.token).toBeDefined();
    });

    it('revise works normally without moderationClient', async () => {
      const memoryId = await insertUserMemory({ space_ids: ['the_void'] });
      const result = await service.revise({ memory_id: memoryId });
      expect(result.token).toBeDefined();
    });
  });

  // ─── Comment publish: parentOwnerId resolution ──────────────────────

  describe('comment publish — parentOwnerId resolution', () => {
    let mockEventBus: { emit: jest.Mock };
    let serviceWithEvents: SpaceService;

    beforeEach(() => {
      mockEventBus = { emit: jest.fn().mockResolvedValue(undefined) };
      serviceWithEvents = new SpaceService(
        weaviateClient as any,
        userCollection as any,
        userId,
        confirmationService,
        logger,
        mockMemoryIndex as any,
        { eventBus: mockEventBus },
      );
    });

    async function insertComment(parentId: string, overrides: Record<string, any> = {}) {
      return userCollection.data.insert({
        properties: {
          user_id: userId,
          doc_type: 'memory',
          content_type: 'comment',
          content: 'Great memory!',
          title: '',
          tags: [],
          space_ids: [],
          group_ids: [],
          deleted_at: null,
          parent_id: parentId,
          thread_root_id: parentId,
          ...overrides,
        },
      });
    }

    async function publishAndConfirm(memoryId: string, opts: { spaces?: string[]; groups?: string[] }) {
      const { token } = await serviceWithEvents.publish({
        memory_id: memoryId,
        ...opts,
      });
      return serviceWithEvents.confirm({ token });
    }

    it('resolves parentOwnerId from parent memory user_id (different owner)', async () => {
      // Parent memory owned by another user, stored in commenter's collection
      const parentId = await userCollection.data.insert({
        properties: {
          user_id: 'other-user',
          doc_type: 'memory',
          content_type: 'note',
          content: 'Original memory',
          title: 'Parent',
          tags: [],
          space_ids: ['the_void'],
          group_ids: [],
          deleted_at: null,
        },
      });

      const commentId = await insertComment(parentId);
      await publishAndConfirm(commentId, { spaces: ['the_void'] });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'comment.published_to_space',
          parent_owner_id: 'other-user',
        }),
        expect.any(Object),
      );
    });

    it('resolves parentOwnerId as self when commenter owns parent', async () => {
      const parentId = await insertUserMemory({
        space_ids: ['the_void'],
      });

      const commentId = await insertComment(parentId);
      await publishAndConfirm(commentId, { spaces: ['the_void'] });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'comment.published_to_space',
          parent_owner_id: userId,
        }),
        expect.any(Object),
      );
    });

    it('falls back to public collection author_id when parent not in user collection', async () => {
      const parentId = 'nonexistent-parent';

      // Put the parent in the public collection with author_id
      const publicCollection = weaviateClient.collections.get('Memory_spaces_public');
      await publicCollection.data.insert({
        properties: {
          original_memory_id: parentId,
          author_id: 'public-author',
          composite_id: `public-author.${parentId}`,
          space_ids: ['the_void'],
          group_ids: [],
          doc_type: 'memory',
          content_type: 'note',
          deleted_at: null,
          moderation_status: 'approved',
        },
      });

      const commentId = await insertComment(parentId);
      await publishAndConfirm(commentId, { spaces: ['the_void'] });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'comment.published_to_space',
          parent_owner_id: 'public-author',
        }),
        expect.any(Object),
      );
    });

    it('resolves parentOwnerId by direct UUID fetch from public collection (published copy ID as parent_id)', async () => {
      // Simulate the real-world case: client passes the published copy's UUID as parent_id,
      // NOT the original_memory_id. The direct fetchObjectById should find it.
      const publishedCopyUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

      const publicCollection = weaviateClient.collections.get('Memory_spaces_public');
      await publicCollection.data.insert({
        id: publishedCopyUuid, // This IS the object's UUID
        properties: {
          original_memory_id: 'some-other-original-id', // Different from parentId
          author_id: 'published-copy-author',
          composite_id: `published-copy-author.some-other-original-id`,
          space_ids: ['the_void'],
          group_ids: [],
          doc_type: 'memory',
          content_type: 'note',
          deleted_at: null,
          moderation_status: 'approved',
        },
      });

      const commentId = await insertComment(publishedCopyUuid);
      await publishAndConfirm(commentId, { spaces: ['the_void'] });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'comment.published_to_space',
          parent_owner_id: 'published-copy-author',
        }),
        expect.any(Object),
      );
    });

    it('falls back to group collection author_id when not in user or public collection', async () => {
      const parentId = 'nonexistent-parent-2';
      const groupId = 'cooking';

      // Put the parent only in the group collection
      const groupCollection = weaviateClient.collections.get(`Memory_groups_${groupId}`);
      await groupCollection.data.insert({
        properties: {
          original_memory_id: parentId,
          author_id: 'group-author',
          composite_id: `group-author.${parentId}`,
          space_ids: [],
          group_ids: [groupId],
          doc_type: 'memory',
          content_type: 'note',
          deleted_at: null,
          moderation_status: 'approved',
        },
      });

      const commentId = await insertComment(parentId, { group_ids: [] });
      await publishAndConfirm(commentId, { groups: [groupId] });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'comment.published_to_group',
          parent_owner_id: 'group-author',
        }),
        expect.any(Object),
      );
    });

    it('skips comment webhook when parent not found anywhere', async () => {
      const parentId = 'totally-missing-parent';

      const commentId = await insertComment(parentId);
      await publishAndConfirm(commentId, { spaces: ['the_void'] });

      // Should NOT emit any comment event — parentOwnerId is empty
      const commentEvents = mockEventBus.emit.mock.calls.filter(
        (c: any[]) => c[0].type.startsWith('comment.'),
      );
      expect(commentEvents).toHaveLength(0);

      // Should log a warning
      expect(logger.warn).toHaveBeenCalledWith(
        'Skipping comment webhook — could not resolve parent_owner_id',
        expect.objectContaining({ parentId }),
      );
    });

    it('emits correct content_preview from comment content', async () => {
      const parentId = await insertUserMemory({ space_ids: ['the_void'] });
      const commentId = await insertComment(parentId, { content: 'This is my comment text' });
      await publishAndConfirm(commentId, { spaces: ['the_void'] });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'comment.published_to_space',
          content_preview: 'This is my comment text',
          owner_id: userId,
        }),
        expect.any(Object),
      );
    });

    it('does not emit comment events for non-comment memories', async () => {
      const memoryId = await insertUserMemory();
      await publishAndConfirm(memoryId, { spaces: ['the_void'] });

      // Should emit memory.published_to_space, not comment.*
      const emittedTypes = mockEventBus.emit.mock.calls.map((c: any[]) => c[0].type);
      expect(emittedTypes).toContain('memory.published_to_space');
      expect(emittedTypes).not.toContain('comment.published_to_space');
    });
  });
});
