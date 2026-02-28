import {
  InMemoryEscalationStore,
  TRUST_PENALTY,
  MAX_ATTEMPTS_BEFORE_BLOCK,
  handleInsufficientTrust,
  isMemoryBlocked,
  resetBlock,
} from '../access-control.service.js';

describe('EscalationService', () => {
  let store: InMemoryEscalationStore;

  beforeEach(() => {
    store = new InMemoryEscalationStore();
  });

  describe('constants', () => {
    it('TRUST_PENALTY is 0.1', () => {
      expect(TRUST_PENALTY).toBe(0.1);
    });

    it('MAX_ATTEMPTS_BEFORE_BLOCK is 3', () => {
      expect(MAX_ATTEMPTS_BEFORE_BLOCK).toBe(3);
    });
  });

  describe('attempt tracking', () => {
    it('first attempt returns count 1', async () => {
      const result = await store.incrementAttempts('owner', 'accessor', 'mem');
      expect(result.count).toBe(1);
      expect(result.last_attempt_at).toBeDefined();
    });

    it('second attempt returns count 2', async () => {
      await store.incrementAttempts('owner', 'accessor', 'mem');
      const result = await store.incrementAttempts('owner', 'accessor', 'mem');
      expect(result.count).toBe(2);
    });

    it('third attempt returns count 3', async () => {
      await store.incrementAttempts('owner', 'accessor', 'mem');
      await store.incrementAttempts('owner', 'accessor', 'mem');
      const result = await store.incrementAttempts('owner', 'accessor', 'mem');
      expect(result.count).toBe(3);
    });

    it('returns null for no prior attempts', async () => {
      const result = await store.getAttempts('owner', 'accessor', 'mem');
      expect(result).toBeNull();
    });

    it('tracks per-memory independently', async () => {
      await store.incrementAttempts('owner', 'accessor', 'mem-1');
      await store.incrementAttempts('owner', 'accessor', 'mem-1');
      await store.incrementAttempts('owner', 'accessor', 'mem-2');

      const a1 = await store.getAttempts('owner', 'accessor', 'mem-1');
      const a2 = await store.getAttempts('owner', 'accessor', 'mem-2');
      expect(a1!.count).toBe(2);
      expect(a2!.count).toBe(1);
    });

    it('tracks per-accessor independently', async () => {
      await store.incrementAttempts('owner', 'accessor-1', 'mem');
      await store.incrementAttempts('owner', 'accessor-2', 'mem');

      const a1 = await store.getAttempts('owner', 'accessor-1', 'mem');
      const a2 = await store.getAttempts('owner', 'accessor-2', 'mem');
      expect(a1!.count).toBe(1);
      expect(a2!.count).toBe(1);
    });
  });

  describe('escalation flow via handleInsufficientTrust', () => {
    it('first attempt: insufficient_trust with penalty', async () => {
      const result = await handleInsufficientTrust(
        'owner', 'accessor', 'mem', 0.75, 0.5, store
      );
      expect(result.status).toBe('insufficient_trust');
      if (result.status === 'insufficient_trust') {
        expect(result.actual_trust).toBe(0.5 - TRUST_PENALTY);
        expect(result.attempts_remaining).toBe(MAX_ATTEMPTS_BEFORE_BLOCK - 1);
      }
    });

    it('second attempt: insufficient_trust with reduced attempts remaining', async () => {
      await handleInsufficientTrust('owner', 'accessor', 'mem', 0.75, 0.5, store);
      const result = await handleInsufficientTrust(
        'owner', 'accessor', 'mem', 0.75, 0.5, store
      );
      if (result.status === 'insufficient_trust') {
        expect(result.attempts_remaining).toBe(MAX_ATTEMPTS_BEFORE_BLOCK - 2);
      }
    });

    it('third attempt: blocked', async () => {
      await handleInsufficientTrust('owner', 'accessor', 'mem', 0.75, 0.5, store);
      await handleInsufficientTrust('owner', 'accessor', 'mem', 0.75, 0.5, store);
      const result = await handleInsufficientTrust(
        'owner', 'accessor', 'mem', 0.75, 0.5, store
      );
      expect(result.status).toBe('blocked');
      if (result.status === 'blocked') {
        expect(result.reason).toContain('3');
        expect(result.blocked_at).toBeDefined();
      }
    });

    it('trust floor at 0 (never negative)', async () => {
      const result = await handleInsufficientTrust(
        'owner', 'accessor', 'mem', 0.75, 0.05, store
      );
      if (result.status === 'insufficient_trust') {
        expect(result.actual_trust).toBe(0);
      }
    });

    it('trust floor at 0 for zero trust', async () => {
      const result = await handleInsufficientTrust(
        'owner', 'accessor', 'mem', 0.75, 0.0, store
      );
      if (result.status === 'insufficient_trust') {
        expect(result.actual_trust).toBe(0);
      }
    });
  });

  describe('isMemoryBlocked', () => {
    it('returns false when no block exists', async () => {
      const result = await isMemoryBlocked('owner', 'accessor', 'mem', store);
      expect(result).toBe(false);
    });

    it('returns true after block is set', async () => {
      // Trigger block via 3 failed attempts
      for (let i = 0; i < MAX_ATTEMPTS_BEFORE_BLOCK; i++) {
        await handleInsufficientTrust('owner', 'accessor', 'mem', 0.75, 0.5, store);
      }
      const result = await isMemoryBlocked('owner', 'accessor', 'mem', store);
      expect(result).toBe(true);
    });
  });

  describe('resetBlock', () => {
    it('clears an existing block', async () => {
      // Set a block
      for (let i = 0; i < MAX_ATTEMPTS_BEFORE_BLOCK; i++) {
        await handleInsufficientTrust('owner', 'accessor', 'mem', 0.75, 0.5, store);
      }
      expect(await isMemoryBlocked('owner', 'accessor', 'mem', store)).toBe(true);

      // Reset
      await resetBlock('owner', 'accessor', 'mem', store);
      expect(await isMemoryBlocked('owner', 'accessor', 'mem', store)).toBe(false);
    });

    it('is safe to call when no block exists', async () => {
      await expect(resetBlock('owner', 'accessor', 'mem', store)).resolves.not.toThrow();
    });
  });

  describe('block management', () => {
    it('setBlock and getBlock round-trip', async () => {
      await store.setBlock('owner', 'accessor', 'mem', {
        blocked_at: '2026-01-15T10:00:00Z',
        reason: 'Escalation limit',
        attempt_count: 3,
      });

      const block = await store.getBlock('owner', 'accessor', 'mem');
      expect(block).not.toBeNull();
      expect(block!.reason).toBe('Escalation limit');
      expect(block!.attempt_count).toBe(3);
    });

    it('removeBlock clears the block', async () => {
      await store.setBlock('owner', 'accessor', 'mem', {
        blocked_at: '2026-01-15T10:00:00Z',
        reason: 'test',
        attempt_count: 3,
      });
      await store.removeBlock('owner', 'accessor', 'mem');
      expect(await store.getBlock('owner', 'accessor', 'mem')).toBeNull();
    });
  });
});
