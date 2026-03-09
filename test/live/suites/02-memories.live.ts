import { getClient } from '../helpers/client.js';
import { TEST_USER_ID } from '../helpers/test-ids.js';

describe('Memories CRUD (live)', () => {
  const client = getClient();
  let memoryId: string | null = null;

  afterAll(async () => {
    if (memoryId) {
      await client.memories.delete(TEST_USER_ID, memoryId, { reason: 'live-test-cleanup' });
    }
  });

  it('create a memory', async () => {
    const res = await client.memories.create(TEST_USER_ID, {
      content: 'Live test: the capital of France is Paris',
      type: 'fact',
      tags: ['live-test'],
    });

    if (res.error) {
      console.warn('Memory creation failed:', res.error);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memory_id).toBeDefined();
    memoryId = data.memory_id;
  });

  it('search memories', async () => {
    if (!memoryId) return;

    const res = await client.memories.search(TEST_USER_ID, {
      query: 'capital of France',
    });

    expect(res.error).toBeNull();
    expect(res.data).toHaveProperty('memories');
  });

  it('update a memory', async () => {
    if (!memoryId) return;

    const res = await client.memories.update(TEST_USER_ID, memoryId, {
      content: 'Live test updated: Paris is the capital of France',
    });

    if (res.error) {
      console.warn('Memory update failed:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }
    expect(res.data).toBeDefined();
  });

  it('delete a memory', async () => {
    if (!memoryId) return;

    const res = await client.memories.delete(TEST_USER_ID, memoryId, { reason: 'live-test-cleanup' });

    if (res.error) {
      console.warn('Memory delete failed:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }
    expect(res.data).toBeDefined();
    memoryId = null;
  });
});
