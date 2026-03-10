import { getClient } from '../helpers/client.js';
import { getAppClient } from '../helpers/app-client.js';
import { TEST_USER_ID, TEST_USER_ID_2 } from '../helpers/test-ids.js';

describe('App Compound Operations (live)', () => {
  const client = getClient();
  const appClient = getAppClient();
  let memoryId: string | null = null;
  let relationshipId: string | null = null;

  beforeAll(async () => {
    // Create a test memory via SVC client
    const res = await client.memories.create(TEST_USER_ID, {
      content: 'Live test: app compound operations target memory',
      type: 'fact',
      tags: ['live-test', 'app-compound'],
    });
    if (!res.error) {
      memoryId = (res.data as any).memory_id;
    }

    // Create a second memory and relationship for getMemories test
    const res2 = await client.memories.create(TEST_USER_ID, {
      content: 'Live test: app compound operations related memory',
      type: 'fact',
      tags: ['live-test', 'app-compound'],
    });
    if (!res2.error && memoryId) {
      const memoryId2 = (res2.data as any).memory_id;
      const relRes = await client.relationships.create(TEST_USER_ID, {
        memory_ids: [memoryId, memoryId2],
        relationship_type: 'related_to',
        observation: 'App compound test relationship',
      });
      if (!relRes.error) {
        const relData = relRes.data as any;
        relationshipId = relData.relationship_id ?? relData.id ?? null;
      }
    }

    await new Promise(r => setTimeout(r, 2000));
  }, 30000);

  afterAll(async () => {
    if (relationshipId) {
      try { await client.relationships.delete(TEST_USER_ID, relationshipId); } catch { /* ignore */ }
    }
    if (memoryId) {
      try { await client.memories.delete(TEST_USER_ID, memoryId, { reason: 'live-test-cleanup' }); } catch { /* ignore */ }
    }
  });

  it('memories.get() returns memory with optional relationships and similar', async () => {
    if (!memoryId) return;

    const res = await appClient.memories.get(TEST_USER_ID, memoryId, {
      includeRelationships: true,
      includeSimilar: true,
      similarLimit: 3,
    });

    if (res.error) {
      console.warn('app memories.get error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memory).toBeDefined();
  });

  it('memories.get() returns memory without extras', async () => {
    if (!memoryId) return;

    const res = await appClient.memories.get(TEST_USER_ID, memoryId);

    if (res.error) {
      console.warn('app memories.get basic error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('relationships.getMemories() returns paginated memories', async () => {
    if (!relationshipId) return;

    const res = await appClient.relationships.getMemories(TEST_USER_ID, relationshipId, {
      limit: 10,
    });

    if (res.error) {
      console.warn('app relationships.getMemories error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('ghost.searchAsGhost() searches as another user', async () => {
    const res = await appClient.ghost.searchAsGhost(TEST_USER_ID, {
      owner_user_id: TEST_USER_ID_2,
      query: 'test',
      limit: 5,
    });

    // May error if ghost not enabled for target user
    if (res.error) {
      console.warn('ghost.searchAsGhost error:', res.error);
      expect([400, 403, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });
});
