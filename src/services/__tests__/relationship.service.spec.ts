import { RelationshipService } from '../relationship.service.js';
import { createMockCollection, createMockLogger } from '../../testing/weaviate-mock.js';

describe('RelationshipService', () => {
  let collection: ReturnType<typeof createMockCollection>;
  let logger: ReturnType<typeof createMockLogger>;
  let service: RelationshipService;
  const userId = 'test-user';

  beforeEach(() => {
    collection = createMockCollection();
    logger = createMockLogger();
    service = new RelationshipService(collection as any, userId, logger);
  });

  async function insertMemory(overrides: Record<string, any> = {}) {
    return collection.data.insert({
      properties: {
        user_id: userId,
        doc_type: 'memory',
        content: 'test memory',
        relationship_ids: [],
        deleted_at: null,
        ...overrides,
      },
    });
  }

  describe('create', () => {
    it('creates a relationship between two memories', async () => {
      const mem1 = await insertMemory();
      const mem2 = await insertMemory();

      const result = await service.create({
        memory_ids: [mem1, mem2],
        relationship_type: 'related_to',
        observation: 'these are related',
      });

      expect(result.relationship_id).toBeDefined();
      expect(result.memory_ids).toEqual([mem1, mem2]);
      expect(result.created_at).toBeDefined();

      // Verify relationship stored with correct doc_type
      const rel = collection._store.get(result.relationship_id);
      expect(rel!.properties.doc_type).toBe('relationship');
      expect(rel!.properties.related_memory_ids).toEqual([mem1, mem2]);
      expect(rel!.properties.relationship_type).toBe('related_to');
      expect(rel!.properties.strength).toBe(0.5);
      expect(rel!.properties.confidence).toBe(0.8);
    });

    it('throws if less than 2 memory IDs', async () => {
      const mem1 = await insertMemory();
      await expect(
        service.create({
          memory_ids: [mem1],
          relationship_type: 'related_to',
          observation: 'test',
        }),
      ).rejects.toThrow('At least 2 memory IDs');
    });

    it('throws if memory not found', async () => {
      const mem1 = await insertMemory();
      await expect(
        service.create({
          memory_ids: [mem1, 'nonexistent'],
          relationship_type: 'related_to',
          observation: 'test',
        }),
      ).rejects.toThrow('Memory validation failed');
    });

    it('throws if memory belongs to other user', async () => {
      const mem1 = await insertMemory();
      const mem2 = await insertMemory({ user_id: 'other-user' });
      await expect(
        service.create({
          memory_ids: [mem1, mem2],
          relationship_type: 'related_to',
          observation: 'test',
        }),
      ).rejects.toThrow('Memory validation failed');
    });

    it('throws if memory is deleted', async () => {
      const mem1 = await insertMemory();
      const mem2 = await insertMemory({ deleted_at: '2026-01-01' });
      await expect(
        service.create({
          memory_ids: [mem1, mem2],
          relationship_type: 'related_to',
          observation: 'test',
        }),
      ).rejects.toThrow('Memory validation failed');
    });

    it('applies custom strength and confidence', async () => {
      const mem1 = await insertMemory();
      const mem2 = await insertMemory();

      const result = await service.create({
        memory_ids: [mem1, mem2],
        relationship_type: 'inspired_by',
        observation: 'test',
        strength: 0.9,
        confidence: 0.95,
      });

      const rel = collection._store.get(result.relationship_id);
      expect(rel!.properties.strength).toBe(0.9);
      expect(rel!.properties.confidence).toBe(0.95);
    });

    it('updates connected memories with relationship ID', async () => {
      const mem1 = await insertMemory();
      const mem2 = await insertMemory();

      const result = await service.create({
        memory_ids: [mem1, mem2],
        relationship_type: 'related_to',
        observation: 'test',
      });

      const stored1 = collection._store.get(mem1);
      const stored2 = collection._store.get(mem2);
      expect(stored1!.properties.relationship_ids).toContain(result.relationship_id);
      expect(stored2!.properties.relationship_ids).toContain(result.relationship_id);
    });
  });

  describe('update', () => {
    let relId: string;

    beforeEach(async () => {
      relId = await collection.data.insert({
        properties: {
          user_id: userId,
          doc_type: 'relationship',
          relationship_type: 'related_to',
          observation: 'original',
          strength: 0.5,
          confidence: 0.8,
          version: 1,
        },
      });
    });

    it('updates fields and increments version', async () => {
      const result = await service.update({
        relationship_id: relId,
        observation: 'updated observation',
        strength: 0.9,
      });
      expect(result.version).toBe(2);
      expect(result.updated_fields).toContain('observation');
      expect(result.updated_fields).toContain('strength');
    });

    it('throws for nonexistent relationship', async () => {
      await expect(
        service.update({ relationship_id: 'nonexistent', observation: 'x' }),
      ).rejects.toThrow('Relationship not found');
    });

    it('throws for unauthorized access', async () => {
      const otherId = await collection.data.insert({
        properties: { user_id: 'other-user', doc_type: 'relationship', version: 1 },
      });
      await expect(
        service.update({ relationship_id: otherId, observation: 'x' }),
      ).rejects.toThrow('Unauthorized');
    });

    it('throws for memory documents', async () => {
      const memId = await insertMemory();
      await expect(
        service.update({ relationship_id: memId, observation: 'x' }),
      ).rejects.toThrow('Not a relationship document');
    });

    it('throws for no fields', async () => {
      await expect(service.update({ relationship_id: relId })).rejects.toThrow('No fields provided');
    });

    it('validates strength range', async () => {
      await expect(
        service.update({ relationship_id: relId, strength: 2 }),
      ).rejects.toThrow('Strength must be between 0 and 1');
    });

    it('validates confidence range', async () => {
      await expect(
        service.update({ relationship_id: relId, confidence: -1 }),
      ).rejects.toThrow('Confidence must be between 0 and 1');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await collection.data.insert({
        properties: {
          user_id: userId,
          doc_type: 'relationship',
          relationship_type: 'inspired_by',
          observation: 'camping inspired hiking',
          strength: 0.8,
          confidence: 0.9,
          tags: ['outdoor'],
          deleted_at: null,
        },
      });
      await collection.data.insert({
        properties: {
          user_id: userId,
          doc_type: 'memory',
          content: 'a memory, not relationship',
          deleted_at: null,
        },
      });
    });

    it('returns only relationship documents', async () => {
      const result = await service.search({ query: 'camping' });
      expect(result.relationships.length).toBeGreaterThanOrEqual(1);
      for (const rel of result.relationships) {
        expect(rel.doc_type).toBe('relationship');
      }
    });
  });

  describe('delete', () => {
    it('deletes relationship and cleans up memory references', async () => {
      const mem1 = await insertMemory();
      const mem2 = await insertMemory();

      const createResult = await service.create({
        memory_ids: [mem1, mem2],
        relationship_type: 'related_to',
        observation: 'test',
      });

      const deleteResult = await service.delete({ relationship_id: createResult.relationship_id });
      expect(deleteResult.relationship_id).toBe(createResult.relationship_id);
      expect(deleteResult.memories_updated).toBe(2);

      // Relationship should be gone
      expect(collection._store.has(createResult.relationship_id)).toBe(false);

      // Memory references should be cleaned up
      const stored1 = collection._store.get(mem1);
      expect(stored1!.properties.relationship_ids).not.toContain(createResult.relationship_id);
    });

    it('throws for nonexistent relationship', async () => {
      await expect(service.delete({ relationship_id: 'nonexistent' })).rejects.toThrow(
        'Relationship not found',
      );
    });

    it('throws for unauthorized access', async () => {
      const otherId = await collection.data.insert({
        properties: { user_id: 'other-user', doc_type: 'relationship', related_memory_ids: [] },
      });
      await expect(service.delete({ relationship_id: otherId })).rejects.toThrow('Unauthorized');
    });
  });
});
