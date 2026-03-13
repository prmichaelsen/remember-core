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

  // ── getMemories ─────────────────────────────────────────────

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

  // ── insertMemoryAt ──────────────────────────────────────────

  describe('insertMemoryAt', () => {
    it('makes 3 sequential HTTP calls: create → add → reorder', async () => {
      const requestMock = http.request as jest.Mock;
      // Step 1: create memory
      requestMock.mockResolvedValueOnce({
        data: { memory_id: 'mem-new' },
        error: null,
        throwOnError: () => ({}),
      });
      // Step 2: add to relationship
      requestMock.mockResolvedValueOnce({
        data: { relationship_id: 'rel-1', version: 3 },
        error: null,
        throwOnError: () => ({}),
      });
      // Step 3: reorder
      requestMock.mockResolvedValueOnce({
        data: { relationship_id: 'rel-1', member_order: { 'mem-new': 0 }, version: 4, updated_at: '2026-01-01' },
        error: null,
        throwOnError: () => ({}),
      });
      // Step 4: get relationship metadata
      requestMock.mockResolvedValueOnce({
        data: { relationship: { id: 'rel-1', relationship_type: 'test' }, memories: [], total: 1, has_more: false },
        error: null,
        throwOnError: () => ({}),
      });

      const resource = createRelationshipsResource(http);
      await resource.insertMemoryAt('user1', {
        relationship_id: 'rel-1',
        content: 'hello world',
        position: 0,
        tags: ['tag1'],
        version: 2,
      });

      expect(requestMock).toHaveBeenCalledTimes(4);

      // Verify call 1: create memory
      expect(requestMock.mock.calls[0]).toEqual([
        'POST', '/api/svc/v1/memories',
        { userId: 'user1', body: { content: 'hello world', tags: ['tag1'], context_summary: undefined } },
      ]);

      // Verify call 2: add to relationship
      expect(requestMock.mock.calls[1]).toEqual([
        'PATCH', '/api/svc/v1/relationships/rel-1',
        { userId: 'user1', body: { add_memory_ids: ['mem-new'] } },
      ]);

      // Verify call 3: reorder
      expect(requestMock.mock.calls[2]).toEqual([
        'POST', '/api/svc/v1/relationships/rel-1/reorder',
        { userId: 'user1', body: { operation: { type: 'move_to_index', memory_id: 'mem-new', index: 0 }, version: 3 } },
      ]);
    });

    it('returns memory_id in error context when add fails', async () => {
      const requestMock = http.request as jest.Mock;
      // Step 1: create memory succeeds
      requestMock.mockResolvedValueOnce({
        data: { memory_id: 'mem-new' },
        error: null,
        throwOnError: () => ({}),
      });
      // Step 2: add fails
      const addError = { message: 'not found', status: 404 };
      requestMock.mockResolvedValueOnce({
        data: null,
        error: addError,
        throwOnError: () => { throw addError; },
      });

      const resource = createRelationshipsResource(http);
      const result = await resource.insertMemoryAt('user1', {
        relationship_id: 'rel-1',
        content: 'test',
        position: 0,
        version: 1,
      });

      expect(result.error).toBeTruthy();
      expect((result.error as any).context.memory_id).toBe('mem-new');
    });

    it('returns memory_id in error context when reorder fails', async () => {
      const requestMock = http.request as jest.Mock;
      // Step 1: create memory succeeds
      requestMock.mockResolvedValueOnce({
        data: { memory_id: 'mem-new' },
        error: null,
        throwOnError: () => ({}),
      });
      // Step 2: add succeeds
      requestMock.mockResolvedValueOnce({
        data: { relationship_id: 'rel-1', version: 3 },
        error: null,
        throwOnError: () => ({}),
      });
      // Step 3: reorder fails
      const reorderError = { message: 'conflict', status: 409 };
      requestMock.mockResolvedValueOnce({
        data: null,
        error: reorderError,
        throwOnError: () => { throw reorderError; },
      });

      const resource = createRelationshipsResource(http);
      const result = await resource.insertMemoryAt('user1', {
        relationship_id: 'rel-1',
        content: 'test',
        position: 0,
        version: 1,
      });

      expect(result.error).toBeTruthy();
      expect((result.error as any).context.memory_id).toBe('mem-new');
    });
  });

  // ── getOrderedContent ───────────────────────────────────────

  describe('getOrderedContent', () => {
    it('calls GET /api/app/v1/relationships/:id/ordered-content', async () => {
      const resource = createRelationshipsResource(http);
      await resource.getOrderedContent('user1', 'rel-123');

      expect(http.request).toHaveBeenCalledWith(
        'GET',
        '/api/app/v1/relationships/rel-123/ordered-content',
        { userId: 'user1', params: {} },
      );
    });

    it('passes pagination params', async () => {
      const resource = createRelationshipsResource(http);
      await resource.getOrderedContent('user1', 'rel-123', { limit: 10, offset: 20 });

      expect(http.request).toHaveBeenCalledWith(
        'GET',
        '/api/app/v1/relationships/rel-123/ordered-content',
        { userId: 'user1', params: { limit: '10', offset: '20' } },
      );
    });

    it('returns ordered items from server response', async () => {
      const mockResponse = {
        data: {
          relationship: { id: 'rel-1', relationship_type: 'list' },
          items: [
            { memory_id: 'a', _position: 0, content: 'first', tags: [], created_at: '2026-01-01' },
            { memory_id: 'b', _position: 1, content: 'second', tags: [], created_at: '2026-01-02' },
          ],
          total: 5,
          has_more: true,
        },
        error: null,
        throwOnError: () => ({}),
      };
      (http.request as jest.Mock).mockResolvedValue(mockResponse);

      const resource = createRelationshipsResource(http);
      const result = await resource.getOrderedContent('user1', 'rel-1', { limit: 2 });

      expect(result.data!.total).toBe(5);
      expect(result.data!.has_more).toBe(true);
      expect((result.data as any).items).toHaveLength(2);
    });

    it('handles offset for pagination', async () => {
      const resource = createRelationshipsResource(http);
      await resource.getOrderedContent('user1', 'rel-1', { offset: 5 });

      const call = (http.request as jest.Mock).mock.calls[0];
      expect(call[2].params).toEqual({ offset: '5' });
    });
  });
});
