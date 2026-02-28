/**
 * Integration test: Space publishing flow.
 *
 * Tests the two-phase confirmation flow (publish → confirm/deny) and
 * search/query across spaces. Uses mocked Weaviate client and
 * in-memory ConfirmationTokenService.
 */

import { randomUUID } from 'crypto';
import { MemoryService } from '../../memory.service.js';
import { SpaceService } from '../../space.service.js';
import type { ConfirmationTokenService, ConfirmationRequest } from '../../confirmation-token.service.js';
import { createMockCollection, createMockWeaviateClient, createMockLogger } from '../../../testing/weaviate-mock.js';

// In-memory mock of ConfirmationTokenService (no Firestore needed)
function createMockConfirmationTokenService(): ConfirmationTokenService {
  const store = new Map<string, { id: string; data: ConfirmationRequest }>();
  let docCounter = 0;

  return {
    createRequest: async (userId: string, action: string, payload: any) => {
      const token = randomUUID();
      const id = `req-${++docCounter}`;
      const now = new Date();
      const request: ConfirmationRequest = {
        user_id: userId,
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

    validateToken: async (userId: string, token: string) => {
      const entry = store.get(token);
      if (!entry || entry.data.status !== 'pending') return null;
      if (new Date(entry.data.expires_at).getTime() < Date.now()) {
        entry.data.status = 'expired';
        return null;
      }
      return { ...entry.data, request_id: entry.id };
    },

    confirmRequest: async (userId: string, token: string) => {
      const entry = store.get(token);
      if (!entry || entry.data.status !== 'pending') return null;
      entry.data.status = 'confirmed';
      entry.data.confirmed_at = new Date().toISOString();
      return { ...entry.data, request_id: entry.id };
    },

    denyRequest: async (userId: string, token: string) => {
      const entry = store.get(token);
      if (!entry || entry.data.status !== 'pending') return false;
      entry.data.status = 'denied';
      return true;
    },

    retractRequest: async (userId: string, token: string) => {
      const entry = store.get(token);
      if (!entry || entry.data.status !== 'pending') return false;
      entry.data.status = 'retracted';
      return true;
    },
  } as ConfirmationTokenService;
}

describe('Space Publishing Flow (integration)', () => {
  let weaviateClient: ReturnType<typeof createMockWeaviateClient>;
  let userCollection: ReturnType<typeof createMockCollection>;
  let memoryService: MemoryService;
  let spaceService: SpaceService;
  let tokenService: ConfirmationTokenService;
  const userId = 'space-test-user';

  beforeEach(() => {
    weaviateClient = createMockWeaviateClient();
    userCollection = createMockCollection();
    const logger = createMockLogger();
    tokenService = createMockConfirmationTokenService();
    memoryService = new MemoryService(userCollection as any, userId, logger);
    spaceService = new SpaceService(
      weaviateClient as any,
      userCollection as any,
      userId,
      tokenService,
      logger,
    );
  });

  it('publish requires at least one space or group', async () => {
    const m = await memoryService.create({ content: 'test memory' });
    await expect(
      spaceService.publish({ memory_id: m.memory_id }),
    ).rejects.toThrow('Must specify at least one space or group');
  });

  it('publish validates space IDs', async () => {
    const m = await memoryService.create({ content: 'test memory' });
    await expect(
      spaceService.publish({
        memory_id: m.memory_id,
        spaces: ['invalid space!'],
      }),
    ).rejects.toThrow('Invalid space IDs');
  });

  it('publish creates a confirmation token', async () => {
    const m = await memoryService.create({ content: 'Shareable insight' });

    const result = await spaceService.publish({
      memory_id: m.memory_id,
      spaces: ['the_void'],
    });

    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');
  });

  it('deny cancels a pending publish', async () => {
    const m = await memoryService.create({ content: 'Maybe share this' });

    const { token } = await spaceService.publish({
      memory_id: m.memory_id,
      spaces: ['the_void'],
    });

    const denied = await spaceService.deny({ token });
    expect(denied.success).toBe(true);
  });

  it('publish → confirm → memory gets space_ids updated', async () => {
    const m = await memoryService.create({ content: 'Confirmed publish test' });

    // Phase 1: publish (generates token)
    const { token } = await spaceService.publish({
      memory_id: m.memory_id,
      spaces: ['the_void'],
    });

    // Phase 2: confirm (executes the publish)
    const confirmed = await spaceService.confirm({ token });
    expect(confirmed.success).toBe(true);
    expect(confirmed.action).toBe('publish_memory');

    // Verify the source memory's space_ids got updated
    const stored = userCollection._store.get(m.memory_id);
    expect(stored?.properties.space_ids).toContain('the_void');
  });

  it('retract requires at least one space or group', async () => {
    const m = await memoryService.create({ content: 'published memory' });
    await expect(
      spaceService.retract({ memory_id: m.memory_id }),
    ).rejects.toThrow('Must specify at least one space or group');
  });

  it('publish via group (no space ID validation needed)', async () => {
    const m = await memoryService.create({ content: 'Group-shared memory' });

    const result = await spaceService.publish({
      memory_id: m.memory_id,
      groups: ['team-alpha'],
    });

    expect(result.token).toBeDefined();
  });

  it('search across spaces returns published memories', async () => {
    // Insert into the unified public collection (Memory_spaces_public)
    const publicCollection = weaviateClient.collections.get('Memory_spaces_public');
    await publicCollection.data.insert({
      properties: {
        content: 'Published to the_void',
        doc_type: 'memory',
        user_id: userId,
        content_type: 'note',
        moderation_status: 'approved',
        space_ids: ['the_void'],
      },
    });

    const result = await spaceService.search({
      query: 'published',
      spaces: ['the_void'],
    });

    expect(result.spaces_searched).toEqual(['the_void']);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('query across spaces returns relevant memories', async () => {
    const publicCollection = weaviateClient.collections.get('Memory_spaces_public');
    await publicCollection.data.insert({
      properties: {
        content: 'Machine learning fundamentals',
        doc_type: 'memory',
        user_id: userId,
        content_type: 'note',
        moderation_status: 'approved',
        space_ids: ['the_void'],
        spaces: ['the_void'],
      },
    });

    const result = await spaceService.query({
      question: 'What is ML?',
      spaces: ['the_void'],
    });

    expect(result.spaces_queried).toEqual(['the_void']);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});
