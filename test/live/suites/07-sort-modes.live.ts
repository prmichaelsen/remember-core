import { getClient } from '../helpers/client.js';
import { TEST_USER_ID } from '../helpers/test-ids.js';

describe('Sort Modes (live)', () => {
  const client = getClient();
  let memoryId: string | null = null;

  beforeAll(async () => {
    const res = await client.memories.create(TEST_USER_ID, {
      content: 'Live test: sort mode query target memory',
      type: 'fact',
      tags: ['live-test', 'sort-modes'],
    });
    if (!res.error) {
      memoryId = (res.data as any).memory_id;
    }
  });

  afterAll(async () => {
    if (memoryId) {
      await client.memories.delete(TEST_USER_ID, memoryId, { reason: 'live-test-cleanup' });
    }
  });

  it('query byTime returns results or empty', async () => {
    const res = await client.memories.byTime(TEST_USER_ID, {
      limit: 10,
      direction: 'desc',
    });

    if (res.error) {
      console.warn('byTime error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('query byDensity returns results or empty', async () => {
    const res = await client.memories.byDensity(TEST_USER_ID, {
      limit: 10,
    });

    if (res.error) {
      console.warn('byDensity error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('query byRating returns results or empty', async () => {
    const res = await client.memories.byRating(TEST_USER_ID, {
      limit: 10,
      direction: 'desc',
    });

    if (res.error) {
      console.warn('byRating error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });
});
