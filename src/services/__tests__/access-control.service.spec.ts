import {
  checkMemoryAccess,
  handleInsufficientTrust,
  resolveAccessorTrustLevel,
  formatAccessResultMessage,
  canRevise,
  canOverwrite,
  TRUST_PENALTY,
  MAX_ATTEMPTS_BEFORE_BLOCK,
  StubGhostConfigProvider,
  InMemoryEscalationStore,
  type PublishedMemoryACL,
} from '../access-control.service.js';
import type { Memory } from '../../types/memory.types.js';
import type { GhostConfig } from '../../types/ghost-config.types.js';
import { DEFAULT_GHOST_CONFIG } from '../../types/ghost-config.types.js';
import type { AccessResult } from '../../types/access-result.types.js';
import type { UserCredentials } from '../../types/auth.types.js';

function createTestMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'mem-1',
    user_id: 'owner-1',
    doc_type: 'memory',
    content: 'Test content',
    type: 'note',
    weight: 0.5,
    trust: 0.5,
    location: { gps: null, address: null, source: 'unavailable', confidence: 0, is_approximate: true },
    context: { timestamp: '2026-01-15T10:00:00Z', source: { type: 'conversation' } },
    relationships: [],
    access_count: 0,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    version: 1,
    tags: [],
    base_weight: 0.5,
    ...overrides,
  };
}

function createGhostConfig(overrides: Partial<GhostConfig> = {}): GhostConfig {
  return { ...DEFAULT_GHOST_CONFIG, enabled: true, ...overrides };
}

describe('AccessControlService', () => {
  let ghostProvider: StubGhostConfigProvider;
  let escalationStore: InMemoryEscalationStore;

  beforeEach(() => {
    ghostProvider = new StubGhostConfigProvider();
    escalationStore = new InMemoryEscalationStore();
  });

  describe('checkMemoryAccess', () => {
    it('grants owner access (self-access)', async () => {
      const memory = createTestMemory({ user_id: 'user-1' });
      const result = await checkMemoryAccess('user-1', memory, ghostProvider, escalationStore);

      expect(result.status).toBe('granted');
      if (result.status === 'granted') {
        expect(result.access_level).toBe('owner');
        expect(result.memory).toBe(memory);
      }
    });

    it('returns no_permission when ghost not enabled', async () => {
      const memory = createTestMemory({ user_id: 'owner-1' });
      // ghostProvider has no config → returns null → ghost not enabled
      const result = await checkMemoryAccess('accessor-1', memory, ghostProvider, escalationStore);

      expect(result.status).toBe('no_permission');
    });

    it('returns no_permission when accessor is blocked by owner', async () => {
      const memory = createTestMemory({ user_id: 'owner-1' });
      ghostProvider.setGhostConfig('owner-1', createGhostConfig({
        blocked_users: ['accessor-1'],
      }));

      const result = await checkMemoryAccess('accessor-1', memory, ghostProvider, escalationStore);
      expect(result.status).toBe('no_permission');
    });

    it('returns blocked when memory-specific block exists', async () => {
      const memory = createTestMemory({ user_id: 'owner-1' });
      ghostProvider.setGhostConfig('owner-1', createGhostConfig({
        default_public_trust: 1.0,
      }));
      await escalationStore.setBlock('owner-1', 'accessor-1', 'mem-1', {
        blocked_at: '2026-01-15T10:00:00Z',
        reason: 'Too many attempts',
        attempt_count: 3,
      });

      const result = await checkMemoryAccess('accessor-1', memory, ghostProvider, escalationStore);
      expect(result.status).toBe('blocked');
      if (result.status === 'blocked') {
        expect(result.reason).toContain('Too many attempts');
      }
    });

    it('returns insufficient_trust when trust is too low', async () => {
      const memory = createTestMemory({ user_id: 'owner-1', trust: 0.75 });
      ghostProvider.setGhostConfig('owner-1', createGhostConfig({
        default_public_trust: 0.25,
      }));

      const result = await checkMemoryAccess('accessor-1', memory, ghostProvider, escalationStore);
      expect(result.status).toBe('insufficient_trust');
    });

    it('grants trusted access when trust is sufficient', async () => {
      const memory = createTestMemory({ user_id: 'owner-1', trust: 0.25 });
      ghostProvider.setGhostConfig('owner-1', createGhostConfig({
        default_public_trust: 0.5,
      }));

      const result = await checkMemoryAccess('accessor-1', memory, ghostProvider, escalationStore);
      expect(result.status).toBe('granted');
      if (result.status === 'granted') {
        expect(result.access_level).toBe('trusted');
      }
    });

    it('uses per-user trust override', async () => {
      const memory = createTestMemory({ user_id: 'owner-1', trust: 0.75 });
      ghostProvider.setGhostConfig('owner-1', createGhostConfig({
        default_public_trust: 0.0,
        per_user_trust: { 'accessor-1': 0.8 },
      }));

      const result = await checkMemoryAccess('accessor-1', memory, ghostProvider, escalationStore);
      expect(result.status).toBe('granted');
    });
  });

  describe('handleInsufficientTrust', () => {
    it('increments attempt count on each call', async () => {
      await handleInsufficientTrust('owner-1', 'accessor-1', 'mem-1', 0.75, 0.25, escalationStore);
      const attempts = await escalationStore.getAttempts('owner-1', 'accessor-1', 'mem-1');
      expect(attempts!.count).toBe(1);
    });

    it('returns insufficient_trust for attempts below block threshold', async () => {
      const result = await handleInsufficientTrust('owner-1', 'accessor-1', 'mem-1', 0.75, 0.25, escalationStore);
      expect(result.status).toBe('insufficient_trust');
      if (result.status === 'insufficient_trust') {
        expect(result.attempts_remaining).toBe(MAX_ATTEMPTS_BEFORE_BLOCK - 1);
      }
    });

    it('blocks after MAX_ATTEMPTS_BEFORE_BLOCK attempts', async () => {
      let result: AccessResult;
      for (let i = 0; i < MAX_ATTEMPTS_BEFORE_BLOCK; i++) {
        result = await handleInsufficientTrust('owner-1', 'accessor-1', 'mem-1', 0.75, 0.25, escalationStore);
      }
      expect(result!.status).toBe('blocked');
      if (result!.status === 'blocked') {
        expect(result!.reason).toContain('unauthorized attempts');
      }
    });

    it('applies trust penalty on insufficient trust', async () => {
      const result = await handleInsufficientTrust('owner-1', 'accessor-1', 'mem-1', 0.75, 0.5, escalationStore);
      if (result.status === 'insufficient_trust') {
        expect(result.actual_trust).toBe(Math.max(0, 0.5 - TRUST_PENALTY));
      }
    });

    it('trust floor is 0 (never negative)', async () => {
      const result = await handleInsufficientTrust('owner-1', 'accessor-1', 'mem-1', 0.75, 0.05, escalationStore);
      if (result.status === 'insufficient_trust') {
        expect(result.actual_trust).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('resolveAccessorTrustLevel', () => {
    it('returns per-user override when present', () => {
      const config = createGhostConfig({
        per_user_trust: { 'user-1': 0.8 },
        default_public_trust: 0.1,
      });
      expect(resolveAccessorTrustLevel(config, 'user-1')).toBe(0.8);
    });

    it('falls back to default_public_trust', () => {
      const config = createGhostConfig({ default_public_trust: 0.3 });
      expect(resolveAccessorTrustLevel(config, 'unknown-user')).toBe(0.3);
    });

    it('falls back to 0 when default_public_trust is not set', () => {
      const config = createGhostConfig({ default_public_trust: undefined as any });
      expect(resolveAccessorTrustLevel(config, 'unknown-user')).toBe(0);
    });
  });

  describe('formatAccessResultMessage', () => {
    it('formats granted (owner)', () => {
      const result: AccessResult = {
        status: 'granted',
        memory: createTestMemory(),
        access_level: 'owner',
      };
      expect(formatAccessResultMessage(result)).toContain('owner');
    });

    it('formats granted (trusted)', () => {
      const result: AccessResult = {
        status: 'granted',
        memory: createTestMemory(),
        access_level: 'trusted',
      };
      expect(formatAccessResultMessage(result)).toContain('trusted');
    });

    it('formats insufficient_trust', () => {
      const result: AccessResult = {
        status: 'insufficient_trust',
        memory_id: 'mem-1',
        required_trust: 0.75,
        actual_trust: 0.25,
        attempts_remaining: 2,
      };
      const msg = formatAccessResultMessage(result);
      expect(msg).toContain('0.75');
      expect(msg).toContain('0.25');
      expect(msg).toContain('2');
    });

    it('formats blocked', () => {
      const result: AccessResult = {
        status: 'blocked',
        memory_id: 'mem-1',
        reason: 'Too many attempts',
        blocked_at: '2026-01-15T10:00:00Z',
      };
      expect(formatAccessResultMessage(result)).toContain('Too many attempts');
    });

    it('formats no_permission', () => {
      const result: AccessResult = {
        status: 'no_permission',
        owner_user_id: 'owner-1',
        accessor_user_id: 'accessor-1',
      };
      expect(formatAccessResultMessage(result)).toContain('No permission');
    });

    it('formats not_found', () => {
      const result: AccessResult = {
        status: 'not_found',
        memory_id: 'mem-1',
      };
      expect(formatAccessResultMessage(result)).toContain('mem-1');
    });

    it('formats deleted', () => {
      const result: AccessResult = {
        status: 'deleted',
        memory_id: 'mem-1',
        deleted_at: '2026-01-15T10:00:00Z',
      };
      const msg = formatAccessResultMessage(result);
      expect(msg).toContain('mem-1');
      expect(msg).toContain('deleted');
    });
  });

  describe('canRevise', () => {
    it('owner can always revise', async () => {
      const memory: PublishedMemoryACL = { author_id: 'owner-1' };
      expect(await canRevise('owner-1', memory)).toBe(true);
    });

    it('owner_id takes precedence over author_id', async () => {
      const memory: PublishedMemoryACL = { author_id: 'original', owner_id: 'new-owner' };
      expect(await canRevise('new-owner', memory)).toBe(true);
      expect(await canRevise('original', memory)).toBe(false);
    });

    it('denies non-owner in owner_only mode', async () => {
      const memory: PublishedMemoryACL = { author_id: 'owner-1', write_mode: 'owner_only' };
      expect(await canRevise('other-user', memory)).toBe(false);
    });

    it('denies non-owner when write_mode is null (defaults to owner_only)', async () => {
      const memory: PublishedMemoryACL = { author_id: 'owner-1' };
      expect(await canRevise('other-user', memory)).toBe(false);
    });

    it('allows anyone in anyone mode', async () => {
      const memory: PublishedMemoryACL = { author_id: 'owner-1', write_mode: 'anyone' };
      expect(await canRevise('random-user', memory)).toBe(true);
    });

    it('checks group permissions in group_editors mode', async () => {
      const memory: PublishedMemoryACL = {
        author_id: 'owner-1',
        write_mode: 'group_editors',
        group_ids: ['group-1'],
      };

      const credentials: UserCredentials = {
        user_id: 'editor-1',
        group_memberships: [{
          group_id: 'group-1',
          permissions: {
            can_read: true, can_publish: false, can_revise: true, can_propose: false,
            can_overwrite: false, can_comment: false, can_retract_own: false,
            can_retract_any: false, can_manage_members: false, can_moderate: false,
          },
        }],
      };

      const result = await canRevise('editor-1', memory, () => Promise.resolve(credentials));
      expect(result).toBe(true);
    });

    it('denies in group_editors mode without can_revise permission', async () => {
      const memory: PublishedMemoryACL = {
        author_id: 'owner-1',
        write_mode: 'group_editors',
        group_ids: ['group-1'],
      };

      const credentials: UserCredentials = {
        user_id: 'reader-1',
        group_memberships: [{
          group_id: 'group-1',
          permissions: {
            can_read: true, can_publish: false, can_revise: false, can_propose: false,
            can_overwrite: false, can_comment: false, can_retract_own: false,
            can_retract_any: false, can_manage_members: false, can_moderate: false,
          },
        }],
      };

      const result = await canRevise('reader-1', memory, () => Promise.resolve(credentials));
      expect(result).toBe(false);
    });

    it('denies in group_editors mode without credentials fetcher', async () => {
      const memory: PublishedMemoryACL = {
        author_id: 'owner-1',
        write_mode: 'group_editors',
        group_ids: ['group-1'],
      };
      expect(await canRevise('editor-1', memory)).toBe(false);
    });
  });

  describe('canOverwrite', () => {
    it('owner can always overwrite', async () => {
      const memory: PublishedMemoryACL = { author_id: 'owner-1' };
      expect(await canOverwrite('owner-1', memory)).toBe(true);
    });

    it('allows explicit overwrite_allowed_ids grant', async () => {
      const memory: PublishedMemoryACL = {
        author_id: 'owner-1',
        write_mode: 'owner_only',
        overwrite_allowed_ids: ['special-user'],
      };
      expect(await canOverwrite('special-user', memory)).toBe(true);
    });

    it('denies non-owner without explicit grant in owner_only mode', async () => {
      const memory: PublishedMemoryACL = { author_id: 'owner-1', write_mode: 'owner_only' };
      expect(await canOverwrite('other-user', memory)).toBe(false);
    });

    it('allows anyone in anyone mode', async () => {
      const memory: PublishedMemoryACL = { author_id: 'owner-1', write_mode: 'anyone' };
      expect(await canOverwrite('random-user', memory)).toBe(true);
    });

    it('checks can_overwrite permission in group_editors mode', async () => {
      const memory: PublishedMemoryACL = {
        author_id: 'owner-1',
        write_mode: 'group_editors',
        group_ids: ['group-1'],
      };

      const credentials: UserCredentials = {
        user_id: 'admin-1',
        group_memberships: [{
          group_id: 'group-1',
          permissions: {
            can_read: true, can_publish: false, can_revise: false, can_propose: false,
            can_overwrite: true, can_comment: false, can_retract_own: false,
            can_retract_any: false, can_manage_members: false, can_moderate: false,
          },
        }],
      };

      const result = await canOverwrite('admin-1', memory, () => Promise.resolve(credentials));
      expect(result).toBe(true);
    });

    it('handles null overwrite_allowed_ids as empty array', async () => {
      const memory: PublishedMemoryACL = { author_id: 'owner-1' };
      expect(await canOverwrite('other-user', memory)).toBe(false);
    });
  });

  describe('InMemoryEscalationStore', () => {
    it('starts with no blocks', async () => {
      const block = await escalationStore.getBlock('owner', 'accessor', 'mem');
      expect(block).toBeNull();
    });

    it('sets and gets blocks', async () => {
      await escalationStore.setBlock('owner', 'accessor', 'mem', {
        blocked_at: '2026-01-15T10:00:00Z',
        reason: 'test',
        attempt_count: 3,
      });
      const block = await escalationStore.getBlock('owner', 'accessor', 'mem');
      expect(block).not.toBeNull();
      expect(block!.reason).toBe('test');
    });

    it('removes blocks', async () => {
      await escalationStore.setBlock('owner', 'accessor', 'mem', {
        blocked_at: '2026-01-15T10:00:00Z',
        reason: 'test',
        attempt_count: 3,
      });
      await escalationStore.removeBlock('owner', 'accessor', 'mem');
      const block = await escalationStore.getBlock('owner', 'accessor', 'mem');
      expect(block).toBeNull();
    });

    it('increments attempts', async () => {
      const r1 = await escalationStore.incrementAttempts('owner', 'accessor', 'mem');
      expect(r1.count).toBe(1);
      const r2 = await escalationStore.incrementAttempts('owner', 'accessor', 'mem');
      expect(r2.count).toBe(2);
    });

    it('tracks attempts per (owner, accessor, memory) triple', async () => {
      await escalationStore.incrementAttempts('owner', 'accessor', 'mem-1');
      await escalationStore.incrementAttempts('owner', 'accessor', 'mem-2');

      const a1 = await escalationStore.getAttempts('owner', 'accessor', 'mem-1');
      const a2 = await escalationStore.getAttempts('owner', 'accessor', 'mem-2');
      expect(a1!.count).toBe(1);
      expect(a2!.count).toBe(1);
    });
  });
});
