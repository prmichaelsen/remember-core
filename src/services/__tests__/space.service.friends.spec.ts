/**
 * SpaceService — Friends Collection Tests
 *
 * Comprehensive test suite for friends collection features covering
 * publish/retract/revise/search operations, validation, tracking, and
 * full lifecycle flows.
 */

import { SpaceService } from '../space.service.js';
import { ConfirmationTokenService } from '../confirmation-token.service.js';
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
  isValidSpaceId: (id: string) => ['general', 'the_void', 'dogs', 'cooking'].includes(id),
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

// Mock ensureGroupCollection and ensureFriendsCollection
jest.mock('../../database/weaviate/v2-collections.js', () => ({
  ...jest.requireActual('../../database/weaviate/v2-collections.js'),
  ensureGroupCollection: jest.fn(async () => {}),
  ensureFriendsCollection: jest.fn(async () => {}),
}));

describe('SpaceService — Friends Collections', () => {
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
    mockMemoryIndex = {
      index: jest.fn().mockResolvedValue(undefined),
      lookup: jest.fn().mockResolvedValue(null),
    };
    service = new SpaceService(
      weaviateClient as any,
      userCollection as any,
      userId,
      confirmationService,
      logger,
      mockMemoryIndex as any,
    );
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
        published_to_friends: false,
        deleted_at: null,
        ...overrides,
      },
    });
  }

  // ── Publish to Friends ──────────────────────────────────────────────

  describe('publish to friends', () => {
    it('generates confirmation token for friends: true', async () => {
      const memoryId = await insertUserMemory();
      const result = await service.publish({
        memory_id: memoryId,
        friends: true,
      });
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
    });

    it('throws if no destinations (friends: false, no spaces, no groups)', async () => {
      const memoryId = await insertUserMemory();
      await expect(
        service.publish({
          memory_id: memoryId,
          friends: false,
        }),
      ).rejects.toThrow('Must specify at least one space, group, or friends target to publish to');
    });

    it('executes publish to friends collection', async () => {
      const memoryId = await insertUserMemory();

      const { token } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });

      const result = await service.confirm({ token });
      expect(result.success).toBe(true);
      expect(result.action).toBe('publish_memory');
      expect(result.published_to_friends).toBe(true);

      // Verify source memory tracking updated
      const source = userCollection._store.get(memoryId);
      expect(source!.properties.published_to_friends).toBe(true);
    });

    it('updates source memory published_to_friends: true', async () => {
      const memoryId = await insertUserMemory();

      const { token } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });

      await service.confirm({ token });

      const memory = userCollection._store.get(memoryId);
      expect(memory!.properties.published_to_friends).toBe(true);
    });

    it('indexes published memory in friends collection', async () => {
      const memoryId = await insertUserMemory();

      const { token } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });

      await service.confirm({ token });

      expect(mockMemoryIndex.index).toHaveBeenCalledWith(
        expect.any(String),
        `Memory_friends_${userId}`,
      );
    });

    it('returns published_to_friends: true in ConfirmResult', async () => {
      const memoryId = await insertUserMemory();

      const { token } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });

      const result = await service.confirm({ token });
      expect(result.published_to_friends).toBe(true);
    });

    it('publishes to spaces AND friends simultaneously', async () => {
      const memoryId = await insertUserMemory();

      const { token } = await service.publish({
        memory_id: memoryId,
        spaces: ['general'],
        friends: true,
      });

      const result = await service.confirm({ token });
      expect(result.success).toBe(true);
      expect(result.space_ids).toEqual(['general']);
      expect(result.published_to_friends).toBe(true);
    });

    it('publishes to groups AND friends simultaneously', async () => {
      const memoryId = await insertUserMemory();

      const { token } = await service.publish({
        memory_id: memoryId,
        groups: ['group-1'],
        friends: true,
      });

      const result = await service.confirm({ token });
      expect(result.success).toBe(true);
      expect(result.group_ids).toEqual(['group-1']);
      expect(result.published_to_friends).toBe(true);
    });
  });

  // ── Retract from Friends ────────────────────────────────────────────

  describe('retract from friends', () => {
    it('generates confirmation token for friends: true', async () => {
      const memoryId = await insertUserMemory({ published_to_friends: true });
      const result = await service.retract({
        memory_id: memoryId,
        friends: true,
      });
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
    });

    it('throws if memory not published to friends', async () => {
      const memoryId = await insertUserMemory({ published_to_friends: false });
      await expect(
        service.retract({
          memory_id: memoryId,
          friends: true,
        }),
      ).rejects.toThrow('Memory is not published to some destinations you want to retract from');
    });

    it('executes retract from friends collection', async () => {
      const memoryId = await insertUserMemory();

      // First publish
      const { token: publishToken } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });
      await service.confirm({ token: publishToken });

      // Then retract
      const { token: retractToken } = await service.retract({
        memory_id: memoryId,
        friends: true,
      });

      const result = await service.confirm({ token: retractToken });
      expect(result.success).toBe(true);
      expect(result.action).toBe('retract_memory');
      expect(result.published_to_friends).toBe(false);

      // Verify source memory tracking updated
      const source = userCollection._store.get(memoryId);
      expect(source!.properties.published_to_friends).toBe(false);
    });

    it('updates source memory published_to_friends: false', async () => {
      const memoryId = await insertUserMemory();

      // Publish first
      const { token: publishToken } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });
      await service.confirm({ token: publishToken });

      // Retract
      const { token: retractToken } = await service.retract({
        memory_id: memoryId,
        friends: true,
      });
      await service.confirm({ token: retractToken });

      const memory = userCollection._store.get(memoryId);
      expect(memory!.properties.published_to_friends).toBe(false);
    });

    it('handles partial retract (retract from spaces but not friends)', async () => {
      const memoryId = await insertUserMemory();

      // Publish to both
      const { token: publishToken } = await service.publish({
        memory_id: memoryId,
        spaces: ['general'],
        friends: true,
      });
      await service.confirm({ token: publishToken });

      // Retract from spaces only
      const { token: retractToken } = await service.retract({
        memory_id: memoryId,
        spaces: ['general'],
      });
      const result = await service.confirm({ token: retractToken });

      expect(result.space_ids).toEqual([]);
      expect(result.published_to_friends).toBe(true); // Still published to friends
    });

    it('handles partial retract (retract from friends but not spaces)', async () => {
      const memoryId = await insertUserMemory();

      // Publish to both
      const { token: publishToken } = await service.publish({
        memory_id: memoryId,
        spaces: ['general'],
        friends: true,
      });
      await service.confirm({ token: publishToken });

      // Retract from friends only
      const { token: retractToken } = await service.retract({
        memory_id: memoryId,
        friends: true,
      });
      const result = await service.confirm({ token: retractToken });

      expect(result.space_ids).toEqual(['general']); // Still in spaces
      expect(result.published_to_friends).toBe(false);
    });
  });

  // ── Revise in Friends ───────────────────────────────────────────────

  describe('revise in friends', () => {
    it('generates confirmation token when published to friends', async () => {
      const memoryId = await insertUserMemory({ published_to_friends: true });
      const result = await service.revise({ memory_id: memoryId });
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
    });

    it('throws if memory not published anywhere', async () => {
      const memoryId = await insertUserMemory({
        published_to_friends: false,
        space_ids: [],
        group_ids: [],
      });
      await expect(
        service.revise({ memory_id: memoryId }),
      ).rejects.toThrow('Memory has no published copies to revise');
    });

    it('executes revise in friends collection', async () => {
      const memoryId = await insertUserMemory({ content: 'original content' });

      // First publish
      const { token: publishToken } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });
      await service.confirm({ token: publishToken });

      // Update content
      const memory = userCollection._store.get(memoryId);
      memory!.properties.content = 'updated content';

      // Revise
      const { token } = await service.revise({ memory_id: memoryId });
      const result = await service.confirm({ token });

      expect(result.success).toBe(true);
      expect(result.action).toBe('revise_memory');
    });

    it('updates content correctly in friends collection', async () => {
      const memoryId = await insertUserMemory({ content: 'original content' });
      const friendsCollectionName = `Memory_friends_${userId}`;
      const friendsCollection = weaviateClient.collections.get(friendsCollectionName);

      // Publish
      const { token: publishToken } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });
      await service.confirm({ token: publishToken });

      // Update content in source
      const memory = userCollection._store.get(memoryId);
      memory!.properties.content = 'revised content';

      // Revise
      const { token: reviseToken } = await service.revise({ memory_id: memoryId });
      await service.confirm({ token: reviseToken });

      // Check friends collection has updated content
      const published = Array.from(friendsCollection._store.values())[0];
      expect(published.properties.content).toBe('revised content');
    });
  });

  // ── Search in Friends Collections ───────────────────────────────────

  describe('search in friends collections', () => {
    it('throws for invalid friend user ID (contains dot)', async () => {
      await expect(
        service.search({ query: 'test', friends: ['invalid.user'] }),
      ).rejects.toThrow('Friend user IDs cannot be empty or contain dots');
    });

    it('throws for empty friend user ID', async () => {
      await expect(
        service.search({ query: 'test', friends: [''] }),
      ).rejects.toThrow('Friend user IDs cannot be empty or contain dots');
    });

    it('searches single friend\'s collection', async () => {
      const friend1 = 'friend-user-1';

      // Setup friend collection
      const friend1Collection = weaviateClient.collections.get(`Memory_friends_${friend1}`);
      await friend1Collection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'friend 1 memory',
          deleted_at: null,
          moderation_status: 'approved',
          content_type: 'note',
        },
      });

      const result = await service.search({
        query: 'memory',
        friends: [friend1],
      });

      expect(result.friends_searched).toEqual([friend1]);
      expect(result.spaces_searched).toEqual([]);
      expect(result.groups_searched).toEqual([]);
    });

    it('searches multiple friends collections', async () => {
      const friend1 = 'friend-user-1';
      const friend2 = 'friend-user-2';

      // Setup friend collections
      const friend1Collection = weaviateClient.collections.get(`Memory_friends_${friend1}`);
      const friend2Collection = weaviateClient.collections.get(`Memory_friends_${friend2}`);

      await friend1Collection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'friend 1 memory',
          deleted_at: null,
          moderation_status: 'approved',
          content_type: 'note',
        },
      });

      await friend2Collection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'friend 2 memory',
          deleted_at: null,
          moderation_status: 'approved',
          content_type: 'note',
        },
      });

      const result = await service.search({
        query: 'memory',
        friends: [friend1, friend2],
      });

      expect(result.friends_searched).toEqual([friend1, friend2]);
      expect(result.spaces_searched).toEqual([]);
      expect(result.groups_searched).toEqual([]);
    });

    it('returns friends_searched array', async () => {
      const result = await service.search({
        query: 'test',
        friends: ['friend-1', 'friend-2'],
      });

      expect(result.friends_searched).toEqual(['friend-1', 'friend-2']);
    });

    it('searches spaces AND friends together', async () => {
      const friend1 = 'friend-user-1';
      const spacesCollection = weaviateClient.collections.get('Memory_spaces_public');
      const friend1Collection = weaviateClient.collections.get(`Memory_friends_${friend1}`);

      await spacesCollection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'space memory',
          space_ids: ['general'],
          deleted_at: null,
          moderation_status: 'approved',
          content_type: 'note',
        },
      });

      await friend1Collection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'friend memory',
          deleted_at: null,
          moderation_status: 'approved',
          content_type: 'note',
        },
      });

      const result = await service.search({
        query: 'memory',
        spaces: ['general'],
        friends: [friend1],
      });

      expect(result.spaces_searched).toEqual(['general']);
      expect(result.friends_searched).toEqual([friend1]);
    });

    it('skips nonexistent collections gracefully', async () => {
      const result = await service.search({
        query: 'test',
        friends: ['nonexistent-friend'],
      });

      expect(result.friends_searched).toEqual(['nonexistent-friend']);
      expect(result.memories).toEqual([]);
    });

    it('does not search public when only friends specified', async () => {
      const spacesCollection = weaviateClient.collections.get('Memory_spaces_public');
      await spacesCollection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'public memory',
          space_ids: ['general'],
          deleted_at: null,
          moderation_status: 'approved',
          content_type: 'note',
        },
      });

      const result = await service.search({
        query: 'memory',
        friends: ['friend-1'],
      });

      expect(result.spaces_searched).toEqual([]);
      expect(result.friends_searched).toEqual(['friend-1']);
    });

    it('applies content_type filter correctly', async () => {
      const friend1 = 'friend-user-1';
      const friend1Collection = weaviateClient.collections.get(`Memory_friends_${friend1}`);

      await friend1Collection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'note memory',
          content_type: 'note',
          deleted_at: null,
          moderation_status: 'approved',
        },
      });

      await friend1Collection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'image memory',
          content_type: 'image',
          deleted_at: null,
          moderation_status: 'approved',
        },
      });

      const result = await service.search({
        query: 'memory',
        friends: [friend1],
        content_type: 'note',
      }, { credentials: { friend_user_ids: [friend1] } } as any);

      expect(result.memories.length).toBe(1);
      expect(result.memories[0].content_type).toBe('note');
    });

    it('applies tags filter correctly', async () => {
      const friend1 = 'friend-user-1';
      const friend1Collection = weaviateClient.collections.get(`Memory_friends_${friend1}`);

      await friend1Collection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'work memory',
          tags: ['work'],
          deleted_at: null,
          moderation_status: 'approved',
          content_type: 'note',
        },
      });

      await friend1Collection.data.insert({
        properties: {
          doc_type: 'memory',
          content: 'personal memory',
          tags: ['personal'],
          deleted_at: null,
          moderation_status: 'approved',
          content_type: 'note',
        },
      });

      const result = await service.search({
        query: 'memory',
        friends: [friend1],
        tags: ['work'],
      }, { credentials: { friend_user_ids: [friend1] } } as any);

      expect(result.memories.length).toBe(1);
      expect(result.memories[0].tags).toContain('work');
    });
  });

  // ── Tracking and State Management ───────────────────────────────────

  describe('tracking and state management', () => {
    it('initializes published_to_friends: false', async () => {
      const memoryId = await insertUserMemory();
      const memory = userCollection._store.get(memoryId);
      expect(memory!.properties.published_to_friends).toBe(false);
    });

    it('updates to true after publish', async () => {
      const memoryId = await insertUserMemory();

      const { token } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });
      await service.confirm({ token });

      const memory = userCollection._store.get(memoryId);
      expect(memory!.properties.published_to_friends).toBe(true);
    });

    it('updates to false after retract', async () => {
      const memoryId = await insertUserMemory();

      // Publish
      const { token: publishToken } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });
      await service.confirm({ token: publishToken });

      // Retract
      const { token: retractToken } = await service.retract({
        memory_id: memoryId,
        friends: true,
      });
      await service.confirm({ token: retractToken });

      const memory = userCollection._store.get(memoryId);
      expect(memory!.properties.published_to_friends).toBe(false);
    });

    it('maintains state alongside space_ids and group_ids', async () => {
      const memoryId = await insertUserMemory();

      const { token } = await service.publish({
        memory_id: memoryId,
        spaces: ['general'],
        groups: ['group-1'],
        friends: true,
      });
      await service.confirm({ token });

      const memory = userCollection._store.get(memoryId);
      expect(memory!.properties.space_ids).toEqual(['general']);
      expect(memory!.properties.group_ids).toEqual(['group-1']);
      expect(memory!.properties.published_to_friends).toBe(true);
    });

    it('handles simultaneous operations (spaces + groups + friends)', async () => {
      const memoryId = await insertUserMemory();

      const { token: publishToken } = await service.publish({
        memory_id: memoryId,
        spaces: ['general'],
        groups: ['group-1'],
        friends: true,
      });
      const publishResult = await service.confirm({ token: publishToken });

      expect(publishResult.space_ids).toEqual(['general']);
      expect(publishResult.group_ids).toEqual(['group-1']);
      expect(publishResult.published_to_friends).toBe(true);

      // Retract from all
      const { token: retractToken } = await service.retract({
        memory_id: memoryId,
        spaces: ['general'],
        groups: ['group-1'],
        friends: true,
      });
      const retractResult = await service.confirm({ token: retractToken });

      expect(retractResult.space_ids).toEqual([]);
      expect(retractResult.group_ids).toEqual([]);
      expect(retractResult.published_to_friends).toBe(false);
    });
  });

  // ── Full Lifecycle Integration ──────────────────────────────────────

  describe('friends collection lifecycle', () => {
    it('complete publish → search → retract flow', async () => {
      const memoryId = await insertUserMemory({ content: 'lifecycle test' });

      // 1. Publish
      const { token: publishToken } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });
      await service.confirm({ token: publishToken });

      // 2. Search
      const searchResult = await service.search({
        query: 'lifecycle',
        friends: [userId], // Search my own friends collection
      });
      expect(searchResult.friends_searched).toEqual([userId]);

      // 3. Retract
      const { token: retractToken } = await service.retract({
        memory_id: memoryId,
        friends: true,
      });
      await service.confirm({ token: retractToken });

      // 4. Verify source memory cleared
      const memory = userCollection._store.get(memoryId);
      expect(memory!.properties.published_to_friends).toBe(false);
    });

    it('publish to multiple targets → retract from one → verify others remain', async () => {
      const memoryId = await insertUserMemory();

      // Publish to all
      const { token: publishToken } = await service.publish({
        memory_id: memoryId,
        spaces: ['general'],
        groups: ['group-1'],
        friends: true,
      });
      await service.confirm({ token: publishToken });

      // Retract from friends only
      const { token: retractToken } = await service.retract({
        memory_id: memoryId,
        friends: true,
      });
      const result = await service.confirm({ token: retractToken });

      expect(result.space_ids).toEqual(['general']);
      expect(result.group_ids).toEqual(['group-1']);
      expect(result.published_to_friends).toBe(false);
    });

    it('publish → revise → search → verify updated content', async () => {
      const memoryId = await insertUserMemory({ content: 'original' });
      const friendsCollectionName = `Memory_friends_${userId}`;
      const friendsCollection = weaviateClient.collections.get(friendsCollectionName);

      // Publish
      const { token: publishToken } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });
      await service.confirm({ token: publishToken });

      // Update and revise
      const memory = userCollection._store.get(memoryId);
      memory!.properties.content = 'revised';
      const { token: reviseToken } = await service.revise({ memory_id: memoryId });
      await service.confirm({ token: reviseToken });

      // Search and verify
      const searchResult = await service.search({
        query: 'revised',
        friends: [userId],
      });
      expect(searchResult.memories[0]?.content).toBe('revised');
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('retract when not published (validation error)', async () => {
      const memoryId = await insertUserMemory({ published_to_friends: false });
      await expect(
        service.retract({
          memory_id: memoryId,
          friends: true,
        }),
      ).rejects.toThrow('Memory is not published to some destinations you want to retract from');
    });

    it('search empty friends array (searches public)', async () => {
      const result = await service.search({
        query: 'test',
        friends: [],
      });

      expect(result.friends_searched).toEqual([]);
      expect(result.spaces_searched).toBe('all_public');
    });

    it('search with 50 friends (bounded fanout acceptable)', async () => {
      const friends = Array.from({ length: 50 }, (_, i) => `friend-${i}`);

      const result = await service.search({
        query: 'test',
        friends,
      });

      expect(result.friends_searched).toEqual(friends);
    });

    it('handles missing friends collection gracefully', async () => {
      const result = await service.search({
        query: 'test',
        friends: ['friend-without-collection'],
      });

      // Should not throw, returns empty results
      expect(result.friends_searched).toEqual(['friend-without-collection']);
      expect(result.memories).toEqual([]);
    });

    it('revise succeeds when published to friends even without spaces/groups', async () => {
      const memoryId = await insertUserMemory({
        content: 'original',
        space_ids: [],
        group_ids: [],
      });

      // Publish to friends only
      const { token: publishToken } = await service.publish({
        memory_id: memoryId,
        friends: true,
      });
      await service.confirm({ token: publishToken });

      // Update content
      const memory = userCollection._store.get(memoryId);
      memory!.properties.content = 'revised';

      // Revise should succeed
      const { token: reviseToken } = await service.revise({ memory_id: memoryId });
      const result = await service.confirm({ token: reviseToken });

      expect(result.success).toBe(true);
    });
  });
});
