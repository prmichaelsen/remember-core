import {
  CollectionType,
  getCollectionName,
  parseCollectionName,
  validateCollectionName,
  isUserCollection,
  isSpacesCollection,
  isGroupCollection,
  InvalidCollectionNameError,
} from '../dot-notation.js';

describe('dot-notation', () => {
  describe('getCollectionName', () => {
    it('generates user collection name', () => {
      expect(getCollectionName(CollectionType.USERS, 'alice')).toBe('Memory_users_alice');
    });

    it('generates spaces collection name', () => {
      expect(getCollectionName(CollectionType.SPACES)).toBe('Memory_spaces_public');
    });

    it('generates group collection name', () => {
      expect(getCollectionName(CollectionType.GROUPS, 'g1')).toBe('Memory_groups_g1');
    });

    it('throws if USERS missing id', () => {
      expect(() => getCollectionName(CollectionType.USERS)).toThrow(InvalidCollectionNameError);
    });

    it('throws if GROUPS missing id', () => {
      expect(() => getCollectionName(CollectionType.GROUPS)).toThrow(InvalidCollectionNameError);
    });

    it('throws if user ID contains dots', () => {
      expect(() => getCollectionName(CollectionType.USERS, 'a.b')).toThrow(InvalidCollectionNameError);
    });

    it('throws if group ID contains dots', () => {
      expect(() => getCollectionName(CollectionType.GROUPS, 'a.b')).toThrow(InvalidCollectionNameError);
    });
  });

  describe('parseCollectionName', () => {
    it('parses user collection', () => {
      const result = parseCollectionName('Memory_users_alice');
      expect(result).toEqual({ type: CollectionType.USERS, id: 'alice', name: 'Memory_users_alice' });
    });

    it('parses spaces collection', () => {
      const result = parseCollectionName('Memory_spaces_public');
      expect(result).toEqual({ type: CollectionType.SPACES, id: undefined, name: 'Memory_spaces_public' });
    });

    it('parses group collection', () => {
      const result = parseCollectionName('Memory_groups_team1');
      expect(result).toEqual({ type: CollectionType.GROUPS, id: 'team1', name: 'Memory_groups_team1' });
    });

    it('throws for invalid format', () => {
      expect(() => parseCollectionName('invalid')).toThrow(InvalidCollectionNameError);
    });

    it('throws for non-public spaces', () => {
      expect(() => parseCollectionName('Memory_spaces_private')).toThrow(InvalidCollectionNameError);
    });
  });

  describe('validateCollectionName', () => {
    it('returns true for valid name', () => {
      expect(validateCollectionName('Memory_users_bob')).toBe(true);
    });

    it('returns false for invalid name', () => {
      expect(validateCollectionName('foo')).toBe(false);
    });
  });

  describe('type checks', () => {
    it('isUserCollection', () => {
      expect(isUserCollection('Memory_users_alice')).toBe(true);
      expect(isUserCollection('Memory_spaces_public')).toBe(false);
      expect(isUserCollection('invalid')).toBe(false);
    });

    it('isSpacesCollection', () => {
      expect(isSpacesCollection('Memory_spaces_public')).toBe(true);
      expect(isSpacesCollection('Memory_users_alice')).toBe(false);
    });

    it('isGroupCollection', () => {
      expect(isGroupCollection('Memory_groups_g1')).toBe(true);
      expect(isGroupCollection('Memory_users_alice')).toBe(false);
      expect(isGroupCollection('invalid')).toBe(false);
    });
  });
});
