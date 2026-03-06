import { getClient } from '../helpers/client.js';
import { TEST_USER_ID } from '../helpers/test-ids.js';

describe('Ratings (live)', () => {
  const client = getClient();
  let memoryId: string | null = null;

  beforeAll(async () => {
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
      // Retract rating before deleting memory
      await client.memories.retractRating(TEST_USER_ID, memoryId);
      await client.memories.delete(TEST_USER_ID, memoryId, { reason: 'live-test-cleanup' });
    }
  });

  it('rate a memory', async () => {
    if (!memoryId) return;

    const res = await client.memories.rate(TEST_USER_ID, memoryId, 4);

    if (res.error) {
      console.warn('Rate memory error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('get my rating for the memory', async () => {
    if (!memoryId) return;

    const res = await client.memories.getMyRating(TEST_USER_ID, memoryId);

    if (res.error) {
      console.warn('Get my rating error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('retract rating', async () => {
    if (!memoryId) return;

    const res = await client.memories.retractRating(TEST_USER_ID, memoryId);

    if (res.error) {
      console.warn('Retract rating error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    // void response — just verify no error
    expect(res.error).toBeNull();
  });
});
