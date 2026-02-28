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
});
