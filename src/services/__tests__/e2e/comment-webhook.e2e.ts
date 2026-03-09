/**
 * Integration test: Comment publish → webhook parentOwnerId resolution.
 *
 * Exercises the full flow: create memory → create comment → publish comment →
 * verify emitted webhook has correct parent_owner_id.
 */

// Module mocks must be before imports
jest.mock('../../../database/weaviate/space-schema.js', () => ({
  isValidSpaceId: (id: string) => ['the_void'].includes(id),
  ensurePublicCollection: jest.fn(async (client: any) => client.collections.get('Memory_spaces_public')),
  PUBLIC_COLLECTION_NAME: 'Memory_spaces_public',
}));
jest.mock('../../space-config.service.js', () => ({
  getSpaceConfig: jest.fn(async () => ({ require_moderation: false, default_write_mode: 'owner_only' })),
  DEFAULT_SPACE_CONFIG: { require_moderation: false, default_write_mode: 'owner_only' },
}));
jest.mock('../../../database/weaviate/client.js', () => ({
  fetchMemoryWithAllProperties: jest.fn(async (collection: any, id: string) => collection.query.fetchObjectById(id)),
}));
jest.mock('../../../database/weaviate/v2-collections.js', () => ({
  ...jest.requireActual('../../../database/weaviate/v2-collections.js'),
  ensureGroupCollection: jest.fn(async () => {}),
}));

import { MemoryService } from '../../memory.service.js';
import { SpaceService } from '../../space.service.js';
import type { ConfirmationTokenService, ConfirmationRequest } from '../../confirmation-token.service.js';
import type { EventBus, WebhookEventData, WebhookActor } from '../../../webhooks/events.js';
import { createMockCollection, createMockWeaviateClient, createMockLogger } from '../../../testing/weaviate-mock.js';
import { randomUUID } from 'crypto';

function createMockConfirmationTokenService(): ConfirmationTokenService {
  const store = new Map<string, { id: string; data: ConfirmationRequest }>();
  let docCounter = 0;

  return {
    createRequest: async (_userId: string, action: string, payload: any) => {
      const token = randomUUID();
      const id = `req-${++docCounter}`;
      const now = new Date();
      const request: ConfirmationRequest = {
        user_id: _userId,
        token,
        action,
        payload,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
        status: 'pending',
      };
      store.set(token, { id, data: request });
      return { requestId: id, token };
    },
    validateToken: async (_userId: string, token: string) => {
      const entry = store.get(token);
      if (!entry || entry.data.status !== 'pending') return null;
      return { ...entry.data, request_id: entry.id };
    },
    confirmRequest: async (_userId: string, token: string) => {
      const entry = store.get(token);
      if (!entry || entry.data.status !== 'pending') return null;
      entry.data.status = 'confirmed';
      entry.data.confirmed_at = new Date().toISOString();
      return { ...entry.data, request_id: entry.id };
    },
    denyRequest: async (_userId: string, token: string) => {
      const entry = store.get(token);
      if (!entry || entry.data.status !== 'pending') return false;
      entry.data.status = 'denied';
      return true;
    },
    retractRequest: async (_userId: string, token: string) => {
      const entry = store.get(token);
      if (!entry || entry.data.status !== 'pending') return false;
      entry.data.status = 'retracted';
      return true;
    },
  } as ConfirmationTokenService;
}

function createMockEventBus() {
  const events: Array<{ data: WebhookEventData; actor?: WebhookActor }> = [];
  const bus: EventBus = {
    async emit(event: WebhookEventData, actor?: WebhookActor) {
      events.push({ data: event, actor });
    },
  };
  return { bus, events };
}

describe('Comment Webhook — parentOwnerId resolution (e2e)', () => {
  const authorId = 'user-author';
  const commenterId = 'user-commenter';

  let weaviateClient: ReturnType<typeof createMockWeaviateClient>;
  let authorCollection: ReturnType<typeof createMockCollection>;
  let commenterCollection: ReturnType<typeof createMockCollection>;
  let authorMemoryService: MemoryService;
  let commenterMemoryService: MemoryService;
  let tokenService: ConfirmationTokenService;
  let logger: ReturnType<typeof createMockLogger>;
  let mockMemoryIndex: { index: jest.Mock; lookup: jest.Mock };

  beforeEach(() => {
    weaviateClient = createMockWeaviateClient();
    authorCollection = createMockCollection();
    commenterCollection = createMockCollection();
    logger = createMockLogger();
    tokenService = createMockConfirmationTokenService();
    mockMemoryIndex = { index: jest.fn().mockResolvedValue(undefined), lookup: jest.fn().mockResolvedValue(null) };

    // Register user collections
    (weaviateClient as any)._collections.set(`Memory_users_${authorId}`, authorCollection);
    (weaviateClient as any)._collections.set(`Memory_users_${commenterId}`, commenterCollection);

    authorMemoryService = new MemoryService(authorCollection as any, authorId, logger, {
      memoryIndex: mockMemoryIndex as any,
    });
    commenterMemoryService = new MemoryService(commenterCollection as any, commenterId, logger, {
      memoryIndex: mockMemoryIndex as any,
    });
  });

  function createCommenterSpaceService(eventBus: EventBus) {
    return new SpaceService(
      weaviateClient as any,
      commenterCollection as any,
      commenterId,
      tokenService,
      logger,
      mockMemoryIndex as any,
      { eventBus },
    );
  }

  async function publishAndConfirm(service: SpaceService, memoryId: string, opts: { spaces?: string[]; groups?: string[] }) {
    const { token } = await service.publish({ memory_id: memoryId, ...opts });
    return service.confirm({ token });
  }

  it('resolves parent_owner_id when commenter comments on another user\'s published memory', async () => {
    const { bus, events } = createMockEventBus();

    // Author creates and publishes a memory to a space
    const memory = await authorMemoryService.create({ content: 'My original memory', title: 'Original' });

    // Simulate: commenter has a copy of the parent in their collection (e.g. via cross-publish)
    // with user_id pointing to the original author
    await commenterCollection.data.insert({
      id: memory.memory_id,
      properties: {
        user_id: authorId,
        doc_type: 'memory',
        content_type: 'note',
        content: 'My original memory',
        title: 'Original',
        tags: [],
        space_ids: ['the_void'],
        group_ids: [],
        deleted_at: null,
      },
    });

    // Commenter creates a comment referencing the parent
    const comment = await commenterMemoryService.create({
      content: 'Great insight!',
      type: 'comment',
      parent_id: memory.memory_id,
    });

    // Publish the comment
    const spaceService = createCommenterSpaceService(bus);
    await publishAndConfirm(spaceService, comment.memory_id, { spaces: ['the_void'] });

    // Verify webhook
    const commentEvents = events.filter(e => e.data.type === 'comment.published_to_space');
    expect(commentEvents).toHaveLength(1);
    expect((commentEvents[0].data as any).parent_owner_id).toBe(authorId);
    expect((commentEvents[0].data as any).owner_id).toBe(commenterId);
    expect((commentEvents[0].data as any).content_preview).toBe('Great insight!');
  });

  it('resolves parent_owner_id from public collection when parent not in commenter\'s collection', async () => {
    const { bus, events } = createMockEventBus();
    const parentId = 'parent-from-public';

    // Parent exists only in public collection (author published it)
    const publicCollection = weaviateClient.collections.get('Memory_spaces_public');
    await publicCollection.data.insert({
      properties: {
        original_memory_id: parentId,
        author_id: authorId,
        composite_id: `${authorId}.${parentId}`,
        doc_type: 'memory',
        content_type: 'note',
        content: 'Public memory',
        space_ids: ['the_void'],
        group_ids: [],
        deleted_at: null,
        moderation_status: 'approved',
      },
    });

    // Commenter creates a comment referencing this parent
    const comment = await commenterMemoryService.create({
      content: 'Interesting take!',
      type: 'comment',
      parent_id: parentId,
    });

    const spaceService = createCommenterSpaceService(bus);
    await publishAndConfirm(spaceService, comment.memory_id, { spaces: ['the_void'] });

    const commentEvents = events.filter(e => e.data.type === 'comment.published_to_space');
    expect(commentEvents).toHaveLength(1);
    expect((commentEvents[0].data as any).parent_owner_id).toBe(authorId);
  });

  it('resolves parent_owner_id from group collection as last resort', async () => {
    const { bus, events } = createMockEventBus();
    const parentId = 'parent-from-group';
    const groupId = 'team-alpha';

    // Parent exists only in a group collection
    const groupCollection = weaviateClient.collections.get(`Memory_groups_${groupId}`);
    await groupCollection.data.insert({
      properties: {
        original_memory_id: parentId,
        author_id: authorId,
        composite_id: `${authorId}.${parentId}`,
        doc_type: 'memory',
        content_type: 'note',
        content: 'Group memory',
        space_ids: [],
        group_ids: [groupId],
        deleted_at: null,
        moderation_status: 'approved',
      },
    });

    // Commenter creates a comment and publishes to the group
    const comment = await commenterMemoryService.create({
      content: 'Nice group post!',
      type: 'comment',
      parent_id: parentId,
    });

    const spaceService = createCommenterSpaceService(bus);
    await publishAndConfirm(spaceService, comment.memory_id, { groups: [groupId] });

    const commentEvents = events.filter(e => e.data.type === 'comment.published_to_group');
    expect(commentEvents).toHaveLength(1);
    expect((commentEvents[0].data as any).parent_owner_id).toBe(authorId);
    expect((commentEvents[0].data as any).group_id).toBe(groupId);
  });

  it('skips comment webhook when parent cannot be found anywhere', async () => {
    const { bus, events } = createMockEventBus();

    // Comment references a parent that doesn't exist in any collection
    const comment = await commenterMemoryService.create({
      content: 'Orphan comment',
      type: 'comment',
      parent_id: 'nonexistent-parent',
    });

    const spaceService = createCommenterSpaceService(bus);
    await publishAndConfirm(spaceService, comment.memory_id, { spaces: ['the_void'] });

    // Should NOT emit any comment webhook
    const commentEvents = events.filter(e => e.data.type.startsWith('comment.'));
    expect(commentEvents).toHaveLength(0);

    // Should log warning
    expect(logger.warn).toHaveBeenCalledWith(
      'Skipping comment webhook — could not resolve parent_owner_id',
      expect.objectContaining({ parentId: 'nonexistent-parent' }),
    );
  });

  it('self-comment sets parent_owner_id to commenter\'s own ID', async () => {
    const { bus, events } = createMockEventBus();

    // Commenter creates a memory and then comments on their own memory
    const memory = await commenterMemoryService.create({
      content: 'My memory',
      title: 'Self',
    });

    const comment = await commenterMemoryService.create({
      content: 'Updating my own thought',
      type: 'comment',
      parent_id: memory.memory_id,
    });

    const spaceService = createCommenterSpaceService(bus);
    await publishAndConfirm(spaceService, comment.memory_id, { spaces: ['the_void'] });

    const commentEvents = events.filter(e => e.data.type === 'comment.published_to_space');
    expect(commentEvents).toHaveLength(1);
    // Self-comment: parent_owner_id equals the commenter
    expect((commentEvents[0].data as any).parent_owner_id).toBe(commenterId);
  });
});
