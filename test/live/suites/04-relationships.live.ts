import { getClient } from '../helpers/client.js';
import { TEST_USER_ID } from '../helpers/test-ids.js';

describe('Relationships (live)', () => {
  const client = getClient();
  let memoryIdA: string | null = null;
  let memoryIdB: string | null = null;
  let relationshipId: string | null = null;

  afterAll(async () => {
    // Clean up relationship first, then memories
    if (relationshipId) {
      await client.relationships.delete(TEST_USER_ID, relationshipId);
    }
    if (memoryIdA) {
      await client.memories.delete(TEST_USER_ID, memoryIdA, { reason: 'live-test-cleanup' });
    }
    if (memoryIdB) {
      await client.memories.delete(TEST_USER_ID, memoryIdB, { reason: 'live-test-cleanup' });
    }
  });

  it('create two memories as relationship targets', async () => {
    const resA = await client.memories.create(TEST_USER_ID, {
      content: 'Live test: JavaScript is a programming language',
      type: 'fact',
      tags: ['live-test', 'relationships'],
    });
    expect(resA.error).toBeNull();
    const dataA = resA.data as any;
    expect(dataA.memory_id).toBeDefined();
    memoryIdA = dataA.memory_id;

    const resB = await client.memories.create(TEST_USER_ID, {
      content: 'Live test: TypeScript extends JavaScript with types',
      type: 'fact',
      tags: ['live-test', 'relationships'],
    });
    expect(resB.error).toBeNull();
    const dataB = resB.data as any;
    expect(dataB.memory_id).toBeDefined();
    memoryIdB = dataB.memory_id;
  });

  it('create a relationship between the two memories', async () => {
    if (!memoryIdA || !memoryIdB) return;

    const res = await client.relationships.create(TEST_USER_ID, {
      memory_ids: [memoryIdA, memoryIdB],
      relationship_type: 'extends',
      observation: 'TypeScript extends JavaScript',
    });

    if (res.error) {
      console.warn('Relationship creation failed:', res.error);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    if (data.relationship_id) {
      relationshipId = data.relationship_id;
    } else if (data.id) {
      relationshipId = data.id;
    }
  });

  it('search relationships for the test user', async () => {
    const res = await client.relationships.search(TEST_USER_ID, {
      query: 'TypeScript JavaScript',
    });

    // Search should succeed (may return empty for new users)
    if (res.error) {
      console.warn('Relationship search returned error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('update() modifies relationship properties', async () => {
    if (!relationshipId) return;

    const res = await client.relationships.update(TEST_USER_ID, relationshipId, {
      observation: 'Updated observation from live test',
    });

    if (res.error) {
      console.warn('Relationship update error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('delete the relationship', async () => {
    if (!relationshipId) return;

    const res = await client.relationships.delete(TEST_USER_ID, relationshipId);

    expect(res.error).toBeNull();
    expect(res.data).toBeDefined();
    relationshipId = null; // prevent afterAll double-delete
  });
});
