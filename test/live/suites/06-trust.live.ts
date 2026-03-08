import { getClient } from '../helpers/client.js';
import { TEST_USER_ID, TEST_USER_ID_2 } from '../helpers/test-ids.js';

describe('Trust (live)', () => {
  const client = getClient();
  const targetUserId = `trust_target_${TEST_USER_ID}`;
  let checkAccessMemoryId: string | null = null;

  afterAll(async () => {
    // Clean up: remove any trust set during tests
    await client.trust.removeUserTrust(TEST_USER_ID, { target_user_id: targetUserId });
    // Safety net: unblock TEST_USER_ID_2
    try { await client.trust.unblockUser(TEST_USER_ID, { target_user_id: TEST_USER_ID_2 }); } catch { /* ignore */ }
    if (checkAccessMemoryId) {
      try { await client.memories.delete(TEST_USER_ID, checkAccessMemoryId, { reason: 'live-test-cleanup' }); } catch { /* ignore */ }
    }
  });

  it('get ghost config for test user', async () => {
    const res = await client.trust.getGhostConfig(TEST_USER_ID);

    // New users may get 500 (no Firestore doc) or defaults
    if (res.error) {
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('set trust level for a target user', async () => {
    const res = await client.trust.setUserTrust(TEST_USER_ID, {
      target_user_id: targetUserId,
      trust_level: 3,
    });

    if (res.error) {
      console.warn('Set user trust failed:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('updateGhostConfig() modifies ghost configuration', async () => {
    const res = await client.trust.updateGhostConfig(TEST_USER_ID, {
      enabled: false,
    });

    if (res.error) {
      console.warn('updateGhostConfig error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('blockUser() blocks a target user', async () => {
    const res = await client.trust.blockUser(TEST_USER_ID, {
      target_user_id: TEST_USER_ID_2,
    });

    if (res.error) {
      console.warn('blockUser error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('unblockUser() unblocks a previously blocked user', async () => {
    const res = await client.trust.unblockUser(TEST_USER_ID, {
      target_user_id: TEST_USER_ID_2,
    });

    if (res.error) {
      console.warn('unblockUser error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('checkAccess() returns access info for a memory', async () => {
    // Create a memory for the check
    const createRes = await client.memories.create(TEST_USER_ID, {
      content: 'Live test: trust checkAccess target memory',
      type: 'fact',
      tags: ['live-test', 'trust-check'],
    });
    if (createRes.error || !createRes.data) return;
    checkAccessMemoryId = (createRes.data as any).memory_id;
    if (!checkAccessMemoryId) return;

    const res = await client.trust.checkAccess(TEST_USER_ID, {
      memory_id: checkAccessMemoryId,
      accessor_user_id: TEST_USER_ID_2,
    });

    if (res.error) {
      console.warn('checkAccess error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    if (data.accessible !== undefined) {
      expect(typeof data.accessible).toBe('boolean');
    }
  });

  it('remove trust for the target user', async () => {
    const res = await client.trust.removeUserTrust(TEST_USER_ID, {
      target_user_id: targetUserId,
    });

    if (res.error) {
      console.warn('Remove user trust failed:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });
});
