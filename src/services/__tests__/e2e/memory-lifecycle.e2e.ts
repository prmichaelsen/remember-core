/**
 * Integration test: Memory lifecycle.
 *
 * Tests the full create → search → update → search → delete → verify flow
 * using the in-memory Weaviate mock. Validates that all MemoryService operations
 * work together correctly.
 */

import { MemoryService } from '../../memory.service.js';
import { createMockCollection, createMockLogger } from '../../../testing/weaviate-mock.js';

describe('Memory Lifecycle (integration)', () => {
  let collection: ReturnType<typeof createMockCollection>;
  let service: MemoryService;
  const userId = 'integration-user';

  beforeEach(() => {
    collection = createMockCollection();
    const logger = createMockLogger();
    service = new MemoryService(collection as any, userId, logger);
  });

  it('full lifecycle: create → search → update → delete', async () => {
    // 1. Create a memory
    const created = await service.create({
      content: 'TypeScript is a typed superset of JavaScript',
      title: 'TypeScript Overview',
      type: 'note',
      tags: ['typescript', 'programming'],
      weight: 0.8,
      trust: 0.9,
    });
    expect(created.memory_id).toBeDefined();
    expect(created.created_at).toBeDefined();

    // 2. Search for it
    const searchResult = await service.search({ query: 'typescript' });
    expect(searchResult.total).toBeGreaterThanOrEqual(1);
    const found = searchResult.memories.find(
      (m: any) => m.content === 'TypeScript is a typed superset of JavaScript',
    );
    expect(found).toBeDefined();

    // 3. Update it
    const updated = await service.update({
      memory_id: created.memory_id,
      content: 'TypeScript is a strongly typed programming language',
      tags: ['typescript', 'programming', 'types'],
    });
    expect(updated.memory_id).toBe(created.memory_id);
    expect(updated.version).toBe(2);
    expect(updated.updated_fields).toContain('content');
    expect(updated.updated_fields).toContain('tags');

    // 4. Verify update persisted
    const afterUpdate = await service.search({ query: 'typescript' });
    const updatedMemory = afterUpdate.memories.find(
      (m: any) => m.id === created.memory_id,
    );
    expect(updatedMemory).toBeDefined();

    // 5. Delete it
    const deleted = await service.delete({
      memory_id: created.memory_id,
      reason: 'test cleanup',
    });
    expect(deleted.memory_id).toBe(created.memory_id);
    expect(deleted.deleted_at).toBeDefined();

    // 6. Verify soft-deleted (excluded by default)
    const afterDelete = await service.search({ query: 'typescript' });
    const stillThere = afterDelete.memories.find(
      (m: any) => m.uuid === created.memory_id,
    );
    // Soft-deleted: properties are updated, but since our mock doesn't
    // filter on deleted_at automatically in search, verify the property
    const stored = collection._store.get(created.memory_id);
    expect(stored?.properties.deleted_at).toBeDefined();
    expect(stored?.properties.deleted_by).toBe(userId);
    expect(stored?.properties.deletion_reason).toBe('test cleanup');
  });

  it('create multiple memories and search with limit/offset', async () => {
    // Create 5 memories
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await service.create({
        content: `Memory number ${i}`,
        type: 'note',
      });
      ids.push(result.memory_id);
    }

    // Search with limit
    const limited = await service.search({ query: 'memory', limit: 3 });
    expect(limited.memories.length).toBeLessThanOrEqual(3);
    expect(limited.limit).toBe(3);

    // Search with offset
    const offset = await service.search({ query: 'memory', limit: 2, offset: 2 });
    expect(offset.offset).toBe(2);
  });

  it('findSimilar returns results with similarity scores', async () => {
    const m1 = await service.create({ content: 'Machine learning with Python' });
    const m2 = await service.create({ content: 'Deep learning neural networks' });
    const m3 = await service.create({ content: 'Cooking pasta recipes' });

    const similar = await service.findSimilar({
      memory_id: m1.memory_id,
      limit: 10,
      min_similarity: 0,
    });

    expect(similar.similar_memories.length).toBeGreaterThan(0);
    for (const item of similar.similar_memories) {
      expect(item.similarity).toBeDefined();
      expect(typeof item.similarity).toBe('number');
    }
  });

  it('query returns results with relevance scores', async () => {
    await service.create({ content: 'React hooks tutorial' });
    await service.create({ content: 'Vue.js composition API' });

    const result = await service.query({
      query: 'frontend frameworks',
      limit: 5,
      min_relevance: 0,
    });

    expect(result.memories.length).toBeGreaterThan(0);
    for (const item of result.memories) {
      expect(item.relevance).toBeDefined();
      expect(typeof item.relevance).toBe('number');
    }
  });

  it('update increments version on each call', async () => {
    const created = await service.create({ content: 'version test' });

    const v2 = await service.update({
      memory_id: created.memory_id,
      content: 'version test v2',
    });
    expect(v2.version).toBe(2);

    const v3 = await service.update({
      memory_id: created.memory_id,
      weight: 0.9,
    });
    expect(v3.version).toBe(3);
  });

  it('delete records orphaned relationships', async () => {
    // Create two memories
    const m1 = await service.create({ content: 'Memory A' });
    const m2 = await service.create({ content: 'Memory B' });

    // Manually insert a relationship linking them (uses related_memory_ids array)
    const relId = await collection.data.insert({
      properties: {
        user_id: userId,
        doc_type: 'relationship',
        related_memory_ids: [m1.memory_id, m2.memory_id],
        relationship_type: 'related_to',
        observation: 'test link',
      },
    });

    // Delete m1 — should detect orphaned relationship
    const deleted = await service.delete({
      memory_id: m1.memory_id,
      reason: 'orphan test',
    });
    expect(deleted.orphaned_relationship_ids).toContain(relId);
  });
});
