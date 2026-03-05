import {
  validateGhostConfigUpdate,
} from '../ghost-config.service.js';
import {
  handleGetConfig,
  handleUpdateConfig,
  handleSetTrust,
  handleRemoveTrust,
  handleBlockUser,
  handleUnblockUser,
} from '../ghost-config-handler.service.js';
import {
  StubGhostConfigProvider,
} from '../access-control.service.js';
import type { GhostConfig } from '../../types/ghost-config.types.js';
import { DEFAULT_GHOST_CONFIG } from '../../types/ghost-config.types.js';
import { TrustLevel } from '../../types/trust.types.js';

describe('GhostConfigService', () => {
  describe('validateGhostConfigUpdate', () => {
    it('accepts valid config updates', () => {
      expect(() => validateGhostConfigUpdate({
        enabled: true,
        default_friend_trust: TrustLevel.CONFIDENTIAL,
        default_public_trust: TrustLevel.INTERNAL,
        enforcement_mode: 'query',
      })).not.toThrow();
    });

    it('rejects default_friend_trust below 1', () => {
      expect(() => validateGhostConfigUpdate({
        default_friend_trust: 0 as any,
      })).toThrow('between 1 and 5');
    });

    it('rejects default_friend_trust above 5', () => {
      expect(() => validateGhostConfigUpdate({
        default_friend_trust: 6 as any,
      })).toThrow('between 1 and 5');
    });

    it('rejects non-integer default_friend_trust', () => {
      expect(() => validateGhostConfigUpdate({
        default_friend_trust: 2.5 as any,
      })).toThrow('between 1 and 5');
    });

    it('rejects default_public_trust below 1', () => {
      expect(() => validateGhostConfigUpdate({
        default_public_trust: 0 as any,
      })).toThrow('between 1 and 5');
    });

    it('rejects default_public_trust above 5', () => {
      expect(() => validateGhostConfigUpdate({
        default_public_trust: 6 as any,
      })).toThrow('between 1 and 5');
    });

    it('rejects invalid enforcement_mode', () => {
      expect(() => validateGhostConfigUpdate({
        enforcement_mode: 'invalid' as any,
      })).toThrow('enforcement_mode');
    });

    it('accepts all valid enforcement modes', () => {
      for (const mode of ['query', 'prompt', 'hybrid'] as const) {
        expect(() => validateGhostConfigUpdate({
          enforcement_mode: mode,
        })).not.toThrow();
      }
    });

    it('rejects invalid per_user_trust values', () => {
      expect(() => validateGhostConfigUpdate({
        per_user_trust: { 'user-1': 6 as any },
      })).toThrow('between 1 and 5');
    });

    it('accepts valid per_user_trust values', () => {
      expect(() => validateGhostConfigUpdate({
        per_user_trust: { 'user-1': TrustLevel.CONFIDENTIAL, 'user-2': TrustLevel.SECRET },
      })).not.toThrow();
    });

    it('accepts empty update', () => {
      expect(() => validateGhostConfigUpdate({})).not.toThrow();
    });
  });

  describe('StubGhostConfigProvider', () => {
    it('returns null when no config set', async () => {
      const provider = new StubGhostConfigProvider();
      const config = await provider.getGhostConfig('user-1');
      expect(config).toBeNull();
    });

    it('returns config when set', async () => {
      const provider = new StubGhostConfigProvider();
      const config: GhostConfig = { ...DEFAULT_GHOST_CONFIG, enabled: true };
      provider.setGhostConfig('user-1', config);

      const result = await provider.getGhostConfig('user-1');
      expect(result).toEqual(config);
    });

    it('returns different configs for different users', async () => {
      const provider = new StubGhostConfigProvider();
      provider.setGhostConfig('user-1', { ...DEFAULT_GHOST_CONFIG, enabled: true });
      provider.setGhostConfig('user-2', { ...DEFAULT_GHOST_CONFIG, enabled: false });

      const r1 = await provider.getGhostConfig('user-1');
      const r2 = await provider.getGhostConfig('user-2');
      expect(r1!.enabled).toBe(true);
      expect(r2!.enabled).toBe(false);
    });
  });

  describe('DEFAULT_GHOST_CONFIG', () => {
    it('has ghost disabled by default', () => {
      expect(DEFAULT_GHOST_CONFIG.enabled).toBe(false);
    });

    it('has public ghost disabled by default', () => {
      expect(DEFAULT_GHOST_CONFIG.public_ghost_enabled).toBe(false);
    });

    it('has default friend trust of INTERNAL (2)', () => {
      expect(DEFAULT_GHOST_CONFIG.default_friend_trust).toBe(TrustLevel.INTERNAL);
    });

    it('has default public trust of PUBLIC (1)', () => {
      expect(DEFAULT_GHOST_CONFIG.default_public_trust).toBe(TrustLevel.PUBLIC);
    });

    it('has empty per_user_trust', () => {
      expect(DEFAULT_GHOST_CONFIG.per_user_trust).toEqual({});
    });

    it('has empty blocked_users', () => {
      expect(DEFAULT_GHOST_CONFIG.blocked_users).toEqual([]);
    });

    it('has query enforcement mode', () => {
      expect(DEFAULT_GHOST_CONFIG.enforcement_mode).toBe('query');
    });
  });
});

describe('GhostConfigHandler', () => {
  // Note: handleGetConfig/handleUpdateConfig/etc. depend on Firestore.
  // We test the validation and self-blocking logic that doesn't require Firestore.

  describe('handleSetTrust', () => {
    it('rejects setting trust for yourself', async () => {
      // This validation is in the handler, not in the Firestore service
      const result = await handleSetTrust('user-1', 'user-1', TrustLevel.CONFIDENTIAL);
      expect(result.success).toBe(false);
      expect(result.message).toContain('yourself');
    });

    it('rejects invalid trust level (below 1)', async () => {
      const result = await handleSetTrust('user-1', 'user-2', 0);
      expect(result.success).toBe(false);
      expect(result.message).toContain('between 1 and 5');
    });

    it('rejects invalid trust level (above 5)', async () => {
      const result = await handleSetTrust('user-1', 'user-2', 6);
      expect(result.success).toBe(false);
      expect(result.message).toContain('between 1 and 5');
    });

    it('rejects non-integer trust level', async () => {
      const result = await handleSetTrust('user-1', 'user-2', 2.5);
      expect(result.success).toBe(false);
      expect(result.message).toContain('between 1 and 5');
    });
  });

  describe('handleBlockUser', () => {
    it('rejects blocking yourself', async () => {
      const result = await handleBlockUser('user-1', 'user-1');
      expect(result.success).toBe(false);
      expect(result.message).toContain('yourself');
    });
  });
});
