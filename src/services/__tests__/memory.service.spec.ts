import { MemoryService } from '../memory.service.js';
import { createMockCollection, createMockLogger } from '../../testing/weaviate-mock.js';

describe('MemoryService', () => {
  let collection: ReturnType<typeof createMockCollection>;
  let logger: ReturnType<typeof createMockLogger>;
  let service: MemoryService;
  const userId = 'test-user';

  beforeEach(() => {
    collection = createMockCollection();
    logger = createMockLogger();
    service = new MemoryService(collection as any, userId, logger);
  });

  describe('create', () => {
    it('inserts a memory with defaults', async () => {
      const result = await service.create({ content: 'Hello world' });
      expect(result.memory_id).toBeDefined();
      expect(result.created_at).toBeDefined();

      const stored = collection._store.get(result.memory_id);
      expect(stored).toBeDefined();
      expect(stored!.properties.content).toBe('Hello world');
      expect(stored!.properties.user_id).toBe(userId);
      expect(stored!.properties.doc_type).toBe('memory');
      expect(stored!.properties.weight).toBe(0.5);
      expect(stored!.properties.trust_score).toBe(0.25);
      expect(stored!.properties.version).toBe(1);
      expect(stored!.properties.space_ids).toEqual([]);
      expect(stored!.properties.group_ids).toEqual([]);
    });

    it('uses provided content type if valid', async () => {
      const result = await service.create({ content: 'test', type: 'note' });
      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.content_type).toBe('note');
    });

    it('falls back to default content type for invalid type', async () => {
      const result = await service.create({ content: 'test', type: 'invalid_type' as any });
      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.content_type).toBe('note');
    });

    it('applies custom weight and trust', async () => {
      const result = await service.create({ content: 'test', weight: 0.9, trust: 0.8 });
      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.weight).toBe(0.9);
      expect(stored!.properties.trust_score).toBe(0.8);
    });

    it('stores tags and references', async () => {
      const result = await service.create({
        content: 'test',
        tags: ['a', 'b'],
        references: ['ref1'],
      });
      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.tags).toEqual(['a', 'b']);
      expect(stored!.properties.references).toEqual(['ref1']);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await collection.data.insert({
        properties: {
          user_id: userId,
          doc_type: 'memory',
          content: 'hiking trip',
          deleted_at: null,
        },
      });
      await collection.data.insert({
        properties: {
          user_id: userId,
          doc_type: 'relationship',
          observation: 'related to hiking',
          deleted_at: null,
        },
      });
    });

    it('throws for empty query', async () => {
      await expect(service.search({ query: '' })).rejects.toThrow('Query cannot be empty');
      await expect(service.search({ query: '  ' })).rejects.toThrow('Query cannot be empty');
    });

    it('returns memories and relationships', async () => {
      const result = await service.search({ query: 'hiking' });
      expect(result.memories.length).toBeGreaterThanOrEqual(1);
      expect(result.relationships).toBeDefined();
    });

    it('excludes relationships when include_relationships is false', async () => {
      const result = await service.search({ query: 'hiking', include_relationships: false });
      expect(result.relationships).toBeUndefined();
    });
  });

  describe('update', () => {
    let memoryId: string;

    beforeEach(async () => {
      memoryId = await collection.data.insert({
        properties: {
          user_id: userId,
          doc_type: 'memory',
          content: 'original',
          version: 1,
          deleted_at: null,
        },
      });
    });

    it('updates content and increments version', async () => {
      const result = await service.update({ memory_id: memoryId, content: 'updated' });
      expect(result.version).toBe(2);
      expect(result.updated_fields).toContain('content');

      const stored = collection._store.get(memoryId);
      expect(stored!.properties.content).toBe('updated');
    });

    it('throws for unknown memory', async () => {
      await expect(service.update({ memory_id: 'nonexistent', content: 'x' })).rejects.toThrow(
        'Memory not found',
      );
    });

    it('throws for unauthorized access', async () => {
      const otherId = await collection.data.insert({
        properties: { user_id: 'other-user', doc_type: 'memory', version: 1, deleted_at: null },
      });
      await expect(service.update({ memory_id: otherId, content: 'x' })).rejects.toThrow(
        'Unauthorized',
      );
    });

    it('throws when updating relationship doc', async () => {
      const relId = await collection.data.insert({
        properties: { user_id: userId, doc_type: 'relationship', version: 1, deleted_at: null },
      });
      await expect(service.update({ memory_id: relId, content: 'x' })).rejects.toThrow(
        'Cannot update relationships',
      );
    });

    it('throws for deleted memory', async () => {
      const deletedId = await collection.data.insert({
        properties: { user_id: userId, doc_type: 'memory', version: 1, deleted_at: '2026-01-01' },
      });
      await expect(service.update({ memory_id: deletedId, content: 'x' })).rejects.toThrow(
        'Cannot update deleted memory',
      );
    });

    it('throws for no fields provided', async () => {
      await expect(service.update({ memory_id: memoryId })).rejects.toThrow(
        'No fields provided',
      );
    });

    it('validates weight range', async () => {
      await expect(service.update({ memory_id: memoryId, weight: 1.5 })).rejects.toThrow(
        'Weight must be between 0 and 1',
      );
    });

    it('validates trust range', async () => {
      await expect(service.update({ memory_id: memoryId, trust: -0.1 })).rejects.toThrow(
        'Trust must be between 0 and 1',
      );
    });
  });

  describe('delete', () => {
    let memoryId: string;

    beforeEach(async () => {
      memoryId = await collection.data.insert({
        properties: {
          user_id: userId,
          doc_type: 'memory',
          content: 'to delete',
          deleted_at: null,
        },
      });
    });

    it('soft deletes memory', async () => {
      const result = await service.delete({ memory_id: memoryId });
      expect(result.memory_id).toBe(memoryId);
      expect(result.deleted_at).toBeDefined();

      const stored = collection._store.get(memoryId);
      expect(stored!.properties.deleted_at).toBeDefined();
      expect(stored!.properties.deleted_by).toBe(userId);
    });

    it('throws for already deleted memory', async () => {
      const deletedId = await collection.data.insert({
        properties: { user_id: userId, doc_type: 'memory', deleted_at: '2026-01-01' },
      });
      await expect(service.delete({ memory_id: deletedId })).rejects.toThrow('already deleted');
    });

    it('stores deletion reason', async () => {
      await service.delete({ memory_id: memoryId, reason: 'no longer needed' });
      const stored = collection._store.get(memoryId);
      expect(stored!.properties.deletion_reason).toBe('no longer needed');
    });
  });

  describe('findSimilar', () => {
    it('throws if neither memory_id nor text provided', async () => {
      await expect(service.findSimilar({})).rejects.toThrow(
        'Either memory_id or text must be provided',
      );
    });

    it('throws if both memory_id and text provided', async () => {
      await expect(
        service.findSimilar({ memory_id: 'x', text: 'y' }),
      ).rejects.toThrow('Provide either memory_id or text, not both');
    });

    it('finds similar by text', async () => {
      await collection.data.insert({
        properties: { user_id: userId, doc_type: 'memory', content: 'hiking', deleted_at: null },
      });
      const result = await service.findSimilar({ text: 'hiking' });
      expect(result.similar_memories).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('query', () => {
    it('throws for empty query', async () => {
      await expect(service.query({ query: '' })).rejects.toThrow('Query cannot be empty');
    });

    it('returns relevant memories', async () => {
      await collection.data.insert({
        properties: { user_id: userId, doc_type: 'memory', content: 'camping', deleted_at: null },
      });
      const result = await service.query({ query: 'camping' });
      expect(result.memories).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });
});
