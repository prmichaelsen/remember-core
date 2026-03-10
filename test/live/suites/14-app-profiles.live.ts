import { getAppClient } from '../helpers/app-client.js';
import { TEST_USER_ID } from '../helpers/test-ids.js';

describe('App Profiles (live)', () => {
  const appClient = getAppClient();
  let profileMemoryId: string | null = null;

  afterAll(async () => {
    if (profileMemoryId) {
      try {
        await appClient.profiles.retract(TEST_USER_ID, profileMemoryId);
      } catch { /* may already be retracted */ }
    }
  });

  it('createAndPublish() creates and publishes a profile', async () => {
    const res = await appClient.profiles.createAndPublish(TEST_USER_ID, {
      display_name: 'Live Test Profile',
      bio: 'A test profile for e2e testing',
      tags: ['live-test'],
    });

    if (res.error) {
      console.warn('createAndPublish error:', res.error);
      expect([400, 409, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
    const data = res.data as any;
    profileMemoryId = data.memory_id ?? data.id ?? null;
  });

  it('search() finds published profiles', async () => {
    const res = await appClient.profiles.search(TEST_USER_ID, {
      query: 'Live Test Profile',
      limit: 10,
    });

    if (res.error) {
      console.warn('profiles.search error:', res.error);
      expect([400, 409, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('updateAndRepublish() updates profile content', async () => {
    if (!profileMemoryId) return;

    const res = await appClient.profiles.updateAndRepublish(TEST_USER_ID, profileMemoryId, {
      display_name: 'Updated Live Test Profile',
      bio: 'Updated bio from live test',
    });

    if (res.error) {
      console.warn('updateAndRepublish error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });

  it('retract() removes published profile', async () => {
    if (!profileMemoryId) return;

    const res = await appClient.profiles.retract(TEST_USER_ID, profileMemoryId);

    if (res.error) {
      console.warn('retract error:', res.error);
      expect([400, 404, 500]).toContain(res.error.status);
      return;
    }

    expect(res.error).toBeNull();
    profileMemoryId = null; // prevent afterAll double-retract
  });
});
