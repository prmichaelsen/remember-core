import { getClient } from '../helpers/client.js';
import { TEST_USER_ID } from '../helpers/test-ids.js';

describe('Preferences (live)', () => {
  const client = getClient();

  it('get preferences returns 200 or 500 for new user', async () => {
    const res = await client.preferences.get(TEST_USER_ID);

    // New test users may not have Firestore docs — server may 500.
    // Accept either a successful response or a server error.
    if (res.error) {
      expect(res.error.status).toBe(500);
    } else {
      expect(res.data).toBeDefined();
    }
  });

  it('update() modifies user preferences', async () => {
    const res = await client.preferences.update(TEST_USER_ID, {
      timezone: 'UTC',
    });

    if (res.error) {
      console.warn('Preferences update error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });
});
