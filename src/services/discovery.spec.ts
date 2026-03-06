import { interleaveDiscovery, DISCOVERY_RATIO } from './discovery';

describe('interleaveDiscovery', () => {
  // Helper to create test items
  const rated = (ids: number[]) => ids.map((id) => ({ id: `r${id}` }));
  const discovery = (ids: number[]) => ids.map((id) => ({ id: `d${id}` }));

  describe('basic interleaving at 4:1 ratio', () => {
    it('places discovery items at positions 5, 10 (1-indexed)', () => {
      const result = interleaveDiscovery({
        rated: rated([1, 2, 3, 4, 5, 6, 7, 8]),
        discovery: discovery([1, 2]),
      });

      expect(result).toHaveLength(10);
      // Positions 0-3: rated, position 4: discovery
      expect(result[0]).toEqual({ item: { id: 'r1' }, is_discovery: false });
      expect(result[1]).toEqual({ item: { id: 'r2' }, is_discovery: false });
      expect(result[2]).toEqual({ item: { id: 'r3' }, is_discovery: false });
      expect(result[3]).toEqual({ item: { id: 'r4' }, is_discovery: false });
      expect(result[4]).toEqual({ item: { id: 'd1' }, is_discovery: true });
      // Positions 5-8: rated, position 9: discovery
      expect(result[5]).toEqual({ item: { id: 'r5' }, is_discovery: false });
      expect(result[9]).toEqual({ item: { id: 'd2' }, is_discovery: true });
    });

    it('sets is_discovery flag correctly', () => {
      const result = interleaveDiscovery({
        rated: rated([1, 2, 3, 4]),
        discovery: discovery([1]),
      });

      const discoveryItems = result.filter((r) => r.is_discovery);
      const ratedItems = result.filter((r) => !r.is_discovery);
      expect(discoveryItems).toHaveLength(1);
      expect(ratedItems).toHaveLength(4);
    });

    it('uses default ratio of 4', () => {
      expect(DISCOVERY_RATIO).toBe(4);
    });
  });

  describe('pool exhaustion', () => {
    it('fills with rated content when discovery pool is empty', () => {
      const result = interleaveDiscovery({
        rated: rated([1, 2, 3, 4, 5]),
        discovery: [],
      });

      expect(result).toHaveLength(5);
      expect(result.every((r) => !r.is_discovery)).toBe(true);
    });

    it('fills with discovery content when rated pool is empty', () => {
      const result = interleaveDiscovery({
        rated: [],
        discovery: discovery([1, 2, 3]),
      });

      expect(result).toHaveLength(3);
      expect(result.every((r) => r.is_discovery)).toBe(true);
    });

    it('returns empty array when both pools are empty', () => {
      const result = interleaveDiscovery({ rated: [], discovery: [] });
      expect(result).toEqual([]);
    });

    it('fills remaining discovery slots with rated when discovery runs out', () => {
      // 8 rated, 1 discovery — slot at position 5 is discovery, slot at position 10 is filled by rated
      const result = interleaveDiscovery({
        rated: rated([1, 2, 3, 4, 5, 6, 7, 8]),
        discovery: discovery([1]),
      });

      expect(result).toHaveLength(9);
      expect(result[4]).toEqual({ item: { id: 'd1' }, is_discovery: true });
      // All other items are rated
      const ratedCount = result.filter((r) => !r.is_discovery).length;
      expect(ratedCount).toBe(8);
    });

    it('fills remaining rated slots with discovery when rated runs out', () => {
      const result = interleaveDiscovery({
        rated: rated([1]),
        discovery: discovery([1, 2, 3]),
      });

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ item: { id: 'r1' }, is_discovery: false });
      // Remaining slots filled from discovery
      const discoveryCount = result.filter((r) => r.is_discovery).length;
      expect(discoveryCount).toBe(3);
    });
  });

  describe('single item pools', () => {
    it('handles 1 rated + 0 discovery', () => {
      const result = interleaveDiscovery({
        rated: rated([1]),
        discovery: [],
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ item: { id: 'r1' }, is_discovery: false });
    });

    it('handles 0 rated + 1 discovery', () => {
      const result = interleaveDiscovery({
        rated: [],
        discovery: discovery([1]),
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ item: { id: 'd1' }, is_discovery: true });
    });
  });

  describe('offset and limit', () => {
    it('applies offset correctly', () => {
      const result = interleaveDiscovery({
        rated: rated([1, 2, 3, 4, 5, 6, 7, 8]),
        discovery: discovery([1, 2]),
        offset: 3,
      });

      // Full merged: r1,r2,r3,r4,d1,r5,r6,r7,r8,d2
      // After offset 3: r4,d1,r5,r6,r7,r8,d2
      expect(result).toHaveLength(7);
      expect(result[0]).toEqual({ item: { id: 'r4' }, is_discovery: false });
      expect(result[1]).toEqual({ item: { id: 'd1' }, is_discovery: true });
    });

    it('applies limit correctly', () => {
      const result = interleaveDiscovery({
        rated: rated([1, 2, 3, 4, 5, 6, 7, 8]),
        discovery: discovery([1, 2]),
        limit: 5,
      });

      expect(result).toHaveLength(5);
      expect(result[4]).toEqual({ item: { id: 'd1' }, is_discovery: true });
    });

    it('applies offset and limit together', () => {
      const result = interleaveDiscovery({
        rated: rated([1, 2, 3, 4, 5, 6, 7, 8]),
        discovery: discovery([1, 2]),
        offset: 2,
        limit: 5,
      });

      // Full: r1,r2,r3,r4,d1,r5,r6,r7,r8,d2
      // Offset 2: r3,r4,d1,r5,r6,r7,r8,d2
      // Limit 5: r3,r4,d1,r5,r6
      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({ item: { id: 'r3' }, is_discovery: false });
      expect(result[2]).toEqual({ item: { id: 'd1' }, is_discovery: true });
    });

    it('page 1 and page 2 are non-overlapping', () => {
      const page1 = interleaveDiscovery({
        rated: rated([1, 2, 3, 4, 5, 6, 7, 8]),
        discovery: discovery([1, 2]),
        offset: 0,
        limit: 5,
      });

      const page2 = interleaveDiscovery({
        rated: rated([1, 2, 3, 4, 5, 6, 7, 8]),
        discovery: discovery([1, 2]),
        offset: 5,
        limit: 5,
      });

      expect(page1).toHaveLength(5);
      expect(page2).toHaveLength(5);

      const page1Ids = page1.map((r) => r.item.id);
      const page2Ids = page2.map((r) => r.item.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it('returns empty when offset exceeds total', () => {
      const result = interleaveDiscovery({
        rated: rated([1, 2]),
        discovery: discovery([1]),
        offset: 100,
      });
      expect(result).toEqual([]);
    });

    it('returns all available when limit exceeds total', () => {
      const result = interleaveDiscovery({
        rated: rated([1, 2]),
        discovery: discovery([1]),
        limit: 100,
      });
      expect(result).toHaveLength(3);
    });
  });

  describe('custom ratio', () => {
    it('respects ratio=2 (every 3rd item is discovery)', () => {
      const result = interleaveDiscovery({
        rated: rated([1, 2, 3, 4]),
        discovery: discovery([1, 2]),
        ratio: 2,
      });

      // With ratio 2: r1,r2,d1,r3,r4,d2
      expect(result).toHaveLength(6);
      expect(result[2]).toEqual({ item: { id: 'd1' }, is_discovery: true });
      expect(result[5]).toEqual({ item: { id: 'd2' }, is_discovery: true });
    });

    it('respects ratio=1 (every 2nd item is discovery)', () => {
      const result = interleaveDiscovery({
        rated: rated([1, 2]),
        discovery: discovery([1, 2]),
        ratio: 1,
      });

      // r1,d1,r2,d2
      expect(result).toHaveLength(4);
      expect(result[0].is_discovery).toBe(false);
      expect(result[1].is_discovery).toBe(true);
      expect(result[2].is_discovery).toBe(false);
      expect(result[3].is_discovery).toBe(true);
    });
  });
});
