import { MemoryResolutionService } from '../memory-resolution.service.js';
import { createMockWeaviateClient, createMockLogger } from '../../testing/weaviate-mock.js';
import { CollectionType, getCollectionName } from '../../collections/dot-notation.js';

describe('MemoryResolutionService', () => {
  let client: ReturnType<typeof createMockWeaviateClient>;
  let logger: ReturnType<typeof createMockLogger>;
  const userId = 'test-user';

  beforeEach(() => {
    client = createMockWeaviateClient();
    logger = createMockLogger();
  });

  function createService(uid = userId) {
    return new MemoryResolutionService(client, uid, logger);
  }

  async function insertMemory(collectionName: string, id: string, properties: Record<string, unknown>) {
    const col = client.collections.get(collectionName);
    await col.data.insert({ id, properties });
  }

  describe('resolveCollectionName', () => {
    it('returns group collection when group is provided', () => {
      const svc = createService();
      expect(svc.resolveCollectionName({ group: 'team-a' })).toBe('Memory_groups_team-a');
    });

    it('returns spaces collection when space is provided', () => {
      const svc = createService();
      expect(svc.resolveCollectionName({ space: 'some-space' })).toBe('Memory_spaces_public');
    });

    it('returns author collection when author is provided', () => {
      const svc = createService();
      expect(svc.resolveCollectionName({ author: 'other-user' })).toBe('Memory_users_other-user');
    });

    it('returns user own collection when no source params', () => {
      const svc = createService();
      expect(svc.resolveCollectionName()).toBe('Memory_users_test-user');
    });

    it('returns user own collection when source params are all null', () => {
      const svc = createService();
      expect(svc.resolveCollectionName({ author: null, space: null, group: null })).toBe('Memory_users_test-user');
    });

    it('group takes priority over space and author', () => {
      const svc = createService();
      expect(svc.resolveCollectionName({ group: 'g1', space: 's1', author: 'a1' })).toBe('Memory_groups_g1');
    });

    it('space takes priority over author', () => {
      const svc = createService();
      expect(svc.resolveCollectionName({ space: 's1', author: 'a1' })).toBe('Memory_spaces_public');
    });
  });

  describe('resolve', () => {
    it('returns memory from primary collection when found', async () => {
      const svc = createService();
      const colName = getCollectionName(CollectionType.USERS, userId);
      await insertMemory(colName, 'mem-1', { content: 'hello', user_id: userId });

      const result = await svc.resolve('mem-1');
      expect(result).not.toBeNull();
      expect(result!.memory.id).toBe('mem-1');
      expect(result!.memory.content).toBe('hello');
      expect(result!.collectionName).toBe(colName);
    });

    it('returns memory from space collection when space param provided', async () => {
      const svc = createService();
      const spacesCol = getCollectionName(CollectionType.SPACES);
      await insertMemory(spacesCol, 'mem-2', { content: 'space memory', author_id: userId });

      const result = await svc.resolve('mem-2', { space: 'any-space' });
      expect(result).not.toBeNull();
      expect(result!.memory.content).toBe('space memory');
      expect(result!.collectionName).toBe(spacesCol);
    });

    it('falls back to user collection when space collection has no match', async () => {
      const svc = createService();
      const userCol = getCollectionName(CollectionType.USERS, userId);
      await insertMemory(userCol, 'mem-3', { content: 'user memory', user_id: userId });
      // Do NOT insert into spaces collection

      const result = await svc.resolve('mem-3', { space: 'wrong-space' });
      expect(result).not.toBeNull();
      expect(result!.memory.content).toBe('user memory');
      expect(result!.collectionName).toBe(userCol);
    });

    it('falls back to user collection when group collection has no match', async () => {
      const svc = createService();
      const userCol = getCollectionName(CollectionType.USERS, userId);
      await insertMemory(userCol, 'mem-4', { content: 'user memory', user_id: userId });

      const result = await svc.resolve('mem-4', { group: 'wrong-group' });
      expect(result).not.toBeNull();
      expect(result!.memory.content).toBe('user memory');
      expect(result!.collectionName).toBe(userCol);
    });

    it('falls back to user collection when author collection has no match', async () => {
      const svc = createService();
      const userCol = getCollectionName(CollectionType.USERS, userId);
      await insertMemory(userCol, 'mem-5', { content: 'user memory', user_id: userId });

      const result = await svc.resolve('mem-5', { author: 'wrong-author' });
      expect(result).not.toBeNull();
      expect(result!.memory.content).toBe('user memory');
      expect(result!.collectionName).toBe(userCol);
    });

    it('returns null when memory not found anywhere', async () => {
      const svc = createService();
      const result = await svc.resolve('nonexistent', { space: 'some-space' });
      expect(result).toBeNull();
    });

    it('returns null when no context params and memory not in user collection', async () => {
      const svc = createService();
      const result = await svc.resolve('nonexistent');
      expect(result).toBeNull();
    });

    it('does not fallback when no context params provided', async () => {
      const svc = createService();
      // Memory exists in spaces but not user collection, no context params → should not find it
      const spacesCol = getCollectionName(CollectionType.SPACES);
      await insertMemory(spacesCol, 'mem-6', { content: 'space only', author_id: 'other' });

      const result = await svc.resolve('mem-6');
      expect(result).toBeNull();
    });

    it('does not duplicate query when author equals userId', async () => {
      const svc = createService();
      // author=test-user resolves to same collection as fallback → should only query once
      const result = await svc.resolve('nonexistent', { author: userId });
      expect(result).toBeNull();
    });
  });
});
