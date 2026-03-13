/**
 * Integration test: Ordered Relationships (M77).
 *
 * Tests the full reorder lifecycle: create with default order,
 * reorder operations, add/remove with order maintenance,
 * lazy backfill on reads, and version conflict detection.
 */

import { MemoryService } from '../../memory.service.js';
import { RelationshipService } from '../../relationship.service.js';
import { createMockCollection, createMockLogger } from '../../../testing/weaviate-mock.js';

describe('Ordered Relationships (integration)', () => {
  let collection: ReturnType<typeof createMockCollection>;
  let memoryService: MemoryService;
  let relationshipService: RelationshipService;
  const userId = 'order-test-user';

  beforeEach(() => {
    collection = createMockCollection();
    const logger = createMockLogger();
    const mockMemoryIndex = { index: async () => {}, lookup: async () => null };
    memoryService = new MemoryService(collection as any, userId, logger, {
      memoryIndex: mockMemoryIndex as any,
    });
    relationshipService = new RelationshipService(collection as any, userId, logger);
  });

  // ── Default order on create ─────────────────────────────────

  it('creates relationship with default member_order_json from input order', async () => {
    const m1 = await memoryService.create({ content: 'First' });
    const m2 = await memoryService.create({ content: 'Second' });
    const m3 = await memoryService.create({ content: 'Third' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id, m3.memory_id],
      relationship_type: 'ordered_list',
      observation: 'A sequence',
    });

    const stored = collection._store.get(rel.relationship_id);
    const order = JSON.parse(stored!.properties.member_order_json);
    expect(order[m1.memory_id]).toBe(0);
    expect(order[m2.memory_id]).toBe(1);
    expect(order[m3.memory_id]).toBe(2);
  });

  // ── getById hydration ───────────────────────────────────────

  it('getById returns member_order and position-sorted memory IDs', async () => {
    const m1 = await memoryService.create({ content: 'Alpha' });
    const m2 = await memoryService.create({ content: 'Beta' });
    const m3 = await memoryService.create({ content: 'Gamma' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id, m3.memory_id],
      relationship_type: 'sequence',
      observation: 'Greek letters',
    });

    const result = await relationshipService.getById(rel.relationship_id);
    expect(result.found).toBe(true);
    expect(result.relationship!.member_order).toBeDefined();
    expect(result.relationship!.related_memory_ids).toEqual([
      m1.memory_id, m2.memory_id, m3.memory_id,
    ]);
  });

  // ── Reorder: move_to_index ──────────────────────────────────

  it('reorder move_to_index moves item to front', async () => {
    const m1 = await memoryService.create({ content: 'A' });
    const m2 = await memoryService.create({ content: 'B' });
    const m3 = await memoryService.create({ content: 'C' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id, m3.memory_id],
      relationship_type: 'list',
      observation: 'test',
    });

    const reordered = await relationshipService.reorder({
      relationship_id: rel.relationship_id,
      operation: { type: 'move_to_index', memory_id: m3.memory_id, index: 0 },
      version: 1,
    });

    expect(reordered.member_order[m3.memory_id]).toBe(0);
    expect(reordered.member_order[m1.memory_id]).toBe(1);
    expect(reordered.member_order[m2.memory_id]).toBe(2);
    expect(reordered.version).toBe(2);
  });

  // ── Reorder: swap ───────────────────────────────────────────

  it('reorder swap exchanges two items', async () => {
    const m1 = await memoryService.create({ content: 'X' });
    const m2 = await memoryService.create({ content: 'Y' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id],
      relationship_type: 'pair',
      observation: 'test',
    });

    const reordered = await relationshipService.reorder({
      relationship_id: rel.relationship_id,
      operation: { type: 'swap', memory_id_a: m1.memory_id, memory_id_b: m2.memory_id },
      version: 1,
    });

    expect(reordered.member_order[m1.memory_id]).toBe(1);
    expect(reordered.member_order[m2.memory_id]).toBe(0);
  });

  // ── Reorder: set_order ──────────────────────────────────────

  it('reorder set_order replaces entire ordering', async () => {
    const m1 = await memoryService.create({ content: '1' });
    const m2 = await memoryService.create({ content: '2' });
    const m3 = await memoryService.create({ content: '3' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id, m3.memory_id],
      relationship_type: 'list',
      observation: 'test',
    });

    const reordered = await relationshipService.reorder({
      relationship_id: rel.relationship_id,
      operation: { type: 'set_order', ordered_memory_ids: [m3.memory_id, m1.memory_id, m2.memory_id] },
      version: 1,
    });

    expect(reordered.member_order[m3.memory_id]).toBe(0);
    expect(reordered.member_order[m1.memory_id]).toBe(1);
    expect(reordered.member_order[m2.memory_id]).toBe(2);
  });

  // ── Reorder: move_before / move_after ───────────────────────

  it('reorder move_before inserts item before target', async () => {
    const m1 = await memoryService.create({ content: 'A' });
    const m2 = await memoryService.create({ content: 'B' });
    const m3 = await memoryService.create({ content: 'C' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id, m3.memory_id],
      relationship_type: 'list',
      observation: 'test',
    });

    // Move C before A → [C, A, B]
    const reordered = await relationshipService.reorder({
      relationship_id: rel.relationship_id,
      operation: { type: 'move_before', memory_id: m3.memory_id, before: m1.memory_id },
      version: 1,
    });

    expect(reordered.member_order[m3.memory_id]).toBe(0);
    expect(reordered.member_order[m1.memory_id]).toBe(1);
    expect(reordered.member_order[m2.memory_id]).toBe(2);
  });

  it('reorder move_after inserts item after target', async () => {
    const m1 = await memoryService.create({ content: 'A' });
    const m2 = await memoryService.create({ content: 'B' });
    const m3 = await memoryService.create({ content: 'C' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id, m3.memory_id],
      relationship_type: 'list',
      observation: 'test',
    });

    // Move A after B → [B, A, C]
    const reordered = await relationshipService.reorder({
      relationship_id: rel.relationship_id,
      operation: { type: 'move_after', memory_id: m1.memory_id, after: m2.memory_id },
      version: 1,
    });

    expect(reordered.member_order[m2.memory_id]).toBe(0);
    expect(reordered.member_order[m1.memory_id]).toBe(1);
    expect(reordered.member_order[m3.memory_id]).toBe(2);
  });

  // ── Version conflict ────────────────────────────────────────

  it('reorder rejects stale version with 409', async () => {
    const m1 = await memoryService.create({ content: 'A' });
    const m2 = await memoryService.create({ content: 'B' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id],
      relationship_type: 'pair',
      observation: 'test',
    });

    // First reorder bumps version to 2
    await relationshipService.reorder({
      relationship_id: rel.relationship_id,
      operation: { type: 'swap', memory_id_a: m1.memory_id, memory_id_b: m2.memory_id },
      version: 1,
    });

    // Second reorder with stale version 1 should fail
    await expect(
      relationshipService.reorder({
        relationship_id: rel.relationship_id,
        operation: { type: 'swap', memory_id_a: m1.memory_id, memory_id_b: m2.memory_id },
        version: 1,
      }),
    ).rejects.toThrow('409');
  });

  // ── set_order membership mismatch ───────────────────────────

  it('set_order rejects mismatched membership with 409', async () => {
    const m1 = await memoryService.create({ content: 'A' });
    const m2 = await memoryService.create({ content: 'B' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id],
      relationship_type: 'pair',
      observation: 'test',
    });

    await expect(
      relationshipService.reorder({
        relationship_id: rel.relationship_id,
        operation: { type: 'set_order', ordered_memory_ids: [m1.memory_id] }, // missing m2
        version: 1,
      }),
    ).rejects.toThrow('409');
  });

  // ── Add members preserves and extends order ─────────────────

  it('add_memory_ids appends new members at end of order', async () => {
    const m1 = await memoryService.create({ content: 'A' });
    const m2 = await memoryService.create({ content: 'B' });
    const m3 = await memoryService.create({ content: 'C' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id],
      relationship_type: 'list',
      observation: 'test',
    });

    await relationshipService.update({
      relationship_id: rel.relationship_id,
      add_memory_ids: [m3.memory_id],
    });

    const stored = collection._store.get(rel.relationship_id);
    const order = JSON.parse(stored!.properties.member_order_json);
    expect(order[m1.memory_id]).toBe(0);
    expect(order[m2.memory_id]).toBe(1);
    expect(order[m3.memory_id]).toBe(2);
  });

  // ── Remove members compacts order ───────────────────────────

  it('remove_memory_ids compacts remaining positions', async () => {
    const m1 = await memoryService.create({ content: 'A' });
    const m2 = await memoryService.create({ content: 'B' });
    const m3 = await memoryService.create({ content: 'C' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id, m3.memory_id],
      relationship_type: 'list',
      observation: 'test',
    });

    await relationshipService.update({
      relationship_id: rel.relationship_id,
      remove_memory_ids: [m2.memory_id],
    });

    const stored = collection._store.get(rel.relationship_id);
    const order = JSON.parse(stored!.properties.member_order_json);
    expect(order[m1.memory_id]).toBe(0);
    expect(order[m3.memory_id]).toBe(1);
    expect(order[m2.memory_id]).toBeUndefined();
  });

  // ── Lazy backfill ───────────────────────────────────────────

  it('legacy relationship without member_order_json gets default order on read', async () => {
    const m1 = await memoryService.create({ content: 'Old A' });
    const m2 = await memoryService.create({ content: 'Old B' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id],
      relationship_type: 'legacy',
      observation: 'test',
    });

    // Simulate legacy data — remove member_order_json
    const stored = collection._store.get(rel.relationship_id);
    stored!.properties.member_order_json = null;

    const result = await relationshipService.getById(rel.relationship_id);
    expect(result.found).toBe(true);
    expect(result.relationship!.member_order).toBeDefined();
    expect(Object.keys(result.relationship!.member_order as Record<string, number>)).toHaveLength(2);
  });

  // ── Chained reorder operations ──────────────────────────────

  it('supports multiple reorder operations in sequence', async () => {
    const m1 = await memoryService.create({ content: 'Item 1' });
    const m2 = await memoryService.create({ content: 'Item 2' });
    const m3 = await memoryService.create({ content: 'Item 3' });
    const m4 = await memoryService.create({ content: 'Item 4' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id, m3.memory_id, m4.memory_id],
      relationship_type: 'playlist',
      observation: 'ordered content',
    });

    // Move item 4 to front → [4, 1, 2, 3]
    const r1 = await relationshipService.reorder({
      relationship_id: rel.relationship_id,
      operation: { type: 'move_to_index', memory_id: m4.memory_id, index: 0 },
      version: 1,
    });
    expect(r1.version).toBe(2);

    // Swap items 1 and 3 → [4, 3, 2, 1]
    const r2 = await relationshipService.reorder({
      relationship_id: rel.relationship_id,
      operation: { type: 'swap', memory_id_a: m1.memory_id, memory_id_b: m3.memory_id },
      version: 2,
    });
    expect(r2.version).toBe(3);

    // Verify final order via getById
    const final = await relationshipService.getById(rel.relationship_id);
    const ids = final.relationship!.related_memory_ids as string[];
    expect(ids[0]).toBe(m4.memory_id);
    expect(ids[1]).toBe(m3.memory_id);
    expect(ids[2]).toBe(m2.memory_id);
    expect(ids[3]).toBe(m1.memory_id);
  });

  // ── Full lifecycle ──────────────────────────────────────────

  it('full lifecycle: create → reorder → add → reorder → remove → verify', async () => {
    const m1 = await memoryService.create({ content: 'Step 1' });
    const m2 = await memoryService.create({ content: 'Step 2' });
    const m3 = await memoryService.create({ content: 'Step 3' });

    // Create with order [m1, m2]
    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id],
      relationship_type: 'workflow',
      observation: 'steps',
    });

    // Swap → [m2, m1]
    await relationshipService.reorder({
      relationship_id: rel.relationship_id,
      operation: { type: 'swap', memory_id_a: m1.memory_id, memory_id_b: m2.memory_id },
      version: 1,
    });

    // Add m3 → [m2, m1, m3]
    await relationshipService.update({
      relationship_id: rel.relationship_id,
      add_memory_ids: [m3.memory_id],
    });

    // Move m3 to front → [m3, m2, m1]
    const stored = collection._store.get(rel.relationship_id);
    const currentVersion = stored!.properties.version as number;
    await relationshipService.reorder({
      relationship_id: rel.relationship_id,
      operation: { type: 'move_to_index', memory_id: m3.memory_id, index: 0 },
      version: currentVersion,
    });

    // Remove m2 → [m3, m1]
    await relationshipService.update({
      relationship_id: rel.relationship_id,
      remove_memory_ids: [m2.memory_id],
    });

    // Verify final state
    const final = await relationshipService.getById(rel.relationship_id);
    expect(final.found).toBe(true);
    const order = final.relationship!.member_order as Record<string, number>;
    expect(Object.keys(order)).toHaveLength(2);
    expect(order[m3.memory_id]).toBe(0);
    expect(order[m1.memory_id]).toBe(1);
  });
});
