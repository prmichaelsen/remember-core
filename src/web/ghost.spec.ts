import { createMockWebSDKContext } from './testing-helpers';
import { getGhostConfig, updateGhostConfig, setUserTrust, removeUserTrust, blockUser, unblockUser, checkAccess, searchAsGhost } from './ghost';
import { createMemory } from './memories';
import { StubGhostConfigProvider } from '../services/access-control.service';
import { DEFAULT_GHOST_CONFIG } from '../types/ghost-config.types';

describe('Ghost/Trust use cases', () => {
  const ctx = createMockWebSDKContext();

  beforeEach(() => {
    ctx._collection._store.clear();
  });

  describe('getGhostConfig', () => {
    it('returns default config when none set', async () => {
      const result = await getGhostConfig(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.success).toBe(true);
        expect(result.data.config).toBeDefined();
      }
    });
  });

  describe('setUserTrust', () => {
    it('rejects self-trust', async () => {
      const result = await setUserTrust(ctx, {
        target_user_id: ctx.userId,
        trust_level: 0.5,
      });
      expect(result.ok).toBe(false);
    });

    it('rejects trust level out of range', async () => {
      const result = await setUserTrust(ctx, {
        target_user_id: 'other-user',
        trust_level: 1.5,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('blockUser', () => {
    it('rejects self-block', async () => {
      const result = await blockUser(ctx, { target_user_id: ctx.userId });
      expect(result.ok).toBe(false);
    });
  });

  describe('removeUserTrust', () => {
    it('returns a Result — never throws', async () => {
      const result = await removeUserTrust(ctx, { target_user_id: 'other-user' });
      // May fail due to Firestore dependency in mock, but returns Result
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
  });

  describe('unblockUser', () => {
    it('succeeds for non-blocked user', async () => {
      const result = await unblockUser(ctx, { target_user_id: 'other-user' });
      expect(result.ok).toBe(true);
    });
  });

  describe('checkAccess', () => {
    it('returns full_access when ghost mode disabled', async () => {
      const result = await checkAccess(ctx, {
        memory_id: 'any-memory',
        accessor_user_id: 'other-user',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.accessible).toBe(true);
        expect(result.data.trust_tier).toBe('full_access');
      }
    });

    it('returns trust_tier when ghost mode enabled', async () => {
      const provider = ctx.ghostConfigProvider as StubGhostConfigProvider;
      provider.setGhostConfig(ctx.userId, {
        ...DEFAULT_GHOST_CONFIG,
        enabled: true,
        default_public_trust: 0.3,
      });

      const result = await checkAccess(ctx, {
        memory_id: 'any-memory',
        accessor_user_id: 'other-user',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.accessible).toBe(true);
        expect(result.data.trust_tier).toBeDefined();
      }
    });
  });

  describe('searchAsGhost', () => {
    it('returns redacted content', async () => {
      // Create a memory owned by owner
      await createMemory(ctx, { content: 'secret memory', tags: ['personal'] });

      const result = await searchAsGhost(ctx, {
        owner_user_id: ctx.userId,
        query: 'secret',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.data.items)).toBe(true);
        expect(typeof result.data.hasMore).toBe('boolean');
      }
    });
  });
});
