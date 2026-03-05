// src/app/memories.spec.ts
import { createMemoriesResource } from './memories';
import type { HttpClient } from '../clients/http';

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

  it('get calls GET /api/app/v1/memories/:memoryId', async () => {
    const resource = createMemoriesResource(http);
    await resource.get('user1', 'mem-123');

    expect(http.request).toHaveBeenCalledWith(
      'GET',
      '/api/app/v1/memories/mem-123',
      { userId: 'user1', params: {} },
    );
  });

  it('passes includeRelationships=true when set', async () => {
    const resource = createMemoriesResource(http);
    await resource.get('user1', 'mem-123', { includeRelationships: true });

    expect(http.request).toHaveBeenCalledWith(
      'GET',
      '/api/app/v1/memories/mem-123',
      { userId: 'user1', params: { includeRelationships: 'true' } },
    );
  });

  it('passes relationshipMemoryLimit as query param', async () => {
    const resource = createMemoriesResource(http);
    await resource.get('user1', 'mem-123', {
      includeRelationships: true,
      relationshipMemoryLimit: 5,
    });

    expect(http.request).toHaveBeenCalledWith(
      'GET',
      '/api/app/v1/memories/mem-123',
      {
        userId: 'user1',
        params: { includeRelationships: 'true', relationshipMemoryLimit: '5' },
      },
    );
  });

  it('omits params when options not provided', async () => {
    const resource = createMemoriesResource(http);
    await resource.get('user1', 'mem-456');

    const call = (http.request as jest.Mock).mock.calls[0];
    expect(call[2].params).toEqual({});
  });

  it('does not set includeRelationships when false', async () => {
    const resource = createMemoriesResource(http);
    await resource.get('user1', 'mem-123', { includeRelationships: false });

    const call = (http.request as jest.Mock).mock.calls[0];
    expect(call[2].params).toEqual({});
  });

  it('passes includeSimilar=true when set', async () => {
    const resource = createMemoriesResource(http);
    await resource.get('user1', 'mem-123', { includeSimilar: true });

    expect(http.request).toHaveBeenCalledWith(
      'GET',
      '/api/app/v1/memories/mem-123',
      { userId: 'user1', params: { includeSimilar: 'true' } },
    );
  });

  it('passes similarLimit as query param', async () => {
    const resource = createMemoriesResource(http);
    await resource.get('user1', 'mem-123', { includeSimilar: true, similarLimit: 10 });

    expect(http.request).toHaveBeenCalledWith(
      'GET',
      '/api/app/v1/memories/mem-123',
      { userId: 'user1', params: { includeSimilar: 'true', similarLimit: '10' } },
    );
  });

  it('passes all options together', async () => {
    const resource = createMemoriesResource(http);
    await resource.get('user1', 'mem-123', {
      includeRelationships: true,
      relationshipMemoryLimit: 3,
      includeSimilar: true,
      similarLimit: 8,
    });

    expect(http.request).toHaveBeenCalledWith(
      'GET',
      '/api/app/v1/memories/mem-123',
      {
        userId: 'user1',
        params: {
          includeRelationships: 'true',
          relationshipMemoryLimit: '3',
          includeSimilar: 'true',
          similarLimit: '8',
        },
      },
    );
  });

  it('does not set includeSimilar when false', async () => {
    const resource = createMemoriesResource(http);
    await resource.get('user1', 'mem-123', { includeSimilar: false });

    const call = (http.request as jest.Mock).mock.calls[0];
    expect(call[2].params).toEqual({});
  });
});
