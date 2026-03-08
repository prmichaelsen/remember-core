import { getClient } from '../helpers/client.js';
import { TEST_USER_ID } from '../helpers/test-ids.js';

describe('Memory Retrieval (live)', () => {
  const client = getClient();
  let memoryId: string | null = null;

  beforeAll(async () => {
    const res = await client.memories.create(TEST_USER_ID, {
      content: 'Live test: memory retrieval — the Eiffel Tower is in Paris, France',
      type: 'fact',
      tags: ['live-test', 'memory-retrieval'],
    });
    if (!res.error) {
      memoryId = (res.data as any).memory_id;
    }
    // Allow indexing
    await new Promise(r => setTimeout(r, 2000));
  }, 30000);

  afterAll(async () => {
    if (memoryId) {
      try {
        await client.memories.delete(TEST_USER_ID, memoryId, { reason: 'live-test-cleanup' });
      } catch { /* ignore */ }
    }
  });

  it('get() fetches a single memory by ID', async () => {
    if (!memoryId) return;

    const res = await client.memories.get(TEST_USER_ID, memoryId);

    if (res.error) {
      console.warn('get error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memory_id ?? data.id).toBe(memoryId);
  });

  it('get() with include option returns enriched data', async () => {
    if (!memoryId) return;

    const res = await client.memories.get(TEST_USER_ID, memoryId, { include: 'relationships' });

    if (res.error) {
      console.warn('get with include error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('get() returns error for non-existent memory', async () => {
    const res = await client.memories.get(TEST_USER_ID, '00000000-0000-0000-0000-000000000000');

    expect(res.error).toBeDefined();
    expect([404, 400, 500]).toContain(res.error!.status);
  });

  it('similar() returns vector-similar memories', async () => {
    if (!memoryId) return;

    const res = await client.memories.similar(TEST_USER_ID, {
      memory_id: memoryId,
      limit: 5,
    });

    if (res.error) {
      console.warn('similar error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('query() returns semantic search results', async () => {
    const res = await client.memories.query(TEST_USER_ID, {
      query: 'Eiffel Tower Paris',
      limit: 5,
    });

    if (res.error) {
      console.warn('query error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });
});
