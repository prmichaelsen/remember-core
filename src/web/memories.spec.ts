import { createMockWebSDKContext } from './testing-helpers';
import { createMemory, searchMemories, findSimilarMemories, queryMemories, updateMemory, deleteMemory } from './memories';

describe('Memory use cases', () => {
  const ctx = createMockWebSDKContext();

  beforeEach(() => {
    ctx._collection._store.clear();
  });

  describe('createMemory', () => {
    it('returns ok with memory_id', async () => {
      const result = await createMemory(ctx, { content: 'test memory' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.memory_id).toBeDefined();
        expect(result.data.created_at).toBeDefined();
      }
    });
  });

  describe('searchMemories', () => {
    it('returns paginated result with hasMore', async () => {
      await createMemory(ctx, { content: 'searchable memory', tags: ['test'] });
      const result = await searchMemories(ctx, { query: 'searchable', limit: 5 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.items).toBeDefined();
        expect(result.data.hasMore).toBeDefined();
        expect(typeof result.data.total).toBe('number');
        expect(typeof result.data.limit).toBe('number');
        expect(typeof result.data.offset).toBe('number');
      }
    });

    it('returns err on empty query', async () => {
      const result = await searchMemories(ctx, { query: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('internal');
      }
    });
  });

  describe('findSimilarMemories', () => {
    it('returns similar_memories array', async () => {
      const created = await createMemory(ctx, { content: 'base memory' });
      if (!created.ok) fail('setup');
      const result = await findSimilarMemories(ctx, { text: 'base memory' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.data.similar_memories)).toBe(true);
        expect(typeof result.data.total).toBe('number');
      }
    });

    it('returns err when neither memory_id nor text provided', async () => {
      const result = await findSimilarMemories(ctx, {});
      expect(result.ok).toBe(false);
    });
  });

  describe('queryMemories', () => {
    it('returns memories with total', async () => {
      await createMemory(ctx, { content: 'query target' });
      const result = await queryMemories(ctx, { query: 'query target' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.data.memories)).toBe(true);
        expect(typeof result.data.total).toBe('number');
      }
    });
  });

  describe('updateMemory', () => {
    it('returns updated fields', async () => {
      const created = await createMemory(ctx, { content: 'original' });
      if (!created.ok) fail('setup');
      const result = await updateMemory(ctx, {
        memory_id: created.data.memory_id,
        content: 'updated',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.updated_fields).toContain('content');
        expect(result.data.version).toBe(2);
      }
    });
  });

  describe('deleteMemory', () => {
    it('returns orphaned_relationship_ids', async () => {
      const created = await createMemory(ctx, { content: 'to delete' });
      if (!created.ok) fail('setup');
      const result = await deleteMemory(ctx, { memory_id: created.data.memory_id });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.memory_id).toBe(created.data.memory_id);
        expect(result.data.deleted_at).toBeDefined();
        expect(Array.isArray(result.data.orphaned_relationship_ids)).toBe(true);
      }
    });
  });

  describe('error wrapping', () => {
    it('wraps service errors as WebSDKError', async () => {
      const result = await updateMemory(ctx, { memory_id: 'nonexistent', content: 'x' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('internal');
        expect(result.error.message).toBeDefined();
      }
    });
  });
});
