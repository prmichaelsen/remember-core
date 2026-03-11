/**
 * Tests for RatingService.getBulkRatingActivity()
 * Task 501 - Rating Activity SDK Method
 */

import { RatingService } from '../rating.service.js';

// Mock Firestore helpers
jest.mock('../../database/firestore/init.js', () => ({
  getDocument: jest.fn(),
  setDocument: jest.fn(),
  deleteDocument: jest.fn(),
  queryDocuments: jest.fn(),
}));

// Mock fetchMemoryWithAllProperties
jest.mock('../../database/weaviate/client.js', () => ({
  fetchMemoryWithAllProperties: jest.fn(),
}));

import { queryDocuments } from '../../database/firestore/init.js';
import { fetchMemoryWithAllProperties } from '../../database/weaviate/client.js';

const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockFetchMemory = fetchMemoryWithAllProperties as jest.MockedFunction<typeof fetchMemoryWithAllProperties>;

function createMockWeaviateClient() {
  const mockCollection = {
    data: { update: jest.fn() },
    query: { hybrid: jest.fn(), fetchObjectById: jest.fn() },
  };
  return {
    client: {
      collections: {
        get: jest.fn().mockReturnValue(mockCollection),
      },
    } as any,
    collection: mockCollection,
  };
}

function createMockMemoryIndexService(collectionName: string | null = 'Memory_user_owner-1') {
  return {
    lookup: jest.fn().mockResolvedValue(collectionName),
    index: jest.fn(),
    collectionPath: 'test',
  } as any;
}

function createMockLogger() {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('RatingService.getBulkRatingActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty map for empty input', async () => {
    const { client } = createMockWeaviateClient();
    const memoryIndex = createMockMemoryIndexService();
    const service = new RatingService({
      weaviateClient: client,
      memoryIndexService: memoryIndex,
      logger: createMockLogger(),
    });

    const result = await service.getBulkRatingActivity([], 'owner-1');

    expect(result.size).toBe(0);
  });

  it('should return null for users with no ratings', async () => {
    const { client } = createMockWeaviateClient();
    const memoryIndex = createMockMemoryIndexService();
    const service = new RatingService({
      weaviateClient: client,
      memoryIndexService: memoryIndex,
      logger: createMockLogger(),
    });

    // Mock queryDocuments to return no ratings
    mockQueryDocuments.mockResolvedValue([]);

    const result = await service.getBulkRatingActivity(['user-a', 'user-b'], 'owner-1');

    expect(result.size).toBe(2);
    expect(result.get('user-a')).toEqual({ last_rated_at: null });
    expect(result.get('user-b')).toEqual({ last_rated_at: null });
  });

  it('should return correct timestamp for users who rated owner\'s memories', async () => {
    const { client } = createMockWeaviateClient();
    const memoryIndex = createMockMemoryIndexService();
    const service = new RatingService({
      weaviateClient: client,
      memoryIndexService: memoryIndex,
      logger: createMockLogger(),
    });

    // Mock rating documents for rater-1
    mockQueryDocuments.mockResolvedValue([
      {
        id: 'mem-1',
        data: {
          memoryId: 'mem-1',
          collectionName: 'Memory_user_owner-1',
          rating: 5,
          updated_at: '2026-03-10T10:00:00.000Z',
        },
      },
    ] as any);

    // Mock memory fetch to return owner-1 as the owner
    mockFetchMemory.mockResolvedValue({
      properties: { user_id: 'owner-1', content: 'test' },
    } as any);

    const result = await service.getBulkRatingActivity(['rater-1'], 'owner-1');

    expect(result.size).toBe(1);
    expect(result.get('rater-1')).toEqual({ last_rated_at: '2026-03-10T10:00:00.000Z' });
  });

  it('should ignore ratings on other users\' memories', async () => {
    const { client } = createMockWeaviateClient();
    const memoryIndex = createMockMemoryIndexService();
    const service = new RatingService({
      weaviateClient: client,
      memoryIndexService: memoryIndex,
      logger: createMockLogger(),
    });

    // Mock rating documents - more recent rating on different owner's memory, older on target
    mockQueryDocuments.mockResolvedValue([
      {
        id: 'mem-2',
        data: {
          memoryId: 'mem-2',
          collectionName: 'Memory_user_owner-2',
          rating: 4,
          updated_at: '2026-03-11T00:00:00.000Z',
        },
      },
      {
        id: 'mem-1',
        data: {
          memoryId: 'mem-1',
          collectionName: 'Memory_user_owner-1',
          rating: 5,
          updated_at: '2026-03-10T00:00:00.000Z',
        },
      },
    ] as any);

    // Mock memory fetch to return different owners
    mockFetchMemory.mockImplementation(async (collection: any, memoryId: string) => {
      if (memoryId === 'mem-1') {
        return { properties: { user_id: 'owner-1', content: 'test1' } } as any;
      }
      return { properties: { user_id: 'owner-2', content: 'test2' } } as any;
    });

    const result = await service.getBulkRatingActivity(['rater-1'], 'owner-1');

    expect(result.size).toBe(1);
    // Should return the older rating on owner-1's memory, not the newer one on owner-2's
    expect(result.get('rater-1')).toEqual({ last_rated_at: '2026-03-10T00:00:00.000Z' });
  });

  it('should handle large friend lists', async () => {
    const { client } = createMockWeaviateClient();
    const memoryIndex = createMockMemoryIndexService();
    const service = new RatingService({
      weaviateClient: client,
      memoryIndexService: memoryIndex,
      logger: createMockLogger(),
    });

    // Mock queryDocuments to return no ratings for all users
    mockQueryDocuments.mockResolvedValue([]);

    const raterIds: string[] = [];
    for (let i = 0; i < 100; i++) {
      raterIds.push(`rater-${i}`);
    }

    const result = await service.getBulkRatingActivity(raterIds, 'owner-1');

    expect(result.size).toBe(100);
    for (const raterId of raterIds) {
      expect(result.get(raterId)).toEqual({ last_rated_at: null });
    }
  });

  it('should order by most recent correctly', async () => {
    const { client } = createMockWeaviateClient();
    const memoryIndex = createMockMemoryIndexService();
    const service = new RatingService({
      weaviateClient: client,
      memoryIndexService: memoryIndex,
      logger: createMockLogger(),
    });

    // Mock rating documents - already ordered by updated_at DESC from Firestore
    mockQueryDocuments.mockResolvedValue([
      {
        id: 'mem-2',
        data: {
          memoryId: 'mem-2',
          collectionName: 'Memory_user_owner-1',
          rating: 5,
          updated_at: '2026-03-11T00:00:00.000Z', // More recent
        },
      },
      {
        id: 'mem-1',
        data: {
          memoryId: 'mem-1',
          collectionName: 'Memory_user_owner-1',
          rating: 4,
          updated_at: '2026-03-10T00:00:00.000Z', // Older
        },
      },
    ] as any);

    // Mock memory fetch to return owner-1 for all memories
    mockFetchMemory.mockResolvedValue({
      properties: { user_id: 'owner-1', content: 'test' },
    } as any);

    const result = await service.getBulkRatingActivity(['rater-1'], 'owner-1');

    expect(result.size).toBe(1);
    // Should return the most recent rating timestamp
    expect(result.get('rater-1')).toEqual({ last_rated_at: '2026-03-11T00:00:00.000Z' });
  });
});
