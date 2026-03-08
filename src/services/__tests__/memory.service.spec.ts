import { MemoryService, sliceContent } from '../memory.service.js';
import { createMockCollection, createMockLogger } from '../../testing/weaviate-mock.js';
import { TrustLevel } from '../../types/trust.types.js';

describe('MemoryService', () => {
  let collection: ReturnType<typeof createMockCollection>;
  let logger: ReturnType<typeof createMockLogger>;
  let mockMemoryIndex: { index: jest.Mock; lookup: jest.Mock };
  let service: MemoryService;
  const userId = 'test-user';

  beforeEach(() => {
    collection = createMockCollection();
    logger = createMockLogger();
    mockMemoryIndex = { index: jest.fn().mockResolvedValue(undefined), lookup: jest.fn().mockResolvedValue(null) };
    service = new MemoryService(collection as any, userId, logger, {
      memoryIndex: mockMemoryIndex as any,
    });
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
      expect(stored!.properties.trust_score).toBe(2);
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
      const result = await service.create({ content: 'test', weight: 0.9, trust: TrustLevel.RESTRICTED });
      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.weight).toBe(0.9);
      expect(stored!.properties.trust_score).toBe(TrustLevel.RESTRICTED);
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

    it('persists emotional dimension values when provided', async () => {
      const result = await service.create({
        content: 'emotional memory',
        feel_happiness: 0.9,
        feel_sadness: 0.1,
        feel_valence: -0.5,
        functional_salience: 0.8,
      });
      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.feel_happiness).toBe(0.9);
      expect(stored!.properties.feel_sadness).toBe(0.1);
      expect(stored!.properties.feel_valence).toBe(-0.5);
      expect(stored!.properties.functional_salience).toBe(0.8);
    });

    it('leaves dimensions as undefined when not provided', async () => {
      const result = await service.create({ content: 'simple memory' });
      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.feel_happiness).toBeUndefined();
      expect(stored!.properties.functional_salience).toBeUndefined();
      expect(stored!.properties.feel_significance).toBeUndefined();
    });

    it('rejects feel_happiness > 1', async () => {
      await expect(service.create({
        content: 'test',
        feel_happiness: 1.5,
      })).rejects.toThrow('feel_happiness must be between 0 and 1');
    });

    it('rejects feel_valence < -1', async () => {
      await expect(service.create({
        content: 'test',
        feel_valence: -2.0,
      })).rejects.toThrow('feel_valence must be between -1 and 1');
    });

    it('accepts feel_valence boundary values (-1, 0, 1)', async () => {
      const r1 = await service.create({ content: 'neg', feel_valence: -1 });
      expect(collection._store.get(r1.memory_id)!.properties.feel_valence).toBe(-1);
      const r2 = await service.create({ content: 'zero', feel_valence: 0 });
      expect(collection._store.get(r2.memory_id)!.properties.feel_valence).toBe(0);
      const r3 = await service.create({ content: 'pos', feel_valence: 1 });
      expect(collection._store.get(r3.memory_id)!.properties.feel_valence).toBe(1);
    });

    it('auto-computes composites when dimensions provided but composites omitted', async () => {
      const result = await service.create({
        content: 'test',
        feel_happiness: 0.8,
        feel_sadness: 0.2,
        functional_salience: 0.6,
      });
      const stored = collection._store.get(result.memory_id);
      // feel_significance = avg(0.8, 0.2) = 0.5
      expect(stored!.properties.feel_significance).toBeCloseTo(0.5);
      // functional_significance = avg(0.6) = 0.6
      expect(stored!.properties.functional_significance).toBeCloseTo(0.6);
      // total = 0.5 + 0.6 = 1.1
      expect(stored!.properties.total_significance).toBeCloseTo(1.1);
    });

    it('uses explicit composites when provided', async () => {
      const result = await service.create({
        content: 'test',
        feel_happiness: 0.8,
        feel_significance: 0.99,
        total_significance: 1.5,
      });
      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.feel_significance).toBe(0.99);
      expect(stored!.properties.total_significance).toBe(1.5);
    });

    it('persists observation text', async () => {
      const result = await service.create({
        content: 'test memory',
        observation: 'This memory reveals important context about the user',
      });
      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.observation).toBe('This memory reveals important context about the user');
    });

    it('sets rem_visits to 0 and does not allow override', async () => {
      const result = await service.create({ content: 'test' });
      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.rem_visits).toBe(0);
      // rem_touched_at should not be set
      expect(stored!.properties.rem_touched_at).toBeUndefined();
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
        'Trust must be an integer between 1 and 5',
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

    it('excludes comments by default', async () => {
      await collection.data.insert({
        properties: { user_id: userId, doc_type: 'memory', content: 'nice trail review', content_type: 'comment', deleted_at: null },
      });
      await collection.data.insert({
        properties: { user_id: userId, doc_type: 'memory', content: 'trail guide notes', content_type: 'note', deleted_at: null },
      });
      const result = await service.findSimilar({ text: 'trail' });
      const types = result.similar_memories.map((m: any) => m.content_type);
      expect(types).not.toContain('comment');
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
          content_type: 'note', trust_score: 2, deleted_at: null,
        },
      });
      // High-trust memory
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'secret diary',
          content_type: 'note', trust_score: 4, deleted_at: null,
        },
      });
      // Ghost memory
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'ghost persona',
          content_type: 'ghost', trust_score: 3, deleted_at: null,
        },
      });
    });

    it('applies trust filter when ghost_context provided', async () => {
      const result = await service.search({
        query: 'note',
        ghost_context: { accessor_trust_level: 3 as any, owner_user_id: userId },
      });
      // trust_score <= 3 includes 2 and 3, excludes 4
      // ghost content excluded by default
      const trustScores = result.memories.map((m: any) => m.trust_score);
      expect(trustScores.every((t: number) => t <= 3)).toBe(true);
    });

    it('excludes ghost content by default when ghost_context provided', async () => {
      const result = await service.search({
        query: 'persona',
        ghost_context: { accessor_trust_level: 5 as any, owner_user_id: userId },
      });
      const types = result.memories.map((m: any) => m.content_type);
      expect(types).not.toContain('ghost');
    });

    it('includes ghost content when include_ghost_content is true', async () => {
      const result = await service.search({
        query: 'persona',
        ghost_context: { accessor_trust_level: 5 as any, owner_user_id: userId, include_ghost_content: true },
      });
      const types = result.memories.map((m: any) => m.content_type);
      expect(types).toContain('ghost');
    });

    it('includes ghost content when filters.types explicitly includes ghost', async () => {
      const result = await service.search({
        query: 'persona',
        filters: { types: ['ghost'] },
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
          content_type: 'note', trust_score: 2, deleted_at: null,
        },
      });
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'high trust secret',
          content_type: 'note', trust_score: 5, deleted_at: null,
        },
      });
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'ghost data',
          content_type: 'ghost', trust_score: 2, deleted_at: null,
        },
      });
    });

    it('applies trust filter when ghost_context provided', async () => {
      const result = await service.query({
        query: 'fact',
        ghost_context: { accessor_trust_level: 3 as any, owner_user_id: userId },
      });
      const trustScores = result.memories.map((m: any) => m.trust_score);
      expect(trustScores.every((t: number) => t <= 3)).toBe(true);
    });

    it('excludes ghost content by default', async () => {
      const result = await service.query({
        query: 'data',
        ghost_context: { accessor_trust_level: 5 as any, owner_user_id: userId },
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
          content_type: 'note', trust_score: 2, deleted_at: null,
        },
      });
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'ghost trail info',
          content_type: 'ghost', trust_score: 3, deleted_at: null,
        },
      });
    });

    it('excludes ghost content when ghost_context provided', async () => {
      const result = await service.findSimilar({
        text: 'hiking',
        ghost_context: { accessor_trust_level: 5 as any, owner_user_id: userId },
      });
      const types = result.similar_memories.map((m: any) => m.content_type);
      expect(types).not.toContain('ghost');
    });

    it('applies trust filter when ghost_context provided', async () => {
      const result = await service.findSimilar({
        text: 'hiking',
        ghost_context: { accessor_trust_level: 1 as any, owner_user_id: userId },
      });
      const trustScores = result.similar_memories.map((m: any) => m.trust_score);
      expect(trustScores.every((t: number) => t <= 1)).toBe(true);
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

    it('includes ghost content when filters.types explicitly includes ghost', async () => {
      await collection.data.insert({
        properties: {
          user_id: userId, doc_type: 'memory', content: 'ghost byTime target',
          content_type: 'ghost', deleted_at: null,
          created_at: new Date().toISOString(),
        },
      });

      const result = await service.byTime({
        limit: 10,
        filters: { types: ['ghost'] },
      });

      expect(result.memories.length).toBeGreaterThanOrEqual(1);
      for (const memory of result.memories) {
        expect(memory.content_type).toBe('ghost');
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

    it('always calls memoryIndex.index() on default service', async () => {
      const result = await service.create({ content: 'indexed by default' });
      expect(result.memory_id).toBeDefined();
      expect(mockMemoryIndex.index).toHaveBeenCalledWith(result.memory_id, collection.name);
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

    it('returns null when index returns null (no legacy fallback)', async () => {
      mockIndex.lookup.mockResolvedValue(null);

      const svc = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockIndex as any,
        weaviateClient: mockWeaviateClient,
      });

      const result = await svc.resolveById('unindexed-uuid');

      expect(result.memory).toBeNull();
      expect(result.collectionName).toBeNull();
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

  });

  describe('byDiscovery', () => {
    beforeEach(async () => {
      // Create rated memories (rating_count >= 5)
      const rated1 = await service.create({ content: 'Popular article about cats' });
      await collection.data.update({ id: rated1.memory_id, properties: { rating_count: 10, rating_bayesian: 4.5 } });
      const rated2 = await service.create({ content: 'Well-known dog story' });
      await collection.data.update({ id: rated2.memory_id, properties: { rating_count: 8, rating_bayesian: 3.9 } });

      // Create discovery memories (rating_count < 5)
      const disc1 = await service.create({ content: 'New essay about cats' });
      await collection.data.update({ id: disc1.memory_id, properties: { rating_count: 0, rating_bayesian: 0 } });
      const disc2 = await service.create({ content: 'Fresh take on dogs' });
      await collection.data.update({ id: disc2.memory_id, properties: { rating_count: 2, rating_bayesian: 2.0 } });
    });

    it('returns interleaved results without query (browse mode)', async () => {
      const result = await service.byDiscovery({ limit: 10 });
      expect(result.memories.length).toBe(4);
      // Should have both discovery and non-discovery items
      const discoveryItems = result.memories.filter((m) => m.is_discovery);
      const ratedItems = result.memories.filter((m) => !m.is_discovery);
      expect(discoveryItems.length).toBeGreaterThanOrEqual(1);
      expect(ratedItems.length).toBeGreaterThanOrEqual(1);
    });

    it('returns interleaved results with query (search mode)', async () => {
      const result = await service.byDiscovery({ query: 'cats', limit: 10 });
      expect(result.memories.length).toBeGreaterThanOrEqual(1);
      // Should still have is_discovery flags
      for (const memory of result.memories) {
        expect(typeof memory.is_discovery).toBe('boolean');
      }
    });

    it('uses hybrid search when query is provided', async () => {
      const hybridSpy = jest.spyOn(collection.query, 'hybrid');
      const fetchSpy = jest.spyOn(collection.query, 'fetchObjects');

      await service.byDiscovery({ query: 'cats', limit: 10 });

      // hybrid should be called (twice — rated pool + discovery pool)
      expect(hybridSpy).toHaveBeenCalledTimes(2);
      expect(hybridSpy).toHaveBeenCalledWith('cats', expect.objectContaining({ alpha: 0.7 }));
      // fetchObjects should NOT be called
      expect(fetchSpy).not.toHaveBeenCalled();

      hybridSpy.mockRestore();
      fetchSpy.mockRestore();
    });

    it('uses fetchObjects when no query is provided', async () => {
      const hybridSpy = jest.spyOn(collection.query, 'hybrid');
      const fetchSpy = jest.spyOn(collection.query, 'fetchObjects');

      await service.byDiscovery({ limit: 10 });

      // fetchObjects should be called (twice — rated pool + discovery pool)
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      // hybrid should NOT be called
      expect(hybridSpy).not.toHaveBeenCalled();

      hybridSpy.mockRestore();
      fetchSpy.mockRestore();
    });
  });

  describe('byRecommendation', () => {
    const centroidVector = [0.5, 0.5, 0];

    function createMockRecommendationService(opts: {
      insufficientData?: boolean;
      centroid?: { vector: number[]; profileSize: number } | null;
      ratedIds?: string[];
    } = {}) {
      return {
        getOrComputeCentroid: jest.fn().mockResolvedValue({
          insufficientData: opts.insufficientData ?? false,
          centroid: opts.centroid ?? { vector: centroidVector, profileSize: 10 },
        }),
        getAllUserRatedIds: jest.fn().mockResolvedValue(opts.ratedIds ?? []),
        invalidateCentroid: jest.fn(),
      };
    }

    it('throws when RecommendationService is not provided', async () => {
      await expect(
        service.byRecommendation({ userId: 'user1', limit: 10 }),
      ).rejects.toThrow('RecommendationService is required');
    });

    it('falls back to byDiscovery when insufficient data', async () => {
      const recService = createMockRecommendationService({ insufficientData: true, centroid: null });
      const recMemService = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockMemoryIndex as any,
        recommendationService: recService as any,
      });

      // Seed some memories for byDiscovery fallback
      await recMemService.create({ content: 'Memory 1' });

      const result = await recMemService.byRecommendation({ userId: 'user1', limit: 10 });
      expect(result.insufficientData).toBe(true);
      expect(result.fallback_sort_mode).toBe('byDiscovery');
      expect(result.profileSize).toBe(0);
      // All memories should have similarity_pct: 0
      for (const m of result.memories) {
        expect(m.similarity_pct).toBe(0);
      }
    });

    it('returns nearVector results with similarity_pct', async () => {
      const recService = createMockRecommendationService();
      const recMemService = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockMemoryIndex as any,
        recommendationService: recService as any,
      });

      // Seed memories (other user's memories)
      const m1 = await recMemService.create({ content: 'Memory 1' });
      await collection.data.update({ id: m1.memory_id, properties: { user_id: 'other-user' } });

      const result = await recMemService.byRecommendation({ userId: 'user1', limit: 10 });
      expect(result.insufficientData).toBe(false);
      expect(result.profileSize).toBe(10);
      expect(result.memories.length).toBeGreaterThanOrEqual(1);
      for (const m of result.memories) {
        expect(typeof m.similarity_pct).toBe('number');
        expect(m.similarity_pct).toBeGreaterThanOrEqual(0);
        expect(m.similarity_pct).toBeLessThanOrEqual(100);
      }
    });

    it('excludes already-rated memories', async () => {
      const m1 = await service.create({ content: 'Rated memory' });
      await collection.data.update({ id: m1.memory_id, properties: { user_id: 'other' } });
      const m2 = await service.create({ content: 'Unrated memory' });
      await collection.data.update({ id: m2.memory_id, properties: { user_id: 'other' } });

      const recService = createMockRecommendationService({ ratedIds: [m1.memory_id] });
      const recMemService = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockMemoryIndex as any,
        recommendationService: recService as any,
      });

      const result = await recMemService.byRecommendation({ userId: 'user1', limit: 10 });
      const resultIds = result.memories.map((m) => m.id);
      expect(resultIds).not.toContain(m1.memory_id);
    });

    it('returns empty when all results are already rated', async () => {
      const m1 = await service.create({ content: 'Memory 1' });
      await collection.data.update({ id: m1.memory_id, properties: { user_id: 'other' } });

      const recService = createMockRecommendationService({ ratedIds: [m1.memory_id] });
      const recMemService = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockMemoryIndex as any,
        recommendationService: recService as any,
      });

      const result = await recMemService.byRecommendation({ userId: 'user1', limit: 10 });
      expect(result.memories).toHaveLength(0);
    });

    it('sets fallback_sort_mode only on fallback', async () => {
      const recService = createMockRecommendationService();
      const recMemService = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockMemoryIndex as any,
        recommendationService: recService as any,
      });

      const result = await recMemService.byRecommendation({ userId: 'user1', limit: 10 });
      expect(result.fallback_sort_mode).toBeUndefined();
    });

    it('excludes user own memories via author filter', async () => {
      // Create memories owned by the current user (userId = 'test-user')
      await service.create({ content: 'My own memory' });

      const recService = createMockRecommendationService();
      const recMemService = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockMemoryIndex as any,
        recommendationService: recService as any,
      });

      // Search as the same userId that owns the memories
      const result = await recMemService.byRecommendation({ userId: userId, limit: 10 });
      // Own memories should be excluded by the author filter (user_id != userId)
      expect(result.memories).toHaveLength(0);
    });

    it('filters results below MIN_SIMILARITY threshold', async () => {
      // Create memories owned by another user — mock nearVector returns
      // ascending distance (0, 0.05, 0.1, ...), so similarity = 100%, 95%, 90%...
      // We need memories with distance > 0.7 (similarity < 30%) to be filtered.
      // Insert 20 memories to push some past the 0.3 threshold (distance > 0.7 at index 15+)
      for (let i = 0; i < 20; i++) {
        const m = await service.create({ content: `Memory ${i}` });
        await collection.data.update({ id: m.memory_id, properties: { user_id: 'other-user' } });
      }

      const recService = createMockRecommendationService();
      const recMemService = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockMemoryIndex as any,
        recommendationService: recService as any,
      });

      const result = await recMemService.byRecommendation({ userId: 'user1', limit: 50 });
      // All returned memories should have similarity_pct >= 30 (MIN_SIMILARITY * 100)
      for (const m of result.memories) {
        expect(m.similarity_pct).toBeGreaterThanOrEqual(30);
      }
      // Some memories should have been filtered out (those with distance >= 0.7)
      expect(result.memories.length).toBeLessThan(20);
    });

    it('returns empty when all results are below similarity threshold', async () => {
      // Create one memory owned by another user
      const m1 = await service.create({ content: 'Memory 1' });
      await collection.data.update({ id: m1.memory_id, properties: { user_id: 'other-user' } });

      // Mock nearVector to return very high distance (low similarity)
      const origNearVector = collection.query.nearVector;
      collection.query.nearVector = jest.fn().mockResolvedValue({
        objects: [{
          uuid: m1.memory_id,
          properties: { ...collection._store.get(m1.memory_id)!.properties },
          metadata: { distance: 0.95 }, // similarity = 5%, below 30% threshold
        }],
      });

      const recService = createMockRecommendationService();
      const recMemService = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockMemoryIndex as any,
        recommendationService: recService as any,
      });

      const result = await recMemService.byRecommendation({ userId: 'user1', limit: 10 });
      expect(result.memories).toHaveLength(0);

      // Restore
      collection.query.nearVector = origNearVector;
    });

    it('applies SearchFilters correctly', async () => {
      const m1 = await service.create({ content: 'Memory with tag' });
      await collection.data.update({
        id: m1.memory_id,
        properties: { user_id: 'other-user', tags: ['important'] },
      });
      const m2 = await service.create({ content: 'Memory without tag' });
      await collection.data.update({
        id: m2.memory_id,
        properties: { user_id: 'other-user', tags: [] },
      });

      const recService = createMockRecommendationService();
      const recMemService = new MemoryService(collection as any, userId, logger, {
        memoryIndex: mockMemoryIndex as any,
        recommendationService: recService as any,
      });

      const result = await recMemService.byRecommendation({
        userId: 'user1',
        limit: 10,
        filters: { tags: ['important'] },
      });

      // Only the memory with the matching tag should be returned
      const resultIds = result.memories.map((m) => m.id);
      expect(resultIds).toContain(m1.memory_id);
      expect(resultIds).not.toContain(m2.memory_id);
    });
  });

  // ── Emotional Weighting on Create (M28) ─────────────────────────────

  describe('emotional weighting on create', () => {
    it('persists feel_* dimensions when provided', async () => {
      const result = await service.create({
        content: 'emotional test',
        feel_happiness: 0.8,
        feel_sadness: 0.2,
        feel_valence: 0.5,
      });

      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.feel_happiness).toBe(0.8);
      expect(stored!.properties.feel_sadness).toBe(0.2);
      expect(stored!.properties.feel_valence).toBe(0.5);
    });

    it('persists functional_* dimensions when provided', async () => {
      const result = await service.create({
        content: 'functional test',
        functional_salience: 0.9,
        functional_urgency: 0.1,
      });

      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.functional_salience).toBe(0.9);
      expect(stored!.properties.functional_urgency).toBe(0.1);
    });

    it('creates without emotional fields (no additional properties set)', async () => {
      const result = await service.create({ content: 'plain memory' });
      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.content).toBe('plain memory');
      // feel_happiness should not be in properties
      expect(stored!.properties.feel_happiness).toBeUndefined();
    });

    it('rejects feel_happiness out of 0-1 range', async () => {
      await expect(service.create({
        content: 'test',
        feel_happiness: 1.5,
      })).rejects.toThrow('feel_happiness must be between 0 and 1');
    });

    it('rejects negative feel_happiness', async () => {
      await expect(service.create({
        content: 'test',
        feel_happiness: -0.1,
      })).rejects.toThrow('feel_happiness must be between 0 and 1');
    });

    it('rejects feel_valence out of -1 to 1 range', async () => {
      await expect(service.create({
        content: 'test',
        feel_valence: -2.0,
      })).rejects.toThrow('feel_valence must be between -1 and 1');
    });

    it('accepts feel_valence at boundary values (-1, 0, 1)', async () => {
      const r1 = await service.create({ content: 'test', feel_valence: -1 });
      expect(collection._store.get(r1.memory_id)!.properties.feel_valence).toBe(-1);

      const r2 = await service.create({ content: 'test', feel_valence: 0 });
      expect(collection._store.get(r2.memory_id)!.properties.feel_valence).toBe(0);

      const r3 = await service.create({ content: 'test', feel_valence: 1 });
      expect(collection._store.get(r3.memory_id)!.properties.feel_valence).toBe(1);
    });

    it('auto-computes composites when dimensions provided but composites omitted', async () => {
      const result = await service.create({
        content: 'test',
        feel_happiness: 0.8,
        feel_sadness: 0.4,
        functional_salience: 0.6,
      });

      const stored = collection._store.get(result.memory_id);
      // feel_significance = avg(0.8, 0.4) = 0.6
      expect(stored!.properties.feel_significance).toBeCloseTo(0.6);
      // functional_significance = avg(0.6) = 0.6
      expect(stored!.properties.functional_significance).toBeCloseTo(0.6);
      // total_significance = 0.6 + 0.6 = 1.2
      expect(stored!.properties.total_significance).toBeCloseTo(1.2);
    });

    it('uses explicit composites when provided directly', async () => {
      const result = await service.create({
        content: 'test',
        feel_happiness: 0.8,
        feel_significance: 0.99,
        functional_significance: 0.5,
        total_significance: 1.49,
      });

      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.feel_significance).toBe(0.99);
      expect(stored!.properties.functional_significance).toBe(0.5);
      expect(stored!.properties.total_significance).toBe(1.49);
    });

    it('persists observation text', async () => {
      const result = await service.create({
        content: 'test',
        observation: 'This is a thoughtful entry about relationships',
      });

      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.observation).toBe('This is a thoughtful entry about relationships');
    });

    it('sets rem_visits to 0 on create', async () => {
      const result = await service.create({ content: 'test' });
      const stored = collection._store.get(result.memory_id);
      expect(stored!.properties.rem_visits).toBe(0);
    });
  });

  // ── byProperty Sort Mode ───────────────────────────────────────────

  describe('byProperty', () => {
    beforeEach(async () => {
      await service.create({ content: 'low trauma', feel_trauma: 0.1 });
      await service.create({ content: 'high trauma', feel_trauma: 0.9 });
      await service.create({ content: 'mid trauma', feel_trauma: 0.5 });
    });

    it('sorts by feel_trauma descending', async () => {
      const result = await service.byProperty({
        sort_field: 'feel_trauma',
        sort_direction: 'desc',
      });
      expect(result.memories).toHaveLength(3);
      expect(result.memories[0].feel_trauma).toBe(0.9);
      expect(result.memories[2].feel_trauma).toBe(0.1);
    });

    it('sorts by feel_trauma ascending', async () => {
      const result = await service.byProperty({
        sort_field: 'feel_trauma',
        sort_direction: 'asc',
      });
      expect(result.memories[0].feel_trauma).toBe(0.1);
      expect(result.memories[2].feel_trauma).toBe(0.9);
    });

    it('returns sort_field and sort_direction in result', async () => {
      const result = await service.byProperty({
        sort_field: 'feel_trauma',
        sort_direction: 'desc',
      });
      expect(result.sort_field).toBe('feel_trauma');
      expect(result.sort_direction).toBe('desc');
    });

    it('respects limit', async () => {
      const result = await service.byProperty({
        sort_field: 'feel_trauma',
        sort_direction: 'desc',
        limit: 2,
      });
      expect(result.memories).toHaveLength(2);
      expect(result.limit).toBe(2);
    });

    it('respects offset', async () => {
      const result = await service.byProperty({
        sort_field: 'feel_trauma',
        sort_direction: 'desc',
        offset: 1,
      });
      expect(result.memories).toHaveLength(2);
      expect(result.offset).toBe(1);
    });

    it('rejects invalid sort_field', async () => {
      await expect(
        service.byProperty({ sort_field: 'nonexistent_field', sort_direction: 'desc' }),
      ).rejects.toThrow('Invalid sort_field');
    });

    it('sorts by total_significance', async () => {
      await service.create({ content: 'sig', feel_happiness: 1.0, functional_salience: 1.0 });
      const result = await service.byProperty({
        sort_field: 'total_significance',
        sort_direction: 'desc',
      });
      expect(result.memories.length).toBeGreaterThan(0);
    });

    it('sorts by created_at (existing property)', async () => {
      const result = await service.byProperty({
        sort_field: 'created_at',
        sort_direction: 'asc',
      });
      expect(result.memories.length).toBeGreaterThan(0);
    });

    it('sorts by rem_visits', async () => {
      const result = await service.byProperty({
        sort_field: 'rem_visits',
        sort_direction: 'desc',
      });
      expect(result.memories.length).toBeGreaterThan(0);
    });

    it('accepts functional_ properties', async () => {
      await service.create({ content: 'urgent', functional_urgency: 0.8 });
      const result = await service.byProperty({
        sort_field: 'functional_urgency',
        sort_direction: 'desc',
      });
      expect(result.memories.length).toBeGreaterThan(0);
    });
  });

  describe('byBroad', () => {
    it('returns truncated content for long memories', async () => {
      const longContent = 'A'.repeat(500);
      await service.create({ content: longContent });
      const result = await service.byBroad({});
      expect(result.results).toHaveLength(1);
      expect(result.results[0].content_head).toHaveLength(100);
      expect(result.results[0].content_mid).toHaveLength(100);
      expect(result.results[0].content_tail).toHaveLength(100);
    });

    it('returns full content for short memories', async () => {
      await service.create({ content: 'short' });
      const result = await service.byBroad({});
      expect(result.results).toHaveLength(1);
      expect(result.results[0].content_head).toBe('short');
      expect(result.results[0].content_mid).toBe('');
      expect(result.results[0].content_tail).toBe('');
    });

    it('defaults to limit 50', async () => {
      const result = await service.byBroad({});
      expect(result.limit).toBe(50);
    });

    it('applies custom limit and offset', async () => {
      await service.create({ content: 'one' });
      await service.create({ content: 'two' });
      await service.create({ content: 'three' });
      const result = await service.byBroad({ limit: 2, offset: 1 });
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(1);
    });

    it('includes optional fields when present', async () => {
      await service.create({
        content: 'test memory',
        title: 'My Title',
        tags: ['tag1'],
      });
      const result = await service.byBroad({});
      expect(result.results[0].title).toBe('My Title');
      expect(result.results[0].tags).toEqual(['tag1']);
    });

    it('includes weight in results', async () => {
      await service.create({ content: 'weighted', weight: 0.9 });
      const result = await service.byBroad({});
      expect(result.results[0].weight).toBe(0.9);
    });
  });

  describe('byRandom', () => {
    it('returns random memories from collection', async () => {
      for (let i = 0; i < 5; i++) {
        await service.create({ content: `memory ${i}` });
      }
      const result = await service.byRandom({ limit: 3 });
      expect(result.results).toHaveLength(3);
      expect(result.total_pool_size).toBe(5);
    });

    it('defaults to limit 10', async () => {
      await service.create({ content: 'single' });
      const result = await service.byRandom({});
      expect(result.results).toHaveLength(1);
      expect(result.total_pool_size).toBe(1);
    });

    it('returns empty for empty collection', async () => {
      const result = await service.byRandom({});
      expect(result.results).toEqual([]);
      expect(result.total_pool_size).toBe(0);
    });

    it('returns all when pool smaller than limit', async () => {
      await service.create({ content: 'one' });
      await service.create({ content: 'two' });
      const result = await service.byRandom({ limit: 10 });
      expect(result.results).toHaveLength(2);
      expect(result.total_pool_size).toBe(2);
    });

    it('returns full memory objects (not truncated)', async () => {
      const longContent = 'A'.repeat(500);
      await service.create({ content: longContent });
      const result = await service.byRandom({});
      expect(result.results[0]).toHaveProperty('content', longContent);
    });

    it('no duplicate memories in results', async () => {
      for (let i = 0; i < 10; i++) {
        await service.create({ content: `memory ${i}` });
      }
      const result = await service.byRandom({ limit: 10 });
      const ids = result.results.map((m: any) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('total_pool_size reflects filtered pool', async () => {
      await service.create({ content: 'tagged', tags: ['special'] });
      await service.create({ content: 'not tagged' });
      // Without tag filter, pool should include both
      const result = await service.byRandom({});
      expect(result.total_pool_size).toBe(2);
    });
  });
});

describe('sliceContent', () => {
  it('returns full content for short strings (<=100)', () => {
    const result = sliceContent('hello');
    expect(result).toEqual({ head: 'hello', mid: '', tail: '' });
  });

  it('returns full content for exactly 100 chars', () => {
    const s = 'x'.repeat(100);
    const result = sliceContent(s);
    expect(result).toEqual({ head: s, mid: '', tail: '' });
  });

  it('splits into head/tail for medium strings (101-200)', () => {
    const s = 'A'.repeat(150);
    const result = sliceContent(s);
    expect(result.head).toHaveLength(75);
    expect(result.mid).toBe('');
    expect(result.tail).toHaveLength(75);
    expect(result.head + result.tail).toBe(s);
  });

  it('splits into thirds for near-300 strings (201-300)', () => {
    const s = 'B'.repeat(270);
    const result = sliceContent(s);
    const third = Math.floor(270 / 3);
    expect(result.head).toHaveLength(third);
    expect(result.mid).toHaveLength(third);
    expect(result.tail).toBe(s.slice(third * 2));
  });

  it('returns 100-char slices for long strings (>300)', () => {
    const s = 'C'.repeat(500);
    const result = sliceContent(s);
    expect(result.head).toHaveLength(100);
    expect(result.mid).toHaveLength(100);
    expect(result.tail).toHaveLength(100);
    expect(result.head).toBe(s.slice(0, 100));
    expect(result.tail).toBe(s.slice(-100));
  });

  it('returns empty strings for empty input', () => {
    const result = sliceContent('');
    expect(result).toEqual({ head: '', mid: '', tail: '' });
  });

  it('mid slice is centered for long strings', () => {
    const s = Array.from({ length: 500 }, (_, i) => String.fromCharCode(65 + (i % 26))).join('');
    const result = sliceContent(s);
    const midStart = Math.floor(500 / 2) - Math.floor(100 / 2);
    expect(result.mid).toBe(s.slice(midStart, midStart + 100));
  });
});
