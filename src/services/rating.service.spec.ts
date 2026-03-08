import { RatingService } from './rating.service.js';
import { computeBayesianScore, computeRatingAvg } from '../types/rating.types.js';

// Mock Firestore helpers
jest.mock('../database/firestore/init.js', () => ({
  getDocument: jest.fn(),
  setDocument: jest.fn(),
  deleteDocument: jest.fn(),
  queryDocuments: jest.fn(),
}));

// Mock fetchMemoryWithAllProperties
jest.mock('../database/weaviate/client.js', () => ({
  fetchMemoryWithAllProperties: jest.fn(),
}));

import { getDocument, setDocument, deleteDocument, queryDocuments } from '../database/firestore/init.js';
import { fetchMemoryWithAllProperties } from '../database/weaviate/client.js';

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockSetDocument = setDocument as jest.MockedFunction<typeof setDocument>;
const mockDeleteDocument = deleteDocument as jest.MockedFunction<typeof deleteDocument>;
const mockFetchMemory = fetchMemoryWithAllProperties as jest.MockedFunction<typeof fetchMemoryWithAllProperties>;
const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;

function createMockWeaviateClient() {
  const mockUpdate = jest.fn().mockResolvedValue(undefined);
  const mockHybrid = jest.fn().mockResolvedValue({ objects: [] });
  const mockCollection = {
    data: { update: mockUpdate },
    query: { hybrid: mockHybrid },
  };
  return {
    client: {
      collections: {
        get: jest.fn().mockReturnValue(mockCollection),
      },
    } as any,
    collection: mockCollection,
    update: mockUpdate,
    hybrid: mockHybrid,
  };
}

function createMockMemoryIndexService(collectionName: string | null = 'Memory_users_owner1') {
  return {
    lookup: jest.fn().mockResolvedValue(collectionName),
    index: jest.fn(),
    collectionPath: 'test',
  } as any;
}

function createMockLogger() {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('RatingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rate()', () => {
    it('creates a new rating', async () => {
      const { client, update } = createMockWeaviateClient();
      const memoryIndex = createMockMemoryIndexService();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: memoryIndex, logger: createMockLogger() });

      mockFetchMemory.mockResolvedValue({
        properties: { user_id: 'owner1', rating_sum: 0, rating_count: 0, rating_bayesian: 3.0 },
      } as any);
      mockGetDocument.mockResolvedValue(null);

      const result = await service.rate({ memoryId: 'mem-1', userId: 'rater1', rating: 4 });

      expect(result.previousRating).toBeNull();
      expect(result.newRating).toBe(4);
      expect(result.ratingCount).toBe(1);
      expect(result.ratingAvg).toBeNull(); // count < 5
      expect(update).toHaveBeenCalledWith({
        id: 'mem-1',
        properties: {
          rating_sum: 4,
          rating_count: 1,
          rating_bayesian: computeBayesianScore(4, 1),
        },
      });
      expect(mockSetDocument).toHaveBeenCalledWith(
        expect.stringContaining('memory_ratings/mem-1/ratings'),
        'rater1',
        expect.objectContaining({ rating: 4 }),
      );
    });

    it('updates an existing rating (change case)', async () => {
      const { client, update } = createMockWeaviateClient();
      const memoryIndex = createMockMemoryIndexService();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: memoryIndex, logger: createMockLogger() });

      mockFetchMemory.mockResolvedValue({
        properties: { user_id: 'owner1', rating_sum: 4, rating_count: 1, rating_bayesian: computeBayesianScore(4, 1) },
      } as any);
      mockGetDocument.mockResolvedValue({ rating: 4, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });

      const result = await service.rate({ memoryId: 'mem-1', userId: 'rater1', rating: 2 });

      expect(result.previousRating).toBe(4);
      expect(result.newRating).toBe(2);
      expect(result.ratingCount).toBe(1); // count unchanged
      // sum: 4 + (2 - 4) = 2
      expect(update).toHaveBeenCalledWith({
        id: 'mem-1',
        properties: {
          rating_sum: 2,
          rating_count: 1,
          rating_bayesian: computeBayesianScore(2, 1),
        },
      });
    });

    it('rejects rating outside 1-5', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      await expect(service.rate({ memoryId: 'mem-1', userId: 'rater1', rating: 0 })).rejects.toThrow('Invalid rating');
      await expect(service.rate({ memoryId: 'mem-1', userId: 'rater1', rating: 6 })).rejects.toThrow('Invalid rating');
      await expect(service.rate({ memoryId: 'mem-1', userId: 'rater1', rating: 1.5 })).rejects.toThrow('Invalid rating');
      await expect(service.rate({ memoryId: 'mem-1', userId: 'rater1', rating: -1 })).rejects.toThrow('Invalid rating');
    });

    it('throws when memory not in index', async () => {
      const { client } = createMockWeaviateClient();
      const memoryIndex = createMockMemoryIndexService(null);
      const service = new RatingService({ weaviateClient: client, memoryIndexService: memoryIndex, logger: createMockLogger() });

      await expect(service.rate({ memoryId: 'mem-1', userId: 'rater1', rating: 3 })).rejects.toThrow('Memory not found in index');
    });

    it('throws when memory not found in Weaviate', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockFetchMemory.mockResolvedValue(null);

      await expect(service.rate({ memoryId: 'mem-1', userId: 'rater1', rating: 3 })).rejects.toThrow('Memory not found');
    });

    it('multi-step sequence: rate(3) → rate(5) produces correct aggregates', async () => {
      const { client, update } = createMockWeaviateClient();
      const memoryIndex = createMockMemoryIndexService();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: memoryIndex, logger: createMockLogger() });

      // Step 1: rate(3)
      mockFetchMemory.mockResolvedValue({
        properties: { user_id: 'owner1', rating_sum: 0, rating_count: 0, rating_bayesian: 3.0 },
      } as any);
      mockGetDocument.mockResolvedValue(null);

      await service.rate({ memoryId: 'mem-1', userId: 'rater1', rating: 3 });

      expect(update).toHaveBeenCalledWith({
        id: 'mem-1',
        properties: { rating_sum: 3, rating_count: 1, rating_bayesian: computeBayesianScore(3, 1) },
      });

      // Step 2: rate(5) — change
      mockFetchMemory.mockResolvedValue({
        properties: { user_id: 'owner1', rating_sum: 3, rating_count: 1, rating_bayesian: computeBayesianScore(3, 1) },
      } as any);
      mockGetDocument.mockResolvedValue({ rating: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });

      const result = await service.rate({ memoryId: 'mem-1', userId: 'rater1', rating: 5 });

      expect(result.previousRating).toBe(3);
      expect(result.newRating).toBe(5);
      // sum: 3 + (5 - 3) = 5, count: 1 (unchanged)
      expect(update).toHaveBeenLastCalledWith({
        id: 'mem-1',
        properties: { rating_sum: 5, rating_count: 1, rating_bayesian: computeBayesianScore(5, 1) },
      });
    });
  });

  describe('retract()', () => {
    it('removes rating and decrements aggregates', async () => {
      const { client, update } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockGetDocument.mockResolvedValue({ rating: 4, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
      mockFetchMemory.mockResolvedValue({
        properties: { user_id: 'owner1', rating_sum: 4, rating_count: 1, rating_bayesian: computeBayesianScore(4, 1) },
      } as any);

      await service.retract('mem-1', 'rater1');

      expect(mockDeleteDocument).toHaveBeenCalledWith(
        expect.stringContaining('memory_ratings/mem-1/ratings'),
        'rater1',
      );
      expect(update).toHaveBeenCalledWith({
        id: 'mem-1',
        properties: {
          rating_sum: 0,
          rating_count: 0,
          rating_bayesian: computeBayesianScore(0, 0),
        },
      });
    });

    it('throws when no rating exists to retract', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockGetDocument.mockResolvedValue(null);

      await expect(service.retract('mem-1', 'rater1')).rejects.toThrow('No rating found');
    });

    it('retract last rating resets bayesian to 3.0', async () => {
      const { client, update } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockGetDocument.mockResolvedValue({ rating: 5, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
      mockFetchMemory.mockResolvedValue({
        properties: { user_id: 'owner1', rating_sum: 5, rating_count: 1 },
      } as any);

      await service.retract('mem-1', 'rater1');

      // sum: 5 - 5 = 0, count: 1 - 1 = 0, bayesian: (0 + 15) / (0 + 5) = 3.0
      expect(update).toHaveBeenCalledWith({
        id: 'mem-1',
        properties: {
          rating_sum: 0,
          rating_count: 0,
          rating_bayesian: 3.0,
        },
      });
    });
  });

  describe('getUserRating()', () => {
    it('returns rating when it exists', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      const ratingDoc = { rating: 4, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
      mockGetDocument.mockResolvedValue(ratingDoc);

      const result = await service.getUserRating('mem-1', 'rater1');

      expect(result).toEqual(ratingDoc);
    });

    it('returns null when no rating exists', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockGetDocument.mockResolvedValue(null);

      const result = await service.getUserRating('mem-1', 'rater1');

      expect(result).toBeNull();
    });
  });

  describe('rate() dual-write collectionName', () => {
    it('writes collectionName to user-rating doc', async () => {
      const { client } = createMockWeaviateClient();
      const memoryIndex = createMockMemoryIndexService('Memory_spaces_poetry');
      const service = new RatingService({ weaviateClient: client, memoryIndexService: memoryIndex, logger: createMockLogger() });

      mockFetchMemory.mockResolvedValue({
        properties: { rating_sum: 0, rating_count: 0 },
      } as any);
      mockGetDocument.mockResolvedValue(null);

      await service.rate({ memoryId: 'mem-1', userId: 'user1', rating: 5 });

      // Second setDocument call is the user-rating dual-write
      const userRatingCall = mockSetDocument.mock.calls.find(
        (call) => (call[0] as string).includes('user_ratings')
      );
      expect(userRatingCall).toBeDefined();
      expect(userRatingCall![2]).toEqual(
        expect.objectContaining({ memoryId: 'mem-1', collectionName: 'Memory_spaces_poetry' })
      );
    });
  });

  describe('byMyRatings() browse mode', () => {
    function makeRatingDoc(memoryId: string, rating: number, collectionName: string, updated_at = '2026-03-01T00:00:00Z') {
      return {
        id: memoryId,
        data: { memoryId, rating, collectionName, updated_at, created_at: '2026-01-01T00:00:00Z' },
      };
    }

    it('returns empty result for user with no ratings', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([]);

      const result = await service.byMyRatings({ userId: 'user1' });

      expect(result).toEqual({ items: [], total: 0, offset: 0, limit: 50 });
    });

    it('sorts by rated_at desc (default)', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        makeRatingDoc('mem-1', 5, 'Memory_users_u1', '2026-03-02T00:00:00Z'),
        makeRatingDoc('mem-2', 3, 'Memory_users_u1', '2026-03-01T00:00:00Z'),
      ]);
      mockFetchMemory.mockImplementation(async (_col, id) => ({
        uuid: id,
        properties: { title: `Title ${id}` },
      } as any));

      const result = await service.byMyRatings({ userId: 'user1' });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].metadata.my_rating).toBe(5);
      expect(result.items[1].metadata.my_rating).toBe(3);
      expect(result.total).toBe(2);

      // Verify queryDocuments was called with updated_at sort
      expect(mockQueryDocuments).toHaveBeenCalledWith(
        expect.stringContaining('user_ratings'),
        expect.objectContaining({
          orderBy: [{ field: 'updated_at', direction: 'DESCENDING' }],
        }),
      );
    });

    it('sorts by rating desc', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        makeRatingDoc('mem-1', 5, 'Memory_users_u1'),
        makeRatingDoc('mem-2', 3, 'Memory_users_u1'),
      ]);
      mockFetchMemory.mockImplementation(async (_col, id) => ({
        uuid: id,
        properties: { title: `Title ${id}` },
      } as any));

      await service.byMyRatings({ userId: 'user1', sort_by: 'rating', direction: 'desc' });

      expect(mockQueryDocuments).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          orderBy: [{ field: 'rating', direction: 'DESCENDING' }],
        }),
      );
    });

    it('sorts by rating asc', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        makeRatingDoc('mem-1', 1, 'Memory_users_u1'),
        makeRatingDoc('mem-2', 5, 'Memory_users_u1'),
      ]);
      mockFetchMemory.mockImplementation(async (_col, id) => ({
        uuid: id,
        properties: {},
      } as any));

      await service.byMyRatings({ userId: 'user1', sort_by: 'rating', direction: 'asc' });

      expect(mockQueryDocuments).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          orderBy: [{ field: 'rating', direction: 'ASCENDING' }],
        }),
      );
    });

    it('applies pagination offset=2 limit=2', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        makeRatingDoc('mem-1', 5, 'Memory_users_u1'),
        makeRatingDoc('mem-2', 4, 'Memory_users_u1'),
        makeRatingDoc('mem-3', 3, 'Memory_users_u1'),
        makeRatingDoc('mem-4', 2, 'Memory_users_u1'),
      ]);
      mockFetchMemory.mockImplementation(async (_col, id) => ({
        uuid: id,
        properties: { title: `Title ${id}` },
      } as any));

      const result = await service.byMyRatings({ userId: 'user1', offset: 2, limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].memory.id).toBe('mem-3');
      expect(result.items[1].memory.id).toBe('mem-4');
      expect(result.total).toBe(4);
      expect(result.offset).toBe(2);
      expect(result.limit).toBe(2);
    });
  });

  describe('byMyRatings() scope filtering', () => {
    function makeRatingDoc(memoryId: string, rating: number, collectionName: string) {
      return {
        id: memoryId,
        data: { memoryId, rating, collectionName, updated_at: '2026-03-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      };
    }

    it('no spaces/groups: returns all rated memories', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        makeRatingDoc('mem-1', 5, 'Memory_users_u1'),
        makeRatingDoc('mem-2', 4, 'Memory_spaces_poetry'),
      ]);
      mockFetchMemory.mockImplementation(async (_col, id) => ({
        uuid: id,
        properties: {},
      } as any));

      const result = await service.byMyRatings({ userId: 'user1' });
      expect(result.items).toHaveLength(2);
    });

    it('single space: returns only memories in that space', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        makeRatingDoc('mem-1', 5, 'Memory_users_u1'),
        makeRatingDoc('mem-2', 4, 'Memory_spaces_poetry'),
        makeRatingDoc('mem-3', 3, 'Memory_spaces_music'),
      ]);
      mockFetchMemory.mockImplementation(async (_col, id) => ({
        uuid: id,
        properties: {},
      } as any));

      const result = await service.byMyRatings({ userId: 'user1', spaces: ['Memory_spaces_poetry'] });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].memory.id).toBe('mem-2');
    });

    it('single group: returns only memories in that group', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        makeRatingDoc('mem-1', 5, 'Memory_groups_family'),
        makeRatingDoc('mem-2', 4, 'Memory_users_u1'),
      ]);
      mockFetchMemory.mockImplementation(async (_col, id) => ({
        uuid: id,
        properties: {},
      } as any));

      const result = await service.byMyRatings({ userId: 'user1', groups: ['Memory_groups_family'] });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].memory.id).toBe('mem-1');
    });

    it('multiple spaces + groups: returns union', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        makeRatingDoc('mem-1', 5, 'Memory_spaces_poetry'),
        makeRatingDoc('mem-2', 4, 'Memory_groups_family'),
        makeRatingDoc('mem-3', 3, 'Memory_users_u1'),
      ]);
      mockFetchMemory.mockImplementation(async (_col, id) => ({
        uuid: id,
        properties: {},
      } as any));

      const result = await service.byMyRatings({
        userId: 'user1',
        spaces: ['Memory_spaces_poetry'],
        groups: ['Memory_groups_family'],
      });
      expect(result.items).toHaveLength(2);
    });
  });

  describe('byMyRatings() star filter', () => {
    function makeRatingDoc(memoryId: string, rating: number) {
      return {
        id: memoryId,
        data: { memoryId, rating, collectionName: 'Memory_users_u1', updated_at: '2026-03-01T00:00:00Z' },
      };
    }

    it('min:5 max:5 returns only 5-star rated', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        makeRatingDoc('mem-1', 5),
        makeRatingDoc('mem-2', 4),
        makeRatingDoc('mem-3', 5),
      ]);
      mockFetchMemory.mockImplementation(async (_col, id) => ({
        uuid: id,
        properties: {},
      } as any));

      const result = await service.byMyRatings({ userId: 'user1', rating_filter: { min: 5, max: 5 } });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('min:1 max:2 returns only 1-2 star rated', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        makeRatingDoc('mem-1', 1),
        makeRatingDoc('mem-2', 2),
        makeRatingDoc('mem-3', 3),
        makeRatingDoc('mem-4', 5),
      ]);
      mockFetchMemory.mockImplementation(async (_col, id) => ({
        uuid: id,
        properties: {},
      } as any));

      const result = await service.byMyRatings({ userId: 'user1', rating_filter: { min: 1, max: 2 } });
      expect(result.items).toHaveLength(2);
    });

    it('min:3 max:5 returns 3-5 star range', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        makeRatingDoc('mem-1', 1),
        makeRatingDoc('mem-2', 3),
        makeRatingDoc('mem-3', 4),
        makeRatingDoc('mem-4', 5),
      ]);
      mockFetchMemory.mockImplementation(async (_col, id) => ({
        uuid: id,
        properties: {},
      } as any));

      const result = await service.byMyRatings({ userId: 'user1', rating_filter: { min: 3, max: 5 } });
      expect(result.items).toHaveLength(3);
    });

    it('no filter returns all ratings', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        makeRatingDoc('mem-1', 1),
        makeRatingDoc('mem-2', 3),
        makeRatingDoc('mem-3', 5),
      ]);
      mockFetchMemory.mockImplementation(async (_col, id) => ({
        uuid: id,
        properties: {},
      } as any));

      const result = await service.byMyRatings({ userId: 'user1' });
      expect(result.items).toHaveLength(3);
    });
  });

  describe('byMyRatings() search mode', () => {
    it('returns only rated memories matching query', async () => {
      const { client, hybrid } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        {
          id: 'mem-1',
          data: { memoryId: 'mem-1', rating: 5, collectionName: 'Memory_users_u1', updated_at: '2026-03-01T00:00:00Z' },
        },
        {
          id: 'mem-2',
          data: { memoryId: 'mem-2', rating: 4, collectionName: 'Memory_users_u1', updated_at: '2026-02-01T00:00:00Z' },
        },
      ]);

      // Hybrid search returns mem-1 and an unrated mem-3
      hybrid.mockResolvedValue({
        objects: [
          { uuid: 'mem-1', properties: { title: 'Poem about love' } },
          { uuid: 'mem-3', properties: { title: 'Unrated poem' } },
        ],
      });

      const result = await service.byMyRatings({ userId: 'user1', query: 'love poem' });

      // Only mem-1 should be in results (intersection of rated + search)
      expect(result.items).toHaveLength(1);
      expect(result.items[0].memory.id).toBe('mem-1');
      expect(result.items[0].metadata.my_rating).toBe(5);
    });

    it('merges results from multiple collections', async () => {
      const mockHybrid1 = jest.fn().mockResolvedValue({
        objects: [{ uuid: 'mem-1', properties: { title: 'Space poem' } }],
      });
      const mockHybrid2 = jest.fn().mockResolvedValue({
        objects: [{ uuid: 'mem-2', properties: { title: 'Personal poem' } }],
      });

      const client = {
        collections: {
          get: jest.fn().mockImplementation((name: string) => ({
            data: { update: jest.fn() },
            query: {
              hybrid: name === 'Memory_spaces_poetry' ? mockHybrid1 : mockHybrid2,
            },
          })),
        },
      } as any;

      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([
        {
          id: 'mem-1',
          data: { memoryId: 'mem-1', rating: 5, collectionName: 'Memory_spaces_poetry', updated_at: '2026-03-01T00:00:00Z' },
        },
        {
          id: 'mem-2',
          data: { memoryId: 'mem-2', rating: 4, collectionName: 'Memory_users_u1', updated_at: '2026-02-01T00:00:00Z' },
        },
      ]);

      const result = await service.byMyRatings({ userId: 'user1', query: 'poem' });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('user with 0 ratings + search query returns empty', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([]);

      const result = await service.byMyRatings({ userId: 'user1', query: 'something' });

      expect(result).toEqual({ items: [], total: 0, offset: 0, limit: 50 });
    });
  });

  describe('byMyRatings() edge cases', () => {
    it('unavailable memory returns stub with unavailable: true', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([{
        id: 'mem-1',
        data: { memoryId: 'mem-1', rating: 4, collectionName: 'Memory_users_u1', updated_at: '2026-03-01T00:00:00Z' },
      }]);
      mockFetchMemory.mockResolvedValue(null);

      const result = await service.byMyRatings({ userId: 'user1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].memory).toEqual({ id: 'mem-1' });
      expect(result.items[0].metadata.unavailable).toBe(true);
      expect(result.items[0].metadata.my_rating).toBe(4);
    });

    it('deleted memory returns with deleted: true in metadata', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([{
        id: 'mem-1',
        data: { memoryId: 'mem-1', rating: 3, collectionName: 'Memory_users_u1', updated_at: '2026-03-01T00:00:00Z' },
      }]);
      mockFetchMemory.mockResolvedValue({
        uuid: 'mem-1',
        properties: { title: 'Deleted memory', deleted_at: '2026-03-05T00:00:00Z' },
      } as any);

      const result = await service.byMyRatings({ userId: 'user1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].metadata.deleted).toBe(true);
      expect(result.items[0].metadata.my_rating).toBe(3);
      expect(result.items[0].memory.title).toBe('Deleted memory');
    });

    it('rating doc missing collectionName uses fallback lookup', async () => {
      const { client } = createMockWeaviateClient();
      const memoryIndex = createMockMemoryIndexService('Memory_users_u1');
      const service = new RatingService({ weaviateClient: client, memoryIndexService: memoryIndex, logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([{
        id: 'mem-1',
        data: { memoryId: 'mem-1', rating: 5, updated_at: '2026-03-01T00:00:00Z' },
        // Note: no collectionName
      }]);
      mockFetchMemory.mockResolvedValue({
        uuid: 'mem-1',
        properties: { title: 'Found via fallback' },
      } as any);

      const result = await service.byMyRatings({ userId: 'user1' });

      expect(memoryIndex.lookup).toHaveBeenCalledWith('mem-1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].memory.title).toBe('Found via fallback');
    });

    it('rating doc missing collectionName + failed lookup returns unavailable', async () => {
      const { client } = createMockWeaviateClient();
      const memoryIndex = createMockMemoryIndexService(null);
      const service = new RatingService({ weaviateClient: client, memoryIndexService: memoryIndex, logger: createMockLogger() });

      mockQueryDocuments.mockResolvedValue([{
        id: 'mem-1',
        data: { memoryId: 'mem-1', rating: 5, updated_at: '2026-03-01T00:00:00Z' },
      }]);

      const result = await service.byMyRatings({ userId: 'user1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].metadata.unavailable).toBe(true);
    });
  });

  describe('aggregate math helpers', () => {
    it('computeBayesianScore with no ratings returns 3.0', () => {
      expect(computeBayesianScore(0, 0)).toBe(3.0);
    });

    it('computeBayesianScore with sum=20, count=5 returns (20+15)/(5+5)=3.5', () => {
      expect(computeBayesianScore(20, 5)).toBe(3.5);
    });

    it('computeRatingAvg returns null below threshold', () => {
      expect(computeRatingAvg(10, 4)).toBeNull();
    });

    it('computeRatingAvg returns average at threshold', () => {
      expect(computeRatingAvg(20, 5)).toBe(4.0);
    });
  });
});
