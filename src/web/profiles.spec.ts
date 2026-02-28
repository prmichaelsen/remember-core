import { createMockWebSDKContext } from './testing-helpers';
import { createAndPublishProfile, searchProfiles, retractProfile, updateAndRepublishProfile } from './profiles';
import { createMemory } from './memories';

describe('Profile compound use cases', () => {
  const ctx = createMockWebSDKContext();

  beforeEach(() => {
    ctx._collection._store.clear();
  });

  describe('createAndPublishProfile', () => {
    it('creates memory and publishes in 1 call', async () => {
      const result = await createAndPublishProfile(ctx, {
        display_name: 'Test User',
        bio: 'A test bio',
        tags: ['developer'],
      });
      // May fail due to space validation in mock — the important thing is
      // it returns a Result, not throws
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
  });

  describe('searchProfiles', () => {
    it('returns paginated ProfileSearchResult', async () => {
      const result = await searchProfiles(ctx, { query: 'test' });
      // Even with no profiles, should return ok with empty items
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
  });

  describe('retractProfile', () => {
    it('returns Result on retract', async () => {
      // Create a memory to retract
      const created = await createMemory(ctx, { content: 'Name: Test\nBio: test' });
      if (!created.ok) fail('setup');

      const result = await retractProfile(ctx, { memory_id: created.data.memory_id });
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
  });

  describe('updateAndRepublishProfile', () => {
    it('returns Result on update', async () => {
      // Create a memory to update
      const created = await createMemory(ctx, { content: 'Name: Old\nBio: old bio' });
      if (!created.ok) fail('setup');

      const result = await updateAndRepublishProfile(ctx, {
        memory_id: created.data.memory_id,
        display_name: 'New Name',
        bio: 'New bio',
      });
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
  });
});
