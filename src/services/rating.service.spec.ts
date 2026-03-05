import { RatingService } from './rating.service.js';
import { computeBayesianScore, computeRatingAvg } from '../types/rating.types.js';

// Mock Firestore helpers
jest.mock('../database/firestore/init.js', () => ({
  getDocument: jest.fn(),
  setDocument: jest.fn(),
  deleteDocument: jest.fn(),
}));

// Mock fetchMemoryWithAllProperties
jest.mock('../database/weaviate/client.js', () => ({
  fetchMemoryWithAllProperties: jest.fn(),
}));

import { getDocument, setDocument, deleteDocument } from '../database/firestore/init.js';
import { fetchMemoryWithAllProperties } from '../database/weaviate/client.js';

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockSetDocument = setDocument as jest.MockedFunction<typeof setDocument>;
const mockDeleteDocument = deleteDocument as jest.MockedFunction<typeof deleteDocument>;
const mockFetchMemory = fetchMemoryWithAllProperties as jest.MockedFunction<typeof fetchMemoryWithAllProperties>;

function createMockWeaviateClient() {
  const mockUpdate = jest.fn().mockResolvedValue(undefined);
  const mockCollection = {
    data: { update: mockUpdate },
  };
  return {
    client: {
      collections: {
        get: jest.fn().mockReturnValue(mockCollection),
      },
    } as any,
    collection: mockCollection,
    update: mockUpdate,
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

    it('rejects self-rating', async () => {
      const { client } = createMockWeaviateClient();
      const service = new RatingService({ weaviateClient: client, memoryIndexService: createMockMemoryIndexService(), logger: createMockLogger() });

      mockFetchMemory.mockResolvedValue({
        properties: { user_id: 'rater1', rating_sum: 0, rating_count: 0 },
      } as any);

      await expect(service.rate({ memoryId: 'mem-1', userId: 'rater1', rating: 5 })).rejects.toThrow('Cannot rate your own memory');
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
