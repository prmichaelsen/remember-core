import {
  addToSpaceIds,
  removeFromSpaceIds,
  addToGroupIds,
  removeFromGroupIds,
  isPublishedToSpace,
  isPublishedToGroup,
  getPublishedLocations,
  isPublished,
  addMultipleSpaceIds,
  addMultipleGroupIds,
  initializeTracking,
} from '../tracking-arrays.js';

const base = () => ({ space_ids: [] as string[], group_ids: [] as string[] });

describe('tracking-arrays', () => {
  describe('addToSpaceIds', () => {
    it('adds a space ID', () => {
      const result = addToSpaceIds(base(), 'the_void');
      expect(result.space_ids).toEqual(['the_void']);
    });

    it('does not add duplicate', () => {
      const mem = { ...base(), space_ids: ['the_void'] };
      const result = addToSpaceIds(mem, 'the_void');
      expect(result.space_ids).toEqual(['the_void']);
    });

    it('returns new object (immutable)', () => {
      const original = base();
      const result = addToSpaceIds(original, 'the_void');
      expect(result).not.toBe(original);
      expect(original.space_ids).toEqual([]);
    });
  });

  describe('removeFromSpaceIds', () => {
    it('removes a space ID', () => {
      const mem = { ...base(), space_ids: ['the_void', 'dogs'] };
      const result = removeFromSpaceIds(mem, 'the_void');
      expect(result.space_ids).toEqual(['dogs']);
    });

    it('returns unchanged if ID not present', () => {
      const mem = { ...base(), space_ids: ['dogs'] };
      const result = removeFromSpaceIds(mem, 'the_void');
      expect(result.space_ids).toEqual(['dogs']);
    });
  });

  describe('addToGroupIds / removeFromGroupIds', () => {
    it('adds and removes group IDs', () => {
      let mem = base();
      mem = addToGroupIds(mem, 'group-1');
      expect(mem.group_ids).toEqual(['group-1']);
      mem = removeFromGroupIds(mem, 'group-1');
      expect(mem.group_ids).toEqual([]);
    });
  });

  describe('isPublishedToSpace / isPublishedToGroup', () => {
    it('returns true when published', () => {
      const mem = { ...base(), space_ids: ['the_void'], group_ids: ['g1'] };
      expect(isPublishedToSpace(mem, 'the_void')).toBe(true);
      expect(isPublishedToGroup(mem, 'g1')).toBe(true);
    });

    it('returns false when not published', () => {
      expect(isPublishedToSpace(base(), 'the_void')).toBe(false);
      expect(isPublishedToGroup(base(), 'g1')).toBe(false);
    });
  });

  describe('getPublishedLocations', () => {
    it('returns copy of both arrays', () => {
      const mem = { ...base(), space_ids: ['a', 'b'], group_ids: ['g1'] };
      const locs = getPublishedLocations(mem);
      expect(locs).toEqual({ spaces: ['a', 'b'], groups: ['g1'] });
      // Verify it's a copy
      locs.spaces.push('c');
      expect(mem.space_ids).toEqual(['a', 'b']);
    });
  });

  describe('isPublished', () => {
    it('returns false when no locations', () => {
      expect(isPublished(base())).toBe(false);
    });

    it('returns true with space', () => {
      expect(isPublished({ ...base(), space_ids: ['x'] })).toBe(true);
    });

    it('returns true with group', () => {
      expect(isPublished({ ...base(), group_ids: ['g'] })).toBe(true);
    });
  });

  describe('addMultipleSpaceIds', () => {
    it('adds multiple, deduplicating', () => {
      const mem = { ...base(), space_ids: ['a'] };
      const result = addMultipleSpaceIds(mem, ['a', 'b', 'c']);
      expect(result.space_ids).toEqual(['a', 'b', 'c']);
    });
  });

  describe('addMultipleGroupIds', () => {
    it('adds multiple groups, deduplicating', () => {
      const mem = { ...base(), group_ids: ['g1'] };
      const result = addMultipleGroupIds(mem, ['g1', 'g2']);
      expect(result.group_ids).toEqual(['g1', 'g2']);
    });
  });

  describe('initializeTracking', () => {
    it('adds empty arrays when missing', () => {
      const result = initializeTracking({ content: 'hello' });
      expect(result.space_ids).toEqual([]);
      expect(result.group_ids).toEqual([]);
      expect(result.content).toBe('hello');
    });

    it('preserves existing arrays', () => {
      const result = initializeTracking({ space_ids: ['x'], group_ids: ['g'] });
      expect(result.space_ids).toEqual(['x']);
      expect(result.group_ids).toEqual(['g']);
    });
  });
});
