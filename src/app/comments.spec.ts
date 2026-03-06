// src/app/comments.spec.ts
import { createCommentsResource } from './comments';
import type { HttpClient } from '../clients/http';

function createMockHttpClient(): HttpClient {
  return {
    request: jest.fn().mockResolvedValue({ data: {}, error: null, throwOnError: () => ({}) }),
  } as unknown as HttpClient;
}

describe('CommentsResource', () => {
  let http: HttpClient;

  beforeEach(() => {
    http = createMockHttpClient();
  });

  it('createAndPublish calls POST /api/app/v1/spaces/comments', async () => {
    const comments = createCommentsResource(http);
    await comments.createAndPublish('user1', {
      content: 'Great post!',
      parent_id: 'mem-abc',
    });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/app/v1/spaces/comments', {
      userId: 'user1',
      body: { content: 'Great post!', parent_id: 'mem-abc' },
    });
  });

  it('passes optional fields through', async () => {
    const comments = createCommentsResource(http);
    await comments.createAndPublish('user1', {
      content: 'Threaded reply',
      parent_id: 'mem-abc',
      thread_root_id: 'mem-root',
      spaces: ['space-1'],
      groups: ['group-1'],
      tags: ['discussion'],
    });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/app/v1/spaces/comments', {
      userId: 'user1',
      body: {
        content: 'Threaded reply',
        parent_id: 'mem-abc',
        thread_root_id: 'mem-root',
        spaces: ['space-1'],
        groups: ['group-1'],
        tags: ['discussion'],
      },
    });
  });
});
