import { getClient } from '../helpers/client.js';
import { TEST_USER_ID } from '../helpers/test-ids.js';

describe('Spaces (live)', () => {
  const client = getClient();
  let memoryId: string | null = null;
  let confirmationToken: string | null = null;

  afterAll(async () => {
    if (memoryId) {
      await client.memories.delete(TEST_USER_ID, memoryId, { reason: 'live-test-cleanup' });
    }
  });

  it('create a memory to publish', async () => {
    const res = await client.memories.create(TEST_USER_ID, {
      content: 'Live test: spaces publish test memory',
      type: 'fact',
      tags: ['live-test', 'spaces'],
    });

    expect(res.error).toBeNull();
    const data = res.data as any;
    expect(data.memory_id).toBeDefined();
    memoryId = data.memory_id;
  });

  it('publish memory to a space (get confirmation token)', async () => {
    if (!memoryId) return;

    const res = await client.spaces.publish(TEST_USER_ID, {
      memory_id: memoryId,
      spaces: ['the_void'],
    });

    if (res.error) {
      console.warn('Spaces publish returned error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    confirmationToken = data.confirmation_token || data.token || null;
  });

  it('confirm the publish via confirmations resource', async () => {
    if (!confirmationToken) return;

    const res = await client.confirmations.confirm(TEST_USER_ID, confirmationToken);

    if (res.error) {
      console.warn('Confirm publish returned error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('search the space', async () => {
    const res = await client.spaces.search(TEST_USER_ID, {
      query: 'spaces publish test',
      spaces: ['the_void'],
    });

    if (res.error) {
      console.warn('Space search returned error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('search the space with empty query (browse mode)', async () => {
    const res = await client.spaces.search(TEST_USER_ID, {
      query: '',
      spaces: ['the_void'],
      limit: 5,
    });

    if (res.error) {
      console.warn('Space search (empty query) returned error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memories).toBeDefined();
    expect(Array.isArray(data.memories)).toBe(true);
    expect(data.memories.length).toBeGreaterThan(0);
  });

  it('search the space with a query', async () => {
    const res = await client.spaces.search(TEST_USER_ID, {
      query: 'test',
      spaces: ['the_void'],
      limit: 5,
    });

    if (res.error) {
      console.warn('Space search (with query) returned error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    expect(data.memories).toBeDefined();
    expect(Array.isArray(data.memories)).toBe(true);
  });

  it('query() returns semantic search results from spaces', async () => {
    const res = await client.spaces.query(TEST_USER_ID, {
      query: 'test content',
      spaces: ['the_void'],
      limit: 5,
    });

    if (res.error) {
      console.warn('spaces.query error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('revise() updates published memory content', async () => {
    if (!memoryId) return;

    const res = await client.spaces.revise(TEST_USER_ID, {
      memory_id: memoryId,
      content: 'Revised content from live test',
      spaces: ['the_void'],
    });

    if (res.error) {
      console.warn('spaces.revise error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    // If revise returns a confirmation token, confirm it
    const data = res.data as any;
    const reviseToken = data.confirmation_token || data.token;
    if (reviseToken) {
      await client.confirmations.confirm(TEST_USER_ID, reviseToken);
    }
  });

  it('retract the published memory', async () => {
    if (!memoryId) return;

    const res = await client.spaces.retract(TEST_USER_ID, {
      memory_id: memoryId,
      spaces: ['the_void'],
    });

    if (res.error) {
      console.warn('Spaces retract returned error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    // If retract returns a confirmation token, confirm it
    const data = res.data as any;
    const retractToken = data.confirmation_token || data.token;
    if (retractToken) {
      await client.confirmations.confirm(TEST_USER_ID, retractToken);
    }
  });
});
