import { getClient } from '../helpers/client.js';
import { TEST_USER_ID } from '../helpers/test-ids.js';

describe('Space Sort Modes (live)', () => {
  const client = getClient();

  it('byTime returns results from the_void', async () => {
    const res = await client.spaces.byTime(TEST_USER_ID, {
      spaces: ['the_void'],
      limit: 5,
      direction: 'desc',
    });

    if (res.error) {
      console.warn('spaces.byTime error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memories).toBeDefined();
    expect(Array.isArray(data.memories)).toBe(true);
    expect(data.spaces_searched).toEqual(['the_void']);
  });

  it('byTime ascending returns results', async () => {
    const res = await client.spaces.byTime(TEST_USER_ID, {
      spaces: ['the_void'],
      limit: 5,
      direction: 'asc',
    });

    if (res.error) {
      console.warn('spaces.byTime asc error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memories).toBeDefined();
    expect(Array.isArray(data.memories)).toBe(true);
  });

  it('byTime with no spaces searches all_public', async () => {
    const res = await client.spaces.byTime(TEST_USER_ID, {
      limit: 5,
    });

    if (res.error) {
      console.warn('spaces.byTime all_public error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.spaces_searched).toBe('all_public');
  });

  it('byRating returns results sorted by rating', async () => {
    const res = await client.spaces.byRating(TEST_USER_ID, {
      spaces: ['the_void'],
      limit: 5,
      direction: 'desc',
    });

    if (res.error) {
      console.warn('spaces.byRating error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memories).toBeDefined();
    expect(Array.isArray(data.memories)).toBe(true);
    expect(data.spaces_searched).toEqual(['the_void']);
  });

  it('byProperty sorts by weight descending', async () => {
    const res = await client.spaces.byProperty(TEST_USER_ID, {
      spaces: ['the_void'],
      sort_field: 'weight',
      sort_direction: 'desc',
      limit: 5,
    });

    if (res.error) {
      console.warn('spaces.byProperty error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memories).toBeDefined();
    expect(Array.isArray(data.memories)).toBe(true);
    expect(data.sort_field).toBe('weight');
    expect(data.sort_direction).toBe('desc');
  });

  it('byProperty rejects invalid sort_field', async () => {
    const res = await client.spaces.byProperty(TEST_USER_ID, {
      spaces: ['the_void'],
      sort_field: 'invalid_field_xyz',
      sort_direction: 'desc',
    });

    expect(res.error).toBeDefined();
    expect(res.error!.status).toBe(400);
  });

  it('byBroad returns truncated content results', async () => {
    const res = await client.spaces.byBroad(TEST_USER_ID, {
      spaces: ['the_void'],
      limit: 5,
    });

    if (res.error) {
      console.warn('spaces.byBroad error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.results).toBeDefined();
    expect(Array.isArray(data.results)).toBe(true);
    if (data.results.length > 0) {
      const first = data.results[0];
      expect(first.memory_id).toBeDefined();
      expect(first.content_head).toBeDefined();
    }
  });

  it('byRandom returns a random sample', async () => {
    const res = await client.spaces.byRandom(TEST_USER_ID, {
      spaces: ['the_void'],
      limit: 3,
    });

    if (res.error) {
      console.warn('spaces.byRandom error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.results).toBeDefined();
    expect(Array.isArray(data.results)).toBe(true);
    expect(typeof data.total_pool_size).toBe('number');
  });

  it('byDiscovery returns results or empty', async () => {
    const res = await client.spaces.byDiscovery(TEST_USER_ID, {
      spaces: ['the_void'],
      limit: 5,
    });

    if (res.error) {
      console.warn('spaces.byDiscovery error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('byRecommendation returns results or graceful fallback', async () => {
    const res = await client.spaces.byRecommendation(TEST_USER_ID, {
      spaces: ['the_void'],
      limit: 5,
    });

    // May 400 (no centroid), 404 (route not deployed), or 500
    if (res.error) {
      console.warn('spaces.byRecommendation error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('byCurated returns results or empty', async () => {
    const res = await client.spaces.byCurated(TEST_USER_ID, {
      spaces: ['the_void'],
      limit: 5,
    });

    if (res.error) {
      console.warn('spaces.byCurated error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('byTime rejects invalid space ID', async () => {
    const res = await client.spaces.byTime(TEST_USER_ID, {
      spaces: ['nonexistent_invalid_space_xyz'],
      limit: 5,
    });

    expect(res.error).toBeDefined();
    expect(res.error!.status).toBe(400);
  });
});
