// src/clients/svc/v1/memories.spec.ts
import { createMemoriesResource } from './memories';
import type { HttpClient } from '../../http';

function createMockHttpClient(): HttpClient {
  return {
    request: jest.fn().mockResolvedValue({ data: {}, error: null, throwOnError: () => ({}) }),
  } as unknown as HttpClient;
}

describe('MemoriesResource', () => {
  let http: HttpClient;

  beforeEach(() => {
    http = createMockHttpClient();
  });

  it('create calls POST /api/svc/v1/memories', async () => {
    const memories = createMemoriesResource(http);
    await memories.create('user1', { content: 'hello', content_type: 'note' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories', {
      userId: 'user1',
      body: { content: 'hello', content_type: 'note' },
    });
  });

  it('update calls PATCH /api/svc/v1/memories/:id', async () => {
    const memories = createMemoriesResource(http);
    await memories.update('user1', 'mem-123', { content: 'updated' });

    expect(http.request).toHaveBeenCalledWith('PATCH', '/api/svc/v1/memories/mem-123', {
      userId: 'user1',
      body: { content: 'updated' },
    });
  });

  it('delete calls DELETE /api/svc/v1/memories/:id', async () => {
    const memories = createMemoriesResource(http);
    await memories.delete('user1', 'mem-123');

    expect(http.request).toHaveBeenCalledWith('DELETE', '/api/svc/v1/memories/mem-123', {
      userId: 'user1',
    });
  });

  it('delete passes optional body', async () => {
    const memories = createMemoriesResource(http);
    await memories.delete('user1', 'mem-123', { reason: 'cleanup' });

    expect(http.request).toHaveBeenCalledWith('DELETE', '/api/svc/v1/memories/mem-123', {
      userId: 'user1',
      body: { reason: 'cleanup' },
    });
  });

  it('search calls POST /api/svc/v1/memories/search', async () => {
    const memories = createMemoriesResource(http);
    await memories.search('user1', { query: 'meeting notes', limit: 10 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/search', {
      userId: 'user1',
      body: { query: 'meeting notes', limit: 10 },
    });
  });

  it('similar calls POST /api/svc/v1/memories/similar', async () => {
    const memories = createMemoriesResource(http);
    await memories.similar('user1', { memory_id: 'mem-123', limit: 5 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/similar', {
      userId: 'user1',
      body: { memory_id: 'mem-123', limit: 5 },
    });
  });

  it('query calls POST /api/svc/v1/memories/query', async () => {
    const memories = createMemoriesResource(http);
    await memories.query('user1', { query: 'recent projects', limit: 5 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/query', {
      userId: 'user1',
      body: { query: 'recent projects', limit: 5 },
    });
  });

  it('byTime calls POST /api/svc/v1/memories/by-time', async () => {
    const memories = createMemoriesResource(http);
    await memories.byTime('user1', { limit: 50, direction: 'desc' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/by-time', {
      userId: 'user1',
      body: { limit: 50, direction: 'desc' },
    });
  });

  it('byDensity calls POST /api/svc/v1/memories/by-density', async () => {
    const memories = createMemoriesResource(http);
    await memories.byDensity('user1', { limit: 20, min_relationship_count: 5 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/by-density', {
      userId: 'user1',
      body: { limit: 20, min_relationship_count: 5 },
    });
  });

  it('byTimeSlice calls POST /api/svc/v1/memories/by-time-slice', async () => {
    const memories = createMemoriesResource(http);
    await memories.byTimeSlice('user1', { query: 'vacation', limit: 10, direction: 'desc' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/by-time-slice', {
      userId: 'user1',
      body: { query: 'vacation', limit: 10, direction: 'desc' },
    });
  });

  it('byDensitySlice calls POST /api/svc/v1/memories/by-density-slice', async () => {
    const memories = createMemoriesResource(http);
    await memories.byDensitySlice('user1', { query: 'projects', limit: 10, direction: 'desc' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/by-density-slice', {
      userId: 'user1',
      body: { query: 'projects', limit: 10, direction: 'desc' },
    });
  });

  it('import calls POST /api/svc/v1/memories/import', async () => {
    const memories = createMemoriesResource(http);
    await memories.import('user1', { items: [{ content: 'bulk text' }] });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/import', {
      userId: 'user1',
      body: { items: [{ content: 'bulk text' }] },
    });
  });

  it('rate calls PUT /api/svc/v1/memories/:id/rating', async () => {
    const memories = createMemoriesResource(http);
    await memories.rate('user1', 'mem-123', 4);

    expect(http.request).toHaveBeenCalledWith('PUT', '/api/svc/v1/memories/mem-123/rating', {
      userId: 'user1',
      body: { rating: 4 },
    });
  });

  it('retractRating calls DELETE /api/svc/v1/memories/:id/rating', async () => {
    const memories = createMemoriesResource(http);
    await memories.retractRating('user1', 'mem-123');

    expect(http.request).toHaveBeenCalledWith('DELETE', '/api/svc/v1/memories/mem-123/rating', {
      userId: 'user1',
    });
  });

  it('getMyRating calls GET /api/svc/v1/memories/:id/rating', async () => {
    const memories = createMemoriesResource(http);
    await memories.getMyRating('user1', 'mem-123');

    expect(http.request).toHaveBeenCalledWith('GET', '/api/svc/v1/memories/mem-123/rating', {
      userId: 'user1',
    });
  });

  it('byRating calls POST /api/svc/v1/memories/by-rating', async () => {
    const memories = createMemoriesResource(http);
    await memories.byRating('user1', { direction: 'desc', limit: 10 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/by-rating', {
      userId: 'user1',
      body: { direction: 'desc', limit: 10 },
    });
  });

  it('byDiscovery calls POST /api/svc/v1/memories/by-discovery', async () => {
    const memories = createMemoriesResource(http);
    await memories.byDiscovery('user1', { query: 'explore', limit: 20 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/by-discovery', {
      userId: 'user1',
      body: { query: 'explore', limit: 20 },
    });
  });

  it('byRecommendation calls POST /api/svc/v1/memories/by-recommendation', async () => {
    const memories = createMemoriesResource(http);
    await memories.byRecommendation('user1', { limit: 20 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/by-recommendation', {
      userId: 'user1',
      body: { limit: 20 },
    });
  });

  it('byBroad calls POST /api/svc/v1/memories/by-broad', async () => {
    const memories = createMemoriesResource(http);
    await memories.byBroad('user1', { limit: 50, sort_order: 'desc' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/by-broad', {
      userId: 'user1',
      body: { limit: 50, sort_order: 'desc' },
    });
  });

  it('byRandom calls POST /api/svc/v1/memories/by-random', async () => {
    const memories = createMemoriesResource(http);
    await memories.byRandom('user1', { limit: 10 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/by-random', {
      userId: 'user1',
      body: { limit: 10 },
    });
  });

  it('byCurated calls POST /api/svc/v1/memories/by-curated', async () => {
    const memories = createMemoriesResource(http);
    await memories.byCurated('user1', { limit: 20, direction: 'desc' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/by-curated', {
      userId: 'user1',
      body: { limit: 20, direction: 'desc' },
    });
  });

  it('incrementClick calls POST /api/svc/v1/memories/:id/click', async () => {
    const memories = createMemoriesResource(http);
    await memories.incrementClick('user1', 'mem-abc');

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/mem-abc/click', {
      userId: 'user1',
    });
  });

  it('incrementShare calls POST /api/svc/v1/memories/:id/share', async () => {
    const memories = createMemoriesResource(http);
    await memories.incrementShare('user1', 'mem-abc');

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/mem-abc/share', {
      userId: 'user1',
    });
  });

  it('incrementComment calls POST /api/svc/v1/memories/:id/comment-count', async () => {
    const memories = createMemoriesResource(http);
    await memories.incrementComment('user1', 'mem-abc');

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/mem-abc/comment-count', {
      userId: 'user1',
    });
  });
});
