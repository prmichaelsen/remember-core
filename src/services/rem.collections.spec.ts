import { getNextMemoryCollection, enumerateAllCollections } from './rem.collections.js';

// Mock the collection registry (for deprecated getNextMemoryCollection)
jest.mock('../database/collection-registry.js', () => ({
  getNextRegisteredCollection: jest.fn(),
}));

import { getNextRegisteredCollection } from '../database/collection-registry.js';

const mockGetNext = getNextRegisteredCollection as jest.MockedFunction<
  typeof getNextRegisteredCollection
>;

function mockWeaviateClient(collectionNames: string[]) {
  return {
    collections: {
      listAll: jest.fn().mockResolvedValue(
        collectionNames.map((name) => ({ name })),
      ),
    },
  } as any;
}

describe('REM Collections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('enumerateAllCollections', () => {
    it('yields all Memory_* collections from Weaviate', async () => {
      const client = mockWeaviateClient([
        'Memory_users_alice',
        'Memory_users_bob',
        'Memory_spaces_public',
      ]);

      const results: string[] = [];
      for await (const name of enumerateAllCollections(client)) {
        results.push(name);
      }

      expect(results).toEqual([
        'Memory_users_alice',
        'Memory_users_bob',
        'Memory_spaces_public',
      ]);
    });

    it('filters out non-Memory collections', async () => {
      const client = mockWeaviateClient([
        'Memory_users_alice',
        'SomeOtherCollection',
        'Relationship_users_alice',
        'Memory_friends_bob',
      ]);

      const results: string[] = [];
      for await (const name of enumerateAllCollections(client)) {
        results.push(name);
      }

      expect(results).toEqual([
        'Memory_users_alice',
        'Memory_friends_bob',
      ]);
    });

    it('yields nothing when no collections exist', async () => {
      const client = mockWeaviateClient([]);

      const results: string[] = [];
      for await (const name of enumerateAllCollections(client)) {
        results.push(name);
      }

      expect(results).toEqual([]);
    });

    it('yields nothing when no Memory_* collections exist', async () => {
      const client = mockWeaviateClient([
        'Relationship_users_alice',
        'OtherThing',
      ]);

      const results: string[] = [];
      for await (const name of enumerateAllCollections(client)) {
        results.push(name);
      }

      expect(results).toEqual([]);
    });
  });

  describe('getNextMemoryCollection (deprecated)', () => {
    it('delegates to getNextRegisteredCollection with null cursor', async () => {
      mockGetNext.mockResolvedValue('Memory_users_alice');

      const result = await getNextMemoryCollection(null);

      expect(result).toBe('Memory_users_alice');
      expect(mockGetNext).toHaveBeenCalledWith(null);
    });

    it('delegates to getNextRegisteredCollection with cursor', async () => {
      mockGetNext.mockResolvedValue('Memory_users_bob');

      const result = await getNextMemoryCollection('Memory_users_alice');

      expect(result).toBe('Memory_users_bob');
      expect(mockGetNext).toHaveBeenCalledWith('Memory_users_alice');
    });

    it('returns null when registry is empty', async () => {
      mockGetNext.mockResolvedValue(null);

      const result = await getNextMemoryCollection(null);

      expect(result).toBeNull();
    });
  });
});
