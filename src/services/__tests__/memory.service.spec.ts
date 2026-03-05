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

  // ── Ghost/Trust Integration ──────────────────────────────────────────

  describe('ghost-integrated search', () => {
    beforeEach(async () => {
      // Regular memory (low trust)
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'public note',
          content_type: 'note', trust_score: 0.25, deleted_at: null,
        },
      });
      // High-trust memory
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'secret diary',
          content_type: 'note', trust_score: 0.75, deleted_at: null,
        },
      });
      // Ghost memory
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'ghost persona',
          content_type: 'ghost', trust_score: 0.5, deleted_at: null,
        },
      });
    });

    it('applies trust filter when ghost_context provided', async () => {
      const result = await service.search({
        query: 'note',
        ghost_context: { accessor_trust_level: 0.5, owner_user_id: userId },
      });
      // trust_score <= 0.5 includes 0.25 and 0.5, excludes 0.75
      // ghost content excluded by default
      const trustScores = result.memories.map((m: any) => m.trust_score);
      expect(trustScores.every((t: number) => t <= 0.5)).toBe(true);
    });

    it('excludes ghost content by default when ghost_context provided', async () => {
      const result = await service.search({
        query: 'persona',
        ghost_context: { accessor_trust_level: 1.0, owner_user_id: userId },
      });
      const types = result.memories.map((m: any) => m.content_type);
      expect(types).not.toContain('ghost');
    });

    it('includes ghost content when include_ghost_content is true', async () => {
      const result = await service.search({
        query: 'persona',
        ghost_context: { accessor_trust_level: 1.0, owner_user_id: userId, include_ghost_content: true },
      });
      const types = result.memories.map((m: any) => m.content_type);
      expect(types).toContain('ghost');
    });

    it('does not apply trust filter without ghost_context', async () => {
      const result = await service.search({ query: 'note' });
      // All memories returned (no trust filtering)
      expect(result.memories.length).toBeGreaterThanOrEqual(2);
    });

    it('excludes ghost content even without ghost_context', async () => {
      const result = await service.search({ query: 'persona' });
      const types = result.memories.map((m: any) => m.content_type);
      expect(types).not.toContain('ghost');
    });
  });

  describe('ghost-integrated query', () => {
    beforeEach(async () => {
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'low trust fact',
          content_type: 'note', trust_score: 0.25, deleted_at: null,
        },
      });
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'high trust secret',
          content_type: 'note', trust_score: 0.9, deleted_at: null,
        },
      });
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'ghost data',
          content_type: 'ghost', trust_score: 0.3, deleted_at: null,
        },
      });
    });

    it('applies trust filter when ghost_context provided', async () => {
      const result = await service.query({
        query: 'fact',
        ghost_context: { accessor_trust_level: 0.5, owner_user_id: userId },
      });
      const trustScores = result.memories.map((m: any) => m.trust_score);
      expect(trustScores.every((t: number) => t <= 0.5)).toBe(true);
    });

    it('excludes ghost content by default', async () => {
      const result = await service.query({
        query: 'data',
        ghost_context: { accessor_trust_level: 1.0, owner_user_id: userId },
      });
      const types = result.memories.map((m: any) => m.content_type);
      expect(types).not.toContain('ghost');
    });

    it('does not apply trust filter without ghost_context', async () => {
      const result = await service.query({ query: 'fact' });
      expect(result.memories.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('ghost-integrated findSimilar', () => {
    beforeEach(async () => {
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'hiking trail',
          content_type: 'note', trust_score: 0.3, deleted_at: null,
        },
      });
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'ghost trail info',
          content_type: 'ghost', trust_score: 0.5, deleted_at: null,
        },
      });
    });

    it('excludes ghost content when ghost_context provided', async () => {
      const result = await service.findSimilar({
        text: 'hiking',
        ghost_context: { accessor_trust_level: 1.0, owner_user_id: userId },
      });
      const types = result.similar_memories.map((m: any) => m.content_type);
      expect(types).not.toContain('ghost');
    });

    it('applies trust filter when ghost_context provided', async () => {
      const result = await service.findSimilar({
        text: 'hiking',
        ghost_context: { accessor_trust_level: 0.4, owner_user_id: userId },
      });
      const trustScores = result.similar_memories.map((m: any) => m.trust_score);
      expect(trustScores.every((t: number) => t <= 0.4)).toBe(true);
    });

    it('does not filter without ghost_context', async () => {
      const result = await service.findSimilar({ text: 'trail' });
      // Both regular and ghost content included when no ghost_context
      expect(result.similar_memories.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('byTime', () => {
    beforeEach(async () => {
      // Create memories with different timestamps
      await service.create({ content: 'Old memory' }); // created first
      await new Promise(resolve => setTimeout(resolve, 10));
      await service.create({ content: 'Middle memory' });
      await new Promise(resolve => setTimeout(resolve, 10));
      await service.create({ content: 'Recent memory' }); // created last
    });

    it('sorts memories by created_at descending by default', async () => {
      const result = await service.byTime({ limit: 10 });

      expect(result.memories.length).toBe(3);
      // Verify descending order
      for (let i = 0; i < result.memories.length - 1; i++) {
        const current = new Date(result.memories[i].created_at as string);
        const next = new Date(result.memories[i + 1].created_at as string);
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    });

    it('sorts memories by created_at ascending when specified', async () => {
      const result = await service.byTime({
        limit: 10,
        direction: 'asc',
      });

      expect(result.memories.length).toBe(3);
      // Verify ascending order
      for (let i = 0; i < result.memories.length - 1; i++) {
        const current = new Date(result.memories[i].created_at as string);
        const next = new Date(result.memories[i + 1].created_at as string);
        expect(current.getTime()).toBeLessThanOrEqual(next.getTime());
      }
    });

    it('respects pagination', async () => {
      const page1 = await service.byTime({ limit: 2, offset: 0 });
      const page2 = await service.byTime({ limit: 2, offset: 2 });

      expect(page1.memories.length).toBe(2);
      expect(page2.memories.length).toBe(1);
      expect(page1.memories[0].id).not.toBe(page2.memories[0].id);
    });

    it('applies filters correctly', async () => {
      await service.create({ content: 'Important note', type: 'note', tags: ['important'] });

      const result = await service.byTime({
        limit: 10,
        filters: {
          types: ['note'],
          tags: ['important'],
        },
      });

      expect(result.memories.length).toBeGreaterThanOrEqual(1);
      for (const memory of result.memories) {
        expect(memory.content_type).toBe('note');
        expect((memory.tags as string[]).includes('important')).toBe(true);
      }
    });
  });

  describe('byDensity', () => {
    beforeEach(async () => {
      // Create memories with different relationship counts
      const hub = await service.create({ content: 'Hub memory' });
      const connected = await service.create({ content: 'Well connected' });
      const few = await service.create({ content: 'Few links' });
      const isolated = await service.create({ content: 'Isolated' });

      // Manually set relationship_count for testing
      await collection.data.update({ id: hub.memory_id, properties: { relationship_count: 10 } });
      await collection.data.update({ id: connected.memory_id, properties: { relationship_count: 5 } });
      await collection.data.update({ id: few.memory_id, properties: { relationship_count: 2 } });
      await collection.data.update({ id: isolated.memory_id, properties: { relationship_count: 0 } });
    });

    it('sorts memories by relationship_count descending', async () => {
      const result = await service.byDensity({ limit: 10 });

      expect(result.memories.length).toBe(4);
      // Verify descending order
      for (let i = 0; i < result.memories.length - 1; i++) {
        const current = result.memories[i].relationship_count as number;
        const next = result.memories[i + 1].relationship_count as number;
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('filters by min_relationship_count', async () => {
      const result = await service.byDensity({
        limit: 10,
        min_relationship_count: 5,
      });

      expect(result.memories.length).toBeGreaterThanOrEqual(1);
      for (const memory of result.memories) {
        expect(memory.relationship_count).toBeGreaterThanOrEqual(5);
      }
    });

    it('respects pagination', async () => {
      const page1 = await service.byDensity({ limit: 2, offset: 0 });
      const page2 = await service.byDensity({ limit: 2, offset: 2 });

      expect(page1.memories.length).toBe(2);
      expect(page2.memories.length).toBe(2);
      expect(page1.memories[0].id).not.toBe(page2.memories[0].id);
    });

    it('applies filters correctly', async () => {
      const note = await service.create({
        content: 'Important note',
        type: 'note',
        tags: ['important'],
      });
      await collection.data.update({ id: note.memory_id, properties: { relationship_count: 7 } });

      const result = await service.byDensity({
        limit: 10,
        filters: {
          types: ['note'],
          tags: ['important'],
        },
      });

      expect(result.memories.length).toBeGreaterThanOrEqual(1);
      for (const memory of result.memories) {
        expect(memory.content_type).toBe('note');
        expect((memory.tags as string[]).includes('important')).toBe(true);
      }
    });

    it('includes memories with zero relationships', async () => {
      const result = await service.byDensity({
        limit: 100,
        // No min filter, should include all
      });

      const isolated = result.memories.find(m => (m.relationship_count as number) === 0);
      expect(isolated).toBeDefined();
      expect(isolated!.relationship_count).toBe(0);
    });
  });

  describe('create with memoryIndex', () => {
    it('calls memoryIndex.index() after successful create', async () => {
      const mockIndex = { index: jest.fn().mockResolvedValue(undefined), lookup: jest.fn() };
      const indexedService = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockIndex as any,
      });

      const result = await indexedService.create({ content: 'indexed memory' });

      expect(mockIndex.index).toHaveBeenCalledWith(
        result.memory_id,
        collection.name,
      );
    });

    it('succeeds even when index write fails', async () => {
      const mockIndex = {
        index: jest.fn().mockRejectedValue(new Error('Firestore down')),
        lookup: jest.fn(),
      };
      const indexedService = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockIndex as any,
      });

      const result = await indexedService.create({ content: 'still works' });

      expect(result.memory_id).toBeDefined();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Index write failed'));
    });

    it('works without memoryIndex (backwards compat)', async () => {
      const result = await service.create({ content: 'no index' });
      expect(result.memory_id).toBeDefined();
    });
  });

  describe('resolveById', () => {
    const targetCollectionName = 'Memory_users_other';
    let targetCollection: ReturnType<typeof createMockCollection>;
    let mockWeaviateClient: any;
    let mockIndex: any;

    beforeEach(() => {
      targetCollection = createMockCollection();
      mockWeaviateClient = {
        collections: {
          get: jest.fn((name: string) => {
            if (name === targetCollectionName) return targetCollection;
            // For legacy fallback, return user's own collection
            if (name === `Memory_users_${userId}`) return collection;
            return createMockCollection();
          }),
        },
      };
      mockIndex = {
        index: jest.fn().mockResolvedValue(undefined),
        lookup: jest.fn(),
      };
    });

    it('resolves via index lookup when indexed', async () => {
      // Insert a memory in the target collection
      const memId = await targetCollection.data.insert({
        properties: { user_id: 'other', doc_type: 'memory', content: 'cross-collection' },
      });
      mockIndex.lookup.mockResolvedValue(targetCollectionName);

      const svc = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockIndex as any,
        weaviateClient: mockWeaviateClient,
      });

      const result = await svc.resolveById(memId);

      expect(result.memory).not.toBeNull();
      expect(result.memory!.content).toBe('cross-collection');
      expect(result.collectionName).toBe(targetCollectionName);
      expect(mockIndex.lookup).toHaveBeenCalledWith(memId);
    });

    it('falls back to legacy resolve when index returns null', async () => {
      // Insert in user's own collection
      const memId = await collection.data.insert({
        properties: { user_id: userId, doc_type: 'memory', content: 'my memory' },
      });
      mockIndex.lookup.mockResolvedValue(null);

      const svc = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockIndex as any,
        weaviateClient: mockWeaviateClient,
      });

      const result = await svc.resolveById(memId);

      expect(result.memory).not.toBeNull();
      expect(result.memory!.content).toBe('my memory');
      expect(result.collectionName).toBe(`Memory_users_${userId}`);
    });

    it('returns null for nonexistent memory', async () => {
      mockIndex.lookup.mockResolvedValue(null);

      const svc = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockIndex as any,
        weaviateClient: mockWeaviateClient,
      });

      const result = await svc.resolveById('nonexistent-uuid');

      expect(result.memory).toBeNull();
      expect(result.collectionName).toBeNull();
    });

    it('resolves soft-deleted memory via index', async () => {
      const memId = await targetCollection.data.insert({
        properties: {
          user_id: 'other',
          doc_type: 'memory',
          content: 'deleted content',
          deleted_at: '2026-03-01T00:00:00.000Z',
        },
      });
      mockIndex.lookup.mockResolvedValue(targetCollectionName);

      const svc = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockIndex as any,
        weaviateClient: mockWeaviateClient,
      });

      const result = await svc.resolveById(memId);

      expect(result.memory).not.toBeNull();
      expect(result.memory!.deleted_at).toBe('2026-03-01T00:00:00.000Z');
      expect(result.collectionName).toBe(targetCollectionName);
    });

    it('throws if weaviateClient is not provided', async () => {
      const svc = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockIndex as any,
      });

      await expect(svc.resolveById('any-id')).rejects.toThrow('resolveById requires weaviateClient');
    });

    it('works without memoryIndex (legacy-only path)', async () => {
      const memId = await collection.data.insert({
        properties: { user_id: userId, doc_type: 'memory', content: 'legacy only' },
      });

      const svc = new MemoryService(collection as any, userId, logger, {
        weaviateClient: mockWeaviateClient,
      });

      const result = await svc.resolveById(memId);

      expect(result.memory).not.toBeNull();
      expect(result.memory!.content).toBe('legacy only');
    });
  });
});
