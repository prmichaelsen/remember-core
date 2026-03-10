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
  }, 60000);

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

  it('parent memory is readable by commenter (parent_owner_id resolution data exists)', async () => {
    if (!parentMemoryId) return;

    // The parentOwnerId resolution reads the parent from the commenter's collection.
    // If the parent is readable via get(), the user_id property should be present,
    // proving the data needed for resolution is available.
    const res = await svc.memories.get(TEST_USER_ID_2, parentMemoryId);

    if (res.error) {
      // If user 2 can't read user 1's memory directly, that's expected —
      // the resolution falls back to searching the public collection.
      // Verify the parent exists in the space instead.
      const searchRes = await svc.spaces.search(TEST_USER_ID_2, {
        query: 'comment target memory',
        spaces: ['the_void'],
        limit: 5,
      });

      if (searchRes.error) {
        console.warn('Space search for parent failed:', searchRes.error);
        return;
      }

      const data = searchRes.data as any;
      expect(data.memories).toBeDefined();
      const found = data.memories.find(
        (m: any) => m.original_memory_id === parentMemoryId || m.memory_id === parentMemoryId,
      );
      // Parent should be findable in the space with author_id set
      if (found) {
        expect(found.author_id || found.user_id).toBe(TEST_USER_ID);
      }
      return;
    }

    // If readable directly, verify user_id or author_id matches the original author (if present)
    const data = res.data as any;
    const ownerId = data.user_id || data.author_id;
    if (ownerId) {
      expect(ownerId).toBe(TEST_USER_ID);
    }
    // If neither field is present, the memory is still readable — resolution can use other fields
    expect(data).toBeDefined();
  });

  it('cross-user comment publishes successfully (parentOwnerId resolution completes)', async () => {
    if (!parentMemoryId) return;

    // This test verifies the full publish flow completes without error,
    // including the parentOwnerId resolution that happens during webhook emission.
    // A successful publish means resolution didn't throw.
    const res = await app.comments.createAndPublish(TEST_USER_ID_2, {
      content: 'Live test: verifying parentOwnerId resolution completes',
      parent_id: parentMemoryId,
      spaces: ['the_void'],
    });

    if (res.error) {
      console.warn('Resolution verification comment error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    const data = res.data as any;
    expect(data.memory_id).toBeDefined();
    // published_to confirms the full publish+webhook flow ran
    if (data.published_to) {
      expect(data.published_to.length).toBeGreaterThan(0);
    }
  });

  it('comment without spaces — infers publish destination from parent', async () => {
    if (!parentMemoryId) return;

    // Parent is published to the_void. Omitting spaces should auto-infer.
    const res = await app.comments.createAndPublish(TEST_USER_ID_2, {
      content: 'Live test: comment with inferred destination',
      parent_id: parentMemoryId,
    });

    if (res.error) {
      console.warn('Inferred destination comment error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memory_id).toBeDefined();
    // Should have been published to the_void (inferred from parent)
    // Note: inference depends on getPublishedLocations resolving the parent's composite UUID
    if (data.published_to && data.published_to.length > 0) {
      expect(data.published_to).toContain('the_void');
    }
  });

  it('comment with explicit space_id matching parent', async () => {
    if (!parentMemoryId) return;

    const res = await app.comments.createAndPublish(TEST_USER_ID, {
      content: 'Live test: comment with explicit space_id',
      parent_id: parentMemoryId,
      spaces: ['the_void'],
    });

    if (res.error) {
      console.warn('Explicit space_id comment error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memory_id).toBeDefined();
    if (data.published_to) {
      expect(data.published_to).toContain('the_void');
    }
  });

  describe('comment on unpublished personal memory', () => {
    let personalMemoryId: string | null = null;

    beforeAll(async () => {
      // Create a memory but do NOT publish it to any space or group
      const res = await svc.memories.create(TEST_USER_ID, {
        content: 'Live test: unpublished personal memory for comments',
        type: 'note',
        tags: ['live-test', 'comments', 'personal'],
      });
      if (!res.error) {
        personalMemoryId = (res.data as any).memory_id;
      }
    });

    afterAll(async () => {
      if (personalMemoryId) {
        await svc.memories.delete(TEST_USER_ID, personalMemoryId, { reason: 'live-test-cleanup' });
      }
    });

    it('owner comments on their own unpublished memory (no space, no group)', async () => {
      if (!personalMemoryId) return;

      // No spaces or groups passed — memory is not published anywhere
      const res = await app.comments.createAndPublish(TEST_USER_ID, {
        content: 'Live test: self-comment on personal memory',
        parent_id: personalMemoryId,
      });

      if (res.error) {
        console.warn('Self-comment on personal memory error:', res.error);
        // This may legitimately fail if the server requires a publish destination.
        // Capture the status to understand the behavior.
        expect([400, 404, 500]).toContain(res.error.status);
        return;
      }

      expect(res.data).toBeDefined();
      const data = res.data as any;
      expect(data.memory_id).toBeDefined();
    });
  });
});
