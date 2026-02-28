import {
  generateCompositeId,
  parseCompositeId,
  isCompositeId,
  validateCompositeId,
  getUserIdFromComposite,
  getMemoryIdFromComposite,
  belongsToUser,
  InvalidCompositeIdError,
} from '../composite-ids.js';

describe('composite-ids', () => {
  describe('generateCompositeId', () => {
    it('creates {userId}.{memoryId} format', () => {
      expect(generateCompositeId('user1', 'mem1')).toBe('user1.mem1');
    });

    it('throws if userId contains dots', () => {
      expect(() => generateCompositeId('user.1', 'mem1')).toThrow(InvalidCompositeIdError);
    });

    it('throws if memoryId contains dots', () => {
      expect(() => generateCompositeId('user1', 'mem.1')).toThrow(InvalidCompositeIdError);
    });

    it('throws if userId is empty', () => {
      expect(() => generateCompositeId('', 'mem1')).toThrow(InvalidCompositeIdError);
    });

    it('throws if memoryId is empty', () => {
      expect(() => generateCompositeId('user1', '')).toThrow(InvalidCompositeIdError);
    });

    it('throws if userId is whitespace only', () => {
      expect(() => generateCompositeId('   ', 'mem1')).toThrow(InvalidCompositeIdError);
    });
  });

  describe('parseCompositeId', () => {
    it('parses valid composite ID', () => {
      const result = parseCompositeId('user1.mem1');
      expect(result).toEqual({ userId: 'user1', memoryId: 'mem1' });
    });

    it('throws for ID without dot', () => {
      expect(() => parseCompositeId('nodot')).toThrow(InvalidCompositeIdError);
    });

    it('throws for ID with multiple dots', () => {
      expect(() => parseCompositeId('a.b.c')).toThrow(InvalidCompositeIdError);
    });

    it('throws for empty userId part', () => {
      expect(() => parseCompositeId('.mem1')).toThrow(InvalidCompositeIdError);
    });

    it('throws for empty memoryId part', () => {
      expect(() => parseCompositeId('user1.')).toThrow(InvalidCompositeIdError);
    });
  });

  describe('isCompositeId', () => {
    it('returns true for valid composite ID', () => {
      expect(isCompositeId('user1.mem1')).toBe(true);
    });

    it('returns false for invalid ID', () => {
      expect(isCompositeId('invalid')).toBe(false);
    });

    it('returns false for too many dots', () => {
      expect(isCompositeId('a.b.c')).toBe(false);
    });
  });

  describe('validateCompositeId', () => {
    it('returns true for valid ID', () => {
      expect(validateCompositeId('user1.mem1')).toBe(true);
    });

    it('throws for invalid ID', () => {
      expect(() => validateCompositeId('invalid')).toThrow(InvalidCompositeIdError);
    });
  });

  describe('getUserIdFromComposite', () => {
    it('extracts user ID', () => {
      expect(getUserIdFromComposite('user123.mem456')).toBe('user123');
    });
  });

  describe('getMemoryIdFromComposite', () => {
    it('extracts memory ID', () => {
      expect(getMemoryIdFromComposite('user123.mem456')).toBe('mem456');
    });
  });

  describe('belongsToUser', () => {
    it('returns true when userId matches', () => {
      expect(belongsToUser('user1.mem1', 'user1')).toBe(true);
    });

    it('returns false when userId does not match', () => {
      expect(belongsToUser('user1.mem1', 'user2')).toBe(false);
    });

    it('returns false for invalid composite ID', () => {
      expect(belongsToUser('invalid', 'user1')).toBe(false);
    });
  });

  describe('round-trip', () => {
    it('generate → parse preserves components', () => {
      const id = generateCompositeId('alice', 'abc-123');
      const parsed = parseCompositeId(id);
      expect(parsed.userId).toBe('alice');
      expect(parsed.memoryId).toBe('abc-123');
    });
  });
});
