// src/app/relationships.spec.ts
import { createRelationshipsResource } from './relationships';
import type { HttpClient } from '../clients/http';

function createMockHttpClient(): HttpClient {
  return {
    request: jest.fn().mockResolvedValue({ data: {}, error: null, throwOnError: () => ({}) }),
  } as unknown as HttpClient;
}

describe('RelationshipsResource', () => {
  let http: HttpClient;

  beforeEach(() => {
    http = createMockHttpClient();
  });

  it('getMemories calls GET /api/app/v1/relationships/:id/memories', async () => {
    const resource = createRelationshipsResource(http);
    await resource.getMemories('user1', 'rel-123');

    expect(http.request).toHaveBeenCalledWith(
      'GET',
      '/api/app/v1/relationships/rel-123/memories',
      { userId: 'user1', params: {} },
    );
  });

  it('passes limit and offset as query params', async () => {
    const resource = createRelationshipsResource(http);
    await resource.getMemories('user1', 'rel-123', { limit: 20, offset: 40 });

    expect(http.request).toHaveBeenCalledWith(
      'GET',
      '/api/app/v1/relationships/rel-123/memories',
      { userId: 'user1', params: { limit: '20', offset: '40' } },
    );
  });

  it('omits params when options not provided', async () => {
    const resource = createRelationshipsResource(http);
    await resource.getMemories('user1', 'rel-456');

    const call = (http.request as jest.Mock).mock.calls[0];
    expect(call[2].params).toEqual({});
  });

  it('passes only limit when offset not set', async () => {
    const resource = createRelationshipsResource(http);
    await resource.getMemories('user1', 'rel-123', { limit: 10 });

    expect(http.request).toHaveBeenCalledWith(
      'GET',
      '/api/app/v1/relationships/rel-123/memories',
      { userId: 'user1', params: { limit: '10' } },
    );
  });
});
