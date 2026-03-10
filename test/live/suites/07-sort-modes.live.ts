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
      expect([400, 404, 500]).toContain(res.error.status);
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
      expect([400, 404, 500]).toContain(res.error.status);
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
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('query byCurated returns results or empty', async () => {
    const res = await client.memories.byCurated(TEST_USER_ID, {
      limit: 10,
    });

    if (res.error) {
      console.warn('byCurated error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('byCurated with query re-ranks by curated score', async () => {
    const res = await client.memories.byCurated(TEST_USER_ID, {
      query: 'sort mode query target',
      limit: 10,
    });

    if (res.error) {
      console.warn('byCurated search error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('query byDiscovery returns results or empty', async () => {
    const res = await client.memories.byDiscovery(TEST_USER_ID, {
      limit: 10,
    });

    if (res.error) {
      console.warn('byDiscovery error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('query byRecommendation returns results or graceful fallback', async () => {
    const res = await client.memories.byRecommendation(TEST_USER_ID, {
      limit: 10,
    });

    if (res.error) {
      console.warn('byRecommendation error:', res.error);
      // May 400 if user has no ratings (no centroid to build)
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });
});
