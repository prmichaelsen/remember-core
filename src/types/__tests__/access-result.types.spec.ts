import type {
  AccessGranted,
  AccessInsufficientTrust,
  AccessBlocked,
  AccessNoPermission,
  AccessNotFound,
  AccessDeleted,
  AccessResult,
  AccessResultStatus,
} from '../access-result.types.js';

describe('AccessResult types', () => {
  describe('discriminated union narrowing', () => {
    it('narrows to AccessGranted', () => {
      const result: AccessResult = {
        status: 'granted',
        memory: { id: 'mem-1' } as any,
        access_level: 'owner',
      };
      if (result.status === 'granted') {
        expect(result.access_level).toBe('owner');
        expect(result.memory.id).toBe('mem-1');
      }
    });

    it('narrows to AccessInsufficientTrust', () => {
      const result: AccessResult = {
        status: 'insufficient_trust',
        memory_id: 'mem-1',
        required_trust: 0.75,
        actual_trust: 0.25,
        attempts_remaining: 2,
      };
      if (result.status === 'insufficient_trust') {
        expect(result.required_trust).toBe(0.75);
        expect(result.actual_trust).toBe(0.25);
        expect(result.attempts_remaining).toBe(2);
      }
    });

    it('narrows to AccessBlocked', () => {
      const result: AccessResult = {
        status: 'blocked',
        memory_id: 'mem-1',
        reason: 'Too many attempts',
        blocked_at: '2026-01-15T10:00:00Z',
      };
      if (result.status === 'blocked') {
        expect(result.reason).toBe('Too many attempts');
        expect(result.blocked_at).toBeDefined();
      }
    });

    it('narrows to AccessNoPermission', () => {
      const result: AccessResult = {
        status: 'no_permission',
        owner_user_id: 'owner-1',
        accessor_user_id: 'accessor-1',
      };
      if (result.status === 'no_permission') {
        expect(result.owner_user_id).toBe('owner-1');
        expect(result.accessor_user_id).toBe('accessor-1');
      }
    });

    it('narrows to AccessNotFound', () => {
      const result: AccessResult = {
        status: 'not_found',
        memory_id: 'mem-1',
      };
      if (result.status === 'not_found') {
        expect(result.memory_id).toBe('mem-1');
      }
    });

    it('narrows to AccessDeleted', () => {
      const result: AccessResult = {
        status: 'deleted',
        memory_id: 'mem-1',
        deleted_at: '2026-01-15T10:00:00Z',
      };
      if (result.status === 'deleted') {
        expect(result.memory_id).toBe('mem-1');
        expect(result.deleted_at).toBe('2026-01-15T10:00:00Z');
      }
    });
  });

  describe('switch statement exhaustiveness', () => {
    it('handles all 6 variants in a switch', () => {
      const variants: AccessResult[] = [
        { status: 'granted', memory: { id: '1' } as any, access_level: 'owner' },
        { status: 'insufficient_trust', memory_id: '1', required_trust: 0.5, actual_trust: 0.25, attempts_remaining: 2 },
        { status: 'blocked', memory_id: '1', reason: 'test', blocked_at: '2026-01-01' },
        { status: 'no_permission', owner_user_id: 'o', accessor_user_id: 'a' },
        { status: 'not_found', memory_id: '1' },
        { status: 'deleted', memory_id: '1', deleted_at: '2026-01-01' },
      ];

      const handled: string[] = [];
      for (const result of variants) {
        switch (result.status) {
          case 'granted': handled.push('granted'); break;
          case 'insufficient_trust': handled.push('insufficient_trust'); break;
          case 'blocked': handled.push('blocked'); break;
          case 'no_permission': handled.push('no_permission'); break;
          case 'not_found': handled.push('not_found'); break;
          case 'deleted': handled.push('deleted'); break;
        }
      }

      expect(handled).toEqual([
        'granted', 'insufficient_trust', 'blocked',
        'no_permission', 'not_found', 'deleted',
      ]);
    });
  });

  describe('AccessResultStatus', () => {
    it('includes all 6 status values', () => {
      const statuses: AccessResultStatus[] = [
        'granted', 'insufficient_trust', 'blocked',
        'no_permission', 'not_found', 'deleted',
      ];
      expect(statuses).toHaveLength(6);
    });
  });

  describe('AccessGranted access levels', () => {
    it('supports owner access level', () => {
      const result: AccessGranted = {
        status: 'granted',
        memory: { id: '1' } as any,
        access_level: 'owner',
      };
      expect(result.access_level).toBe('owner');
    });

    it('supports trusted access level', () => {
      const result: AccessGranted = {
        status: 'granted',
        memory: { id: '1' } as any,
        access_level: 'trusted',
      };
      expect(result.access_level).toBe('trusted');
    });
  });
});
