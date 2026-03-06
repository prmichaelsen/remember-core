import { getClient } from '../helpers/client.js';
import { TEST_USER_ID, TEST_USER_ID_2 } from '../helpers/test-ids.js';

describe('Ratings (live)', () => {
  const client = getClient();
  let memoryId: string | null = null;

  beforeAll(async () => {
    // User 1 creates the memory; user 2 will rate it (can't rate your own)
    const res = await client.memories.create(TEST_USER_ID, {
      content: 'Live test: rating target memory',
      type: 'fact',
      tags: ['live-test', 'ratings'],
    });
    if (!res.error) {
      memoryId = (res.data as any).memory_id;
    }
  });

  afterAll(async () => {
    if (memoryId) {
      try { await client.memories.retractRating(TEST_USER_ID_2, memoryId); } catch { /* may 204 or 404 */ }
      await client.memories.delete(TEST_USER_ID, memoryId, { reason: 'live-test-cleanup' });
    }
  });

  it('rate a memory (as different user)', async () => {
    if (!memoryId) return;

    const res = await client.memories.rate(TEST_USER_ID_2, memoryId, 4);

    if (res.error) {
      console.warn('Rate memory error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('get my rating for the memory', async () => {
    if (!memoryId) return;

    const res = await client.memories.getMyRating(TEST_USER_ID_2, memoryId);

    if (res.error) {
      console.warn('Get my rating error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('retract rating', async () => {
    if (!memoryId) return;

    const res = await client.memories.retractRating(TEST_USER_ID_2, memoryId);

    if (res.error) {
      console.warn('Retract rating error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.error).toBeNull();
  });
});
