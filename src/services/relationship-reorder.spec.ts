import {
  applyReorder,
  parseMemberOrder,
  serializeMemberOrder,
  buildDefaultOrder,
  compactOrder,
  sortMemberIdsByOrder,
} from './relationship-reorder.js';
import type { ReorderOperation } from '../types/memory.types.js';

describe('relationship-reorder', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const defaultOrder = { a: 0, b: 1, c: 2, d: 3 };

  // --- helpers ---

  describe('parseMemberOrder', () => {
    it('returns empty map for null/undefined', () => {
      expect(parseMemberOrder(null)).toEqual({});
      expect(parseMemberOrder(undefined)).toEqual({});
    });

    it('parses valid JSON', () => {
      expect(parseMemberOrder('{"a":0,"b":1}')).toEqual({ a: 0, b: 1 });
    });

    it('returns empty map for invalid JSON', () => {
      expect(parseMemberOrder('not-json')).toEqual({});
    });
  });

  describe('serializeMemberOrder', () => {
    it('serializes to JSON', () => {
      const result = serializeMemberOrder({ a: 0, b: 1 });
      expect(JSON.parse(result)).toEqual({ a: 0, b: 1 });
    });
  });

  describe('buildDefaultOrder', () => {
    it('assigns 0..N-1 positions', () => {
      expect(buildDefaultOrder(['x', 'y', 'z'])).toEqual({ x: 0, y: 1, z: 2 });
    });

    it('returns empty map for empty array', () => {
      expect(buildDefaultOrder([])).toEqual({});
    });
  });

  describe('compactOrder', () => {
    it('re-indexes gapped positions to dense 0..N-1', () => {
      expect(compactOrder({ a: 0, b: 5, c: 10 })).toEqual({ a: 0, b: 1, c: 2 });
    });

    it('preserves relative order', () => {
      expect(compactOrder({ x: 3, y: 1, z: 7 })).toEqual({ y: 0, x: 1, z: 2 });
    });

    it('handles empty map', () => {
      expect(compactOrder({})).toEqual({});
    });
  });

  describe('sortMemberIdsByOrder', () => {
    it('sorts by position', () => {
      expect(sortMemberIdsByOrder(['c', 'a', 'b'], { a: 0, b: 1, c: 2 })).toEqual(['a', 'b', 'c']);
    });

    it('puts unordered IDs at the end', () => {
      expect(sortMemberIdsByOrder(['c', 'a', 'b', 'x'], { a: 0, b: 1, c: 2 })).toEqual(['a', 'b', 'c', 'x']);
    });
  });

  // --- operations ---

  describe('move_to_index', () => {
    it('moves item to target position', () => {
      const op: ReorderOperation = { type: 'move_to_index', memory_id: 'c', index: 0 };
      const result = applyReorder(defaultOrder, ids, op);
      expect(result).toEqual({ c: 0, a: 1, b: 2, d: 3 });
    });

    it('moves item to last position', () => {
      const op: ReorderOperation = { type: 'move_to_index', memory_id: 'a', index: 3 };
      const result = applyReorder(defaultOrder, ids, op);
      expect(result).toEqual({ b: 0, c: 1, d: 2, a: 3 });
    });

    it('no-op when moving to same position', () => {
      const op: ReorderOperation = { type: 'move_to_index', memory_id: 'b', index: 1 };
      const result = applyReorder(defaultOrder, ids, op);
      expect(result).toEqual(defaultOrder);
    });

    it('clamps out-of-range index', () => {
      const op: ReorderOperation = { type: 'move_to_index', memory_id: 'a', index: 100 };
      const result = applyReorder(defaultOrder, ids, op);
      expect(result).toEqual({ b: 0, c: 1, d: 2, a: 3 });
    });
  });

  describe('swap', () => {
    it('swaps two items', () => {
      const op: ReorderOperation = { type: 'swap', memory_id_a: 'a', memory_id_b: 'd' };
      const result = applyReorder(defaultOrder, ids, op);
      expect(result).toEqual({ a: 3, b: 1, c: 2, d: 0 });
    });

    it('no-op when swapping with self', () => {
      const op: ReorderOperation = { type: 'swap', memory_id_a: 'b', memory_id_b: 'b' };
      const result = applyReorder(defaultOrder, ids, op);
      expect(result).toEqual(defaultOrder);
    });
  });

  describe('set_order', () => {
    it('sets exact order from array', () => {
      const op: ReorderOperation = { type: 'set_order', ordered_memory_ids: ['d', 'c', 'b', 'a'] };
      const result = applyReorder(defaultOrder, ids, op);
      expect(result).toEqual({ d: 0, c: 1, b: 2, a: 3 });
    });

    it('throws 409 on missing member', () => {
      const op: ReorderOperation = { type: 'set_order', ordered_memory_ids: ['a', 'b', 'c'] };
      expect(() => applyReorder(defaultOrder, ids, op)).toThrow('409');
    });

    it('throws 409 on extra member', () => {
      const op: ReorderOperation = { type: 'set_order', ordered_memory_ids: ['a', 'b', 'c', 'd', 'e'] };
      expect(() => applyReorder(defaultOrder, ids, op)).toThrow('409');
    });

    it('throws 409 on wrong member', () => {
      const op: ReorderOperation = { type: 'set_order', ordered_memory_ids: ['a', 'b', 'c', 'x'] };
      expect(() => applyReorder(defaultOrder, ids, op)).toThrow('409');
    });
  });

  describe('move_before', () => {
    it('moves item before target', () => {
      const op: ReorderOperation = { type: 'move_before', memory_id: 'd', before: 'b' };
      const result = applyReorder(defaultOrder, ids, op);
      expect(result).toEqual({ a: 0, d: 1, b: 2, c: 3 });
    });

    it('no-op when moving before self', () => {
      const op: ReorderOperation = { type: 'move_before', memory_id: 'b', before: 'b' };
      const result = applyReorder(defaultOrder, ids, op);
      expect(result).toEqual(defaultOrder);
    });
  });

  describe('move_after', () => {
    it('moves item after target', () => {
      const op: ReorderOperation = { type: 'move_after', memory_id: 'a', after: 'c' };
      const result = applyReorder(defaultOrder, ids, op);
      expect(result).toEqual({ b: 0, c: 1, a: 2, d: 3 });
    });

    it('no-op when moving after self', () => {
      const op: ReorderOperation = { type: 'move_after', memory_id: 'c', after: 'c' };
      const result = applyReorder(defaultOrder, ids, op);
      expect(result).toEqual(defaultOrder);
    });
  });

  describe('lazy backfill', () => {
    it('creates default order from memberIds when currentOrder is empty', () => {
      const op: ReorderOperation = { type: 'swap', memory_id_a: 'a', memory_id_b: 'c' };
      const result = applyReorder({}, ids, op);
      expect(result).toEqual({ a: 2, b: 1, c: 0, d: 3 });
    });
  });
});
