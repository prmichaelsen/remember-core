// src/clients/svc/v1/relationships.spec.ts
import { createRelationshipsResource } from './relationships';
import type { HttpClient } from '../../http';
import type { ReorderInput } from './relationships';

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

  it('create calls POST /api/svc/v1/relationships', async () => {
    const rel = createRelationshipsResource(http);
    await rel.create('user1', { memory_ids: ['a', 'b'], relationship_type: 'test', observation: 'obs' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/relationships', {
      userId: 'user1',
      body: { memory_ids: ['a', 'b'], relationship_type: 'test', observation: 'obs' },
    });
  });

  it('update calls PATCH /api/svc/v1/relationships/:id', async () => {
    const rel = createRelationshipsResource(http);
    await rel.update('user1', 'rel-1', { observation: 'updated' });

    expect(http.request).toHaveBeenCalledWith('PATCH', '/api/svc/v1/relationships/rel-1', {
      userId: 'user1',
      body: { observation: 'updated' },
    });
  });

  it('delete calls DELETE /api/svc/v1/relationships/:id', async () => {
    const rel = createRelationshipsResource(http);
    await rel.delete('user1', 'rel-1');

    expect(http.request).toHaveBeenCalledWith('DELETE', '/api/svc/v1/relationships/rel-1', {
      userId: 'user1',
    });
  });

  it('search calls POST /api/svc/v1/relationships/search', async () => {
    const rel = createRelationshipsResource(http);
    await rel.search('user1', { query: 'test' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/relationships/search', {
      userId: 'user1',
      body: { query: 'test' },
    });
  });

  describe('reorder', () => {
    it('calls POST /api/svc/v1/relationships/:id/reorder', async () => {
      const rel = createRelationshipsResource(http);
      const input: ReorderInput = {
        operation: { type: 'move_to_index', memory_id: 'mem-1', index: 0 },
        version: 3,
      };
      await rel.reorder('user1', 'rel-1', input);

      expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/relationships/rel-1/reorder', {
        userId: 'user1',
        body: input,
      });
    });

    it('sends operation + version in body', async () => {
      const rel = createRelationshipsResource(http);
      const input: ReorderInput = {
        operation: { type: 'swap', memory_id_a: 'a', memory_id_b: 'b' },
        version: 5,
      };
      await rel.reorder('user1', 'rel-2', input);

      const call = (http.request as jest.Mock).mock.calls[0];
      expect(call[2].body).toEqual({
        operation: { type: 'swap', memory_id_a: 'a', memory_id_b: 'b' },
        version: 5,
      });
    });

    it('returns updated relationship on success', async () => {
      const mockResult = {
        data: { relationship_id: 'rel-1', member_order: { a: 0, b: 1 }, version: 4, updated_at: '2026-01-01T00:00:00Z' },
        error: null,
        throwOnError: () => ({}),
      };
      (http.request as jest.Mock).mockResolvedValue(mockResult);

      const rel = createRelationshipsResource(http);
      const result = await rel.reorder('user1', 'rel-1', {
        operation: { type: 'set_order', ordered_memory_ids: ['a', 'b'] },
        version: 3,
      });

      expect(result.data).toEqual({
        relationship_id: 'rel-1',
        member_order: { a: 0, b: 1 },
        version: 4,
        updated_at: '2026-01-01T00:00:00Z',
      });
    });
  });
});
