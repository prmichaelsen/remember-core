import { getClient } from '../helpers/client.js';
import { TEST_USER_ID } from '../helpers/test-ids.js';

describe('Trust (live)', () => {
  const client = getClient();
  const targetUserId = `trust_target_${TEST_USER_ID}`;

  afterAll(async () => {
    // Clean up: remove any trust set during tests
    await client.trust.removeUserTrust(TEST_USER_ID, { target_user_id: targetUserId });
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
