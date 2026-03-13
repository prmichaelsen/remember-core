import { RelationshipService } from './relationship.service.js';
import type { ReorderOperation } from '../types/memory.types.js';

// ── Mock collection builder ─────────────────────────────────────────

function createMockCollection(store: Map<string, Record<string, unknown>> = new Map()) {
  const data = {
    insert: jest.fn(async ({ properties }: any) => {
      const id = `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      store.set(id, { ...properties });
      return id;
    }),
    update: jest.fn(async ({ id, properties }: any) => {
      const existing = store.get(id);
      if (existing) {
        Object.assign(existing, properties);
      }
    }),
    deleteById: jest.fn(async (id: string) => {
      store.delete(id);
    }),
  };

  const query = {
    fetchObjectById: jest.fn(async (id: string, opts?: any) => {
      const props = store.get(id);
      if (!props) return null;
      return { uuid: id, properties: { ...props } };
    }),
    fetchObjects: jest.fn(async (opts?: any) => ({
      objects: [...store.entries()]
        .filter(([, p]) => p.doc_type === 'relationship')
        .map(([id, p]) => ({ uuid: id, properties: { ...p } })),
    })),
    hybrid: jest.fn(async (_q: string, opts?: any) => ({
      objects: [...store.entries()]
        .filter(([, p]) => p.doc_type === 'relationship')
        .map(([id, p]) => ({ uuid: id, properties: { ...p } })),
    })),
  };

  const filter = {
    byProperty: (name: string) => ({
      equal: (val: any) => ({ property: name, op: 'equal', val }),
      greaterOrEqual: (val: any) => ({ property: name, op: 'gte', val }),
      containsAny: (val: any) => ({ property: name, op: 'containsAny', val }),
    }),
  };

  const sort = {
    byProperty: (name: string, asc: boolean) => ({ property: name, asc }),
  };

  return { data, query, filter, sort };
}

function createLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as any;
}

describe('RelationshipService', () => {
  const userId = 'user-1';
  let store: Map<string, Record<string, unknown>>;
  let collection: ReturnType<typeof createMockCollection>;
  let logger: ReturnType<typeof createLogger>;
  let service: RelationshipService;

  beforeEach(() => {
    store = new Map();
    collection = createMockCollection(store);
    logger = createLogger();
    service = new RelationshipService(collection as any, userId, logger);
  });

  // Helper to seed a memory in the store
  function seedMemory(id: string, ownerId = userId) {
    store.set(id, {
      user_id: ownerId,
      doc_type: 'memory',
      relationship_ids: [],
      deleted_at: null,
    });
  }

  // Helper to seed a relationship directly
  function seedRelationship(id: string, memoryIds: string[], extra: Record<string, unknown> = {}) {
    store.set(id, {
      user_id: userId,
      doc_type: 'relationship',
      related_memory_ids: memoryIds,
      relationship_type: 'test',
      observation: 'test obs',
      strength: 0.5,
      confidence: 0.8,
      source: 'user',
      tags: [],
      member_count: memoryIds.length,
      member_order_json: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      version: 1,
      ...extra,
    });
  }

  // ── Create ──────────────────────────────────────────────────────

  describe('create()', () => {
    it('populates member_order_json with default order', async () => {
      seedMemory('m1');
      seedMemory('m2');
      seedMemory('m3');

      const result = await service.create({
        memory_ids: ['m1', 'm2', 'm3'],
        relationship_type: 'test',
        observation: 'test',
      });

      const rel = store.get(result.relationship_id)!;
      expect(JSON.parse(rel.member_order_json as string)).toEqual({ m1: 0, m2: 1, m3: 2 });
    });
  });

  // ── Reorder ──────────────────────────────────────────────────────

  describe('reorder()', () => {
    it('applies move_to_index and increments version', async () => {
      seedRelationship('rel-1', ['a', 'b', 'c'], {
        member_order_json: JSON.stringify({ a: 0, b: 1, c: 2 }),
        version: 1,
      });

      const result = await service.reorder({
        relationship_id: 'rel-1',
        operation: { type: 'move_to_index', memory_id: 'c', index: 0 },
        version: 1,
      });

      expect(result.member_order).toEqual({ c: 0, a: 1, b: 2 });
      expect(result.version).toBe(2);
    });

    it('applies swap operation', async () => {
      seedRelationship('rel-1', ['a', 'b', 'c'], {
        member_order_json: JSON.stringify({ a: 0, b: 1, c: 2 }),
        version: 1,
      });

      const result = await service.reorder({
        relationship_id: 'rel-1',
        operation: { type: 'swap', memory_id_a: 'a', memory_id_b: 'c' },
        version: 1,
      });

      expect(result.member_order).toEqual({ a: 2, b: 1, c: 0 });
    });

    it('applies set_order operation', async () => {
      seedRelationship('rel-1', ['a', 'b', 'c'], {
        member_order_json: JSON.stringify({ a: 0, b: 1, c: 2 }),
        version: 1,
      });

      const result = await service.reorder({
        relationship_id: 'rel-1',
        operation: { type: 'set_order', ordered_memory_ids: ['c', 'b', 'a'] },
        version: 1,
      });

      expect(result.member_order).toEqual({ c: 0, b: 1, a: 2 });
    });

    it('applies move_before operation', async () => {
      seedRelationship('rel-1', ['a', 'b', 'c'], {
        member_order_json: JSON.stringify({ a: 0, b: 1, c: 2 }),
        version: 1,
      });

      const result = await service.reorder({
        relationship_id: 'rel-1',
        operation: { type: 'move_before', memory_id: 'c', before: 'a' },
        version: 1,
      });

      expect(result.member_order).toEqual({ c: 0, a: 1, b: 2 });
    });

    it('applies move_after operation', async () => {
      seedRelationship('rel-1', ['a', 'b', 'c'], {
        member_order_json: JSON.stringify({ a: 0, b: 1, c: 2 }),
        version: 1,
      });

      const result = await service.reorder({
        relationship_id: 'rel-1',
        operation: { type: 'move_after', memory_id: 'a', after: 'b' },
        version: 1,
      });

      expect(result.member_order).toEqual({ b: 0, a: 1, c: 2 });
    });

    it('throws on version mismatch', async () => {
      seedRelationship('rel-1', ['a', 'b'], {
        member_order_json: JSON.stringify({ a: 0, b: 1 }),
        version: 3,
      });

      await expect(
        service.reorder({
          relationship_id: 'rel-1',
          operation: { type: 'swap', memory_id_a: 'a', memory_id_b: 'b' },
          version: 1,
        }),
      ).rejects.toThrow('409');
    });

    it('throws for nonexistent relationship', async () => {
      await expect(
        service.reorder({
          relationship_id: 'nope',
          operation: { type: 'swap', memory_id_a: 'a', memory_id_b: 'b' },
          version: 1,
        }),
      ).rejects.toThrow('not found');
    });
  });

  // ── Update (add/remove) ─────────────────────────────────────────

  describe('update() — member ordering', () => {
    it('appends new members at end of order', async () => {
      seedMemory('m1');
      seedMemory('m2');
      seedMemory('m3');
      seedRelationship('rel-1', ['m1', 'm2'], {
        member_order_json: JSON.stringify({ m1: 0, m2: 1 }),
        version: 1,
      });

      await service.update({
        relationship_id: 'rel-1',
        add_memory_ids: ['m3'],
      });

      const rel = store.get('rel-1')!;
      const order = JSON.parse(rel.member_order_json as string);
      expect(order.m3).toBe(2);
    });

    it('compacts order after removing members', async () => {
      seedMemory('m1');
      seedMemory('m2');
      seedMemory('m3');
      seedRelationship('rel-1', ['m1', 'm2', 'm3'], {
        member_order_json: JSON.stringify({ m1: 0, m2: 1, m3: 2 }),
        version: 1,
      });

      await service.update({
        relationship_id: 'rel-1',
        remove_memory_ids: ['m2'],
      });

      const rel = store.get('rel-1')!;
      const order = JSON.parse(rel.member_order_json as string);
      expect(order).toEqual({ m1: 0, m3: 1 });
    });
  });

  // ── Read paths ──────────────────────────────────────────────────

  describe('getById() — hydration', () => {
    it('returns member_order and sorted memory IDs', async () => {
      seedRelationship('rel-1', ['c', 'a', 'b'], {
        member_order_json: JSON.stringify({ a: 0, b: 1, c: 2 }),
      });

      const result = await service.getById('rel-1');
      expect(result.found).toBe(true);
      expect(result.relationship!.member_order).toEqual({ a: 0, b: 1, c: 2 });
      expect(result.relationship!.related_memory_ids).toEqual(['a', 'b', 'c']);
    });

    it('lazy backfills default order for legacy relationships', async () => {
      seedRelationship('rel-1', ['x', 'y', 'z'], {
        member_order_json: null,
      });

      const result = await service.getById('rel-1');
      expect(result.found).toBe(true);
      expect(result.relationship!.member_order).toEqual({ x: 0, y: 1, z: 2 });
      expect(result.relationship!.related_memory_ids).toEqual(['x', 'y', 'z']);
    });
  });

  describe('findByMemoryIds() — hydration', () => {
    it('hydrates relationships with member_order', async () => {
      seedRelationship('rel-1', ['a', 'b'], {
        member_order_json: JSON.stringify({ b: 0, a: 1 }),
      });

      const result = await service.findByMemoryIds({ memory_ids: ['a'] });
      expect(result.relationships[0].member_order).toEqual({ b: 0, a: 1 });
      expect(result.relationships[0].related_memory_ids).toEqual(['b', 'a']);
    });
  });
});
