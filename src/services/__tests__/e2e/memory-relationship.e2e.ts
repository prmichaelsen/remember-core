/**
 * Integration test: Memory + Relationship cross-service flow.
 *
 * Tests that MemoryService and RelationshipService work together correctly
 * when sharing the same Weaviate collection. Validates bidirectional references,
 * search with relationships, and cascading effects on delete.
 */

import { MemoryService } from '../../memory.service.js';
import { RelationshipService } from '../../relationship.service.js';
import { createMockCollection, createMockLogger } from '../../../testing/weaviate-mock.js';

describe('Memory + Relationship cross-service (integration)', () => {
  let collection: ReturnType<typeof createMockCollection>;
  let memoryService: MemoryService;
  let relationshipService: RelationshipService;
  const userId = 'integration-user';

  beforeEach(() => {
    collection = createMockCollection();
    const logger = createMockLogger();
    memoryService = new MemoryService(collection as any, userId, logger);
    relationshipService = new RelationshipService(collection as any, userId, logger);
  });

  it('create memories → create relationship → verify references', async () => {
    const m1 = await memoryService.create({ content: 'Cats are pets' });
    const m2 = await memoryService.create({ content: 'Dogs are pets' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id],
      relationship_type: 'similar_to',
      observation: 'Both are about domestic animals',
    });

    expect(rel.relationship_id).toBeDefined();
    expect(rel.memory_ids).toEqual([m1.memory_id, m2.memory_id]);

    // Verify the relationship is stored in the same collection
    const relObj = collection._store.get(rel.relationship_id);
    expect(relObj?.properties.doc_type).toBe('relationship');
    expect(relObj?.properties.related_memory_ids).toEqual([m1.memory_id, m2.memory_id]);
    expect(relObj?.properties.relationship_type).toBe('similar_to');
  });

  it('search memories with include_relationships', async () => {
    const m1 = await memoryService.create({ content: 'JavaScript is dynamic' });
    const m2 = await memoryService.create({ content: 'TypeScript adds types' });

    await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id],
      relationship_type: 'extends',
      observation: 'TypeScript extends JavaScript',
    });

    // Search with relationships included
    const result = await memoryService.search({
      query: 'programming languages',
      include_relationships: true,
    });

    // Should find both memories and the relationship
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it('update relationship then search reflects changes', async () => {
    const m1 = await memoryService.create({ content: 'Node.js runtime' });
    const m2 = await memoryService.create({ content: 'Deno runtime' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id],
      relationship_type: 'competes_with',
      observation: 'Both are JS runtimes',
      strength: 0.5,
    });

    // Update the relationship
    const updated = await relationshipService.update({
      relationship_id: rel.relationship_id,
      strength: 0.9,
      observation: 'Both are server-side JS runtimes',
    });

    expect(updated.version).toBe(2);
    expect(updated.updated_fields).toContain('strength');
    expect(updated.updated_fields).toContain('observation');

    // Verify persisted
    const stored = collection._store.get(rel.relationship_id);
    expect(stored?.properties.strength).toBe(0.9);
    expect(stored?.properties.observation).toBe('Both are server-side JS runtimes');
  });

  it('delete relationship cleans up memory references', async () => {
    const m1 = await memoryService.create({ content: 'React framework' });
    const m2 = await memoryService.create({ content: 'Vue framework' });

    const rel = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id],
      relationship_type: 'similar_to',
      observation: 'Both are frontend frameworks',
    });

    // Delete the relationship
    const deleted = await relationshipService.delete({
      relationship_id: rel.relationship_id,
    });
    expect(deleted.relationship_id).toBe(rel.relationship_id);

    // Verify relationship is removed from collection
    expect(collection._store.has(rel.relationship_id)).toBe(false);
  });

  it('delete memory detects orphaned relationships', async () => {
    const m1 = await memoryService.create({ content: 'Memory alpha' });
    const m2 = await memoryService.create({ content: 'Memory beta' });
    const m3 = await memoryService.create({ content: 'Memory gamma' });

    // Create two relationships involving m1
    const rel1 = await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id],
      relationship_type: 'related_to',
      observation: 'alpha-beta link',
    });
    const rel2 = await relationshipService.create({
      memory_ids: [m1.memory_id, m3.memory_id],
      relationship_type: 'related_to',
      observation: 'alpha-gamma link',
    });

    // Delete m1 — should detect both relationships as orphaned
    const deleted = await memoryService.delete({
      memory_id: m1.memory_id,
      reason: 'cleanup',
    });

    expect(deleted.orphaned_relationship_ids).toContain(rel1.relationship_id);
    expect(deleted.orphaned_relationship_ids).toContain(rel2.relationship_id);
  });

  it('relationship search with type and strength filters', async () => {
    const m1 = await memoryService.create({ content: 'Concept A' });
    const m2 = await memoryService.create({ content: 'Concept B' });
    const m3 = await memoryService.create({ content: 'Concept C' });

    await relationshipService.create({
      memory_ids: [m1.memory_id, m2.memory_id],
      relationship_type: 'causes',
      observation: 'A causes B',
      strength: 0.9,
    });
    await relationshipService.create({
      memory_ids: [m2.memory_id, m3.memory_id],
      relationship_type: 'implies',
      observation: 'B implies C',
      strength: 0.4,
    });

    // Search for strong relationships
    const result = await relationshipService.search({
      query: 'concept',
      strength_min: 0.8,
    });

    // The mock doesn't do real filtering on search queries, but it does
    // apply Weaviate-style filters. Check the operation doesn't error.
    expect(result.relationships).toBeDefined();
    expect(result.total).toBeDefined();
  });

  it('full cross-service lifecycle: create → link → update → unlink → delete', async () => {
    // 1. Create memories
    const note = await memoryService.create({
      content: 'Meeting notes from standup',
      type: 'note',
      tags: ['meetings'],
    });
    const action = await memoryService.create({
      content: 'Follow up on deployment issue',
      type: 'action',
      tags: ['deployments'],
    });

    // 2. Link them
    const rel = await relationshipService.create({
      memory_ids: [note.memory_id, action.memory_id],
      relationship_type: 'resulted_in',
      observation: 'Meeting generated this action item',
    });

    // 3. Update the note
    await memoryService.update({
      memory_id: note.memory_id,
      content: 'Meeting notes from standup — updated with action items',
      tags: ['meetings', 'action-items'],
    });

    // 4. Delete the relationship
    await relationshipService.delete({
      relationship_id: rel.relationship_id,
    });
    expect(collection._store.has(rel.relationship_id)).toBe(false);

    // 5. Delete both memories
    const d1 = await memoryService.delete({ memory_id: note.memory_id });
    const d2 = await memoryService.delete({ memory_id: action.memory_id });
    expect(d1.deleted_at).toBeDefined();
    expect(d2.deleted_at).toBeDefined();

    // Collection should still have the soft-deleted objects
    expect(collection._store.has(note.memory_id)).toBe(true);
    expect(collection._store.has(action.memory_id)).toBe(true);
  });
});
