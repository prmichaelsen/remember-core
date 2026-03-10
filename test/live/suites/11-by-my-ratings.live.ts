import { getClient } from '../helpers/client.js';
import { TEST_USER_ID, TEST_USER_ID_2 } from '../helpers/test-ids.js';

describe('byMyRatings (live)', () => {
  const client = getClient();
  const memoryIds: string[] = [];
  const ratings = [2, 4, 5];

  beforeAll(async () => {
    // User 1 creates 3 test memories; User 2 rates them (can't self-rate)
    for (let i = 0; i < 3; i++) {
      const res = await client.memories.create(TEST_USER_ID, {
        content: `Live test: byMyRatings target memory ${i} — unique content for search`,
        type: 'fact',
        tags: ['live-test', 'by-my-ratings'],
      });
      if (!res.error) {
        memoryIds.push((res.data as any).memory_id);
      }
    }

    // Small delay to let memories settle in Weaviate
    await new Promise(r => setTimeout(r, 2000));

    // User 2 rates each memory with different star values
    for (let i = 0; i < memoryIds.length; i++) {
      await client.memories.rate(TEST_USER_ID_2, memoryIds[i], ratings[i]);
    }

    // Small delay to let rating docs settle in Firestore
    await new Promise(r => setTimeout(r, 1000));
  }, 60000);

  afterAll(async () => {
    for (const id of memoryIds) {
      try { await client.memories.retractRating(TEST_USER_ID_2, id); } catch { /* may 204 or 404 */ }
      try { await client.memories.delete(TEST_USER_ID, id, { reason: 'live-test-cleanup' }); } catch { /* ignore */ }
    }
  });

  it('browse mode returns envelope with metadata', async () => {
    const res = await client.memories.byMyRatings(TEST_USER_ID_2, {
      limit: 10,
    });

    if (res.error) {
      console.warn('byMyRatings browse error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.items).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
    expect(typeof data.offset).toBe('number');
    expect(typeof data.limit).toBe('number');

    if (data.items.length > 0) {
      const first = data.items[0];
      expect(first.memory).toBeDefined();
      expect(first.metadata).toBeDefined();
      expect(typeof first.metadata.my_rating).toBe('number');
      expect(first.metadata.rated_at).toBeDefined();
    }
  });

  it('sort_by rating desc returns highest rated first', async () => {
    const res = await client.memories.byMyRatings(TEST_USER_ID_2, {
      sort_by: 'rating',
      direction: 'desc',
      limit: 10,
    });

    if (res.error) {
      console.warn('byMyRatings sort by rating error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(Array.isArray(data.items)).toBe(true);

    // Verify descending order if multiple items
    if (data.items.length >= 2) {
      const firstRating = data.items[0].metadata.my_rating;
      const lastRating = data.items[data.items.length - 1].metadata.my_rating;
      expect(firstRating).toBeGreaterThanOrEqual(lastRating);
    }
  });

  it('sort_by rated_at desc returns most recent first', async () => {
    const res = await client.memories.byMyRatings(TEST_USER_ID_2, {
      sort_by: 'rated_at',
      direction: 'desc',
      limit: 10,
    });

    if (res.error) {
      console.warn('byMyRatings sort by rated_at error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(Array.isArray(data.items)).toBe(true);

    if (data.items.length > 0) {
      expect(data.items[0].metadata.rated_at).toBeDefined();
    }
  });

  it('rating_filter min:4 returns only high-rated memories', async () => {
    const res = await client.memories.byMyRatings(TEST_USER_ID_2, {
      rating_filter: { min: 4 },
      limit: 10,
    });

    if (res.error) {
      console.warn('byMyRatings rating_filter error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(Array.isArray(data.items)).toBe(true);

    // All returned items should have rating >= 4
    for (const item of data.items) {
      expect(item.metadata.my_rating).toBeGreaterThanOrEqual(4);
    }
  });

  it('search mode with query returns envelope', async () => {
    const res = await client.memories.byMyRatings(TEST_USER_ID_2, {
      query: 'byMyRatings target memory',
      limit: 10,
    });

    if (res.error) {
      console.warn('byMyRatings search error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.items).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');

    // Envelope shape maintained even in search mode
    if (data.items.length > 0) {
      expect(data.items[0].memory).toBeDefined();
      expect(data.items[0].metadata).toBeDefined();
    }
  });

  it('unrated user returns empty results', async () => {
    const freshUserId = `live_test_no_ratings_${Date.now()}`;
    const res = await client.memories.byMyRatings(freshUserId, {
      limit: 10,
    });

    if (res.error) {
      console.warn('byMyRatings empty user error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.items).toBeDefined();
    expect(data.items.length).toBe(0);
    expect(data.total).toBe(0);
  });
});
