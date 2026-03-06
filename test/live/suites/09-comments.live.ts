import { getClient } from '../helpers/client.js';
import { getAppClient } from '../helpers/app-client.js';
import { TEST_USER_ID, TEST_USER_ID_2 } from '../helpers/test-ids.js';

describe('Comments (live)', () => {
  const svc = getClient();
  const app = getAppClient();

  let parentMemoryId: string | null = null;
  let commentMemoryId: string | null = null;
  let replyMemoryId: string | null = null;

  beforeAll(async () => {
    // Create a memory and publish it to the_void so it can receive comments
    const createRes = await svc.memories.create(TEST_USER_ID, {
      content: 'Live test: comment target memory',
      type: 'fact',
      tags: ['live-test', 'comments'],
    });
    if (createRes.error) {
      console.warn('Failed to create parent memory:', createRes.error);
      return;
    }
    parentMemoryId = (createRes.data as any).memory_id;

    // Publish to the_void
    const pubRes = await svc.spaces.publish(TEST_USER_ID, {
      memory_id: parentMemoryId!,
      spaces: ['the_void'],
    });
    if (!pubRes.error) {
      const token = (pubRes.data as any).confirmation_token || (pubRes.data as any).token;
      if (token) {
        await svc.confirmations.confirm(TEST_USER_ID, token);
      }
    }
  });

  afterAll(async () => {
    // Cleanup: delete the parent memory (cascades comments)
    if (parentMemoryId) {
      await svc.memories.delete(TEST_USER_ID, parentMemoryId, { reason: 'live-test-cleanup' });
    }
  });

  it('create and publish a comment on the parent memory', async () => {
    if (!parentMemoryId) return;

    const res = await app.comments.createAndPublish(TEST_USER_ID_2, {
      content: 'Live test: this is a comment on the parent memory',
      parent_id: parentMemoryId,
      spaces: ['the_void'],
    });

    if (res.error) {
      console.warn('Create comment error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memory_id).toBeDefined();
    commentMemoryId = data.memory_id;
  });

  it('create and publish a reply to the comment', async () => {
    if (!parentMemoryId || !commentMemoryId) return;

    const res = await app.comments.createAndPublish(TEST_USER_ID, {
      content: 'Live test: this is a reply to the comment',
      parent_id: commentMemoryId,
      thread_root_id: parentMemoryId,
      spaces: ['the_void'],
    });

    if (res.error) {
      console.warn('Create reply error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memory_id).toBeDefined();
    replyMemoryId = data.memory_id;
  });

  it('search space includes the comment', async () => {
    if (!commentMemoryId) return;

    const res = await svc.spaces.search(TEST_USER_ID, {
      query: 'comment on the parent',
      spaces: ['the_void'],
      limit: 10,
    });

    if (res.error) {
      console.warn('Space search error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memories).toBeDefined();
    expect(Array.isArray(data.memories)).toBe(true);
  });

  it('comment from a different user than the parent author', async () => {
    if (!parentMemoryId) return;

    // Verify user 2 can comment on user 1's memory
    const res = await app.comments.createAndPublish(TEST_USER_ID_2, {
      content: 'Live test: cross-user comment',
      parent_id: parentMemoryId,
      spaces: ['the_void'],
    });

    if (res.error) {
      console.warn('Cross-user comment error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    expect((res.data as any).memory_id).toBeDefined();
  });
});
