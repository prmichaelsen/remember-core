import { RecommendationService, MIN_PROFILE_SIZE, NEGATIVE_WEIGHT, VECTOR_FETCH_CAP, MIN_SIMILARITY } from './recommendation.service.js';

// Mock Firestore helpers
jest.mock('../database/firestore/init.js', () => ({
  getDocument: jest.fn(),
  setDocument: jest.fn(),
  deleteDocument: jest.fn(),
  queryDocuments: jest.fn(),
}));

import { getDocument, setDocument, deleteDocument, queryDocuments } from '../database/firestore/init.js';

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockSetDocument = setDocument as jest.MockedFunction<typeof setDocument>;
const mockDeleteDocument = deleteDocument as jest.MockedFunction<typeof deleteDocument>;
const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;

function createMockMemoryIndexService(mappings: Record<string, string> = {}) {
  return {
    lookup: jest.fn().mockImplementation((id: string) => Promise.resolve(mappings[id] ?? null)),
    index: jest.fn(),
  } as any;
}

function createMockLogger() {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function createMockWeaviateClient(collections: Record<string, { objects: any[] }> = {}) {
  return {
    collections: {
      get(name: string) {
        const col = collections[name] ?? { objects: [] };
        return {
          query: {
            fetchObjectById: jest.fn().mockImplementation((id: string, opts?: any) => {
              const obj = col.objects.find((o: any) => o.uuid === id);
              if (!obj) return null;
              if (opts?.includeVector && obj.vector) {
                return { ...obj, vectors: { default: obj.vector } };
              }
              return obj;
            }),
          },
        };
      },
    },
  } as any;
}

describe('RecommendationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Vector Arithmetic ──────────────────────────────────────────────

  describe('averageVectors', () => {
    let service: RecommendationService;

    beforeEach(() => {
      service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });
    });

    it('returns empty array for empty input', () => {
      expect(service.averageVectors([])).toEqual([]);
    });

    it('returns copy of single vector', () => {
      const v = [1, 2, 3];
      const result = service.averageVectors([v]);
      expect(result).toEqual([1, 2, 3]);
      // Should be a copy
      expect(result).not.toBe(v);
    });

    it('averages two vectors', () => {
      const result = service.averageVectors([
        [1, 0, 0],
        [0, 1, 0],
      ]);
      expect(result).toEqual([0.5, 0.5, 0]);
    });

    it('averages ten vectors', () => {
      const vecs = Array.from({ length: 10 }, (_, i) => {
        const v = new Array(3).fill(0);
        v[i % 3] = 1;
        return v;
      });
      const result = service.averageVectors(vecs);
      // Each dimension: 4 vectors contribute 1, 3 contribute 1, 3 contribute 1 → 4/10, 3/10, 3/10
      expect(result[0]).toBeCloseTo(0.4);
      expect(result[1]).toBeCloseTo(0.3);
      expect(result[2]).toBeCloseTo(0.3);
    });

    it('averages 100 identical vectors correctly', () => {
      const vecs = Array.from({ length: 100 }, () => [0.5, 0.5, 0.5]);
      const result = service.averageVectors(vecs);
      expect(result).toEqual([0.5, 0.5, 0.5]);
    });
  });

  describe('subtractWeighted', () => {
    let service: RecommendationService;

    beforeEach(() => {
      service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });
    });

    it('subtracts negative centroid with weight', () => {
      const result = service.subtractWeighted([1, 0, 0], [0, 1, 0], 0.3);
      // result[0] = 1, result[1] = -0.3, result[2] = 0
      // norm = sqrt(1 + 0.09) = sqrt(1.09)
      const norm = Math.sqrt(1 + 0.09);
      expect(result[0]).toBeCloseTo(1 / norm);
      expect(result[1]).toBeCloseTo(-0.3 / norm);
      expect(result[2]).toBeCloseTo(0);
    });

    it('normalizes result to unit length', () => {
      const result = service.subtractWeighted([3, 4, 0], [0, 0, 0], 1.0);
      const length = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
      expect(length).toBeCloseTo(1.0);
    });

    it('handles zero weight (no subtraction)', () => {
      const result = service.subtractWeighted([1, 0, 0], [0, 1, 0], 0);
      // Just normalized [1, 0, 0]
      expect(result).toEqual([1, 0, 0]);
    });

    it('handles all-zero result vector', () => {
      const result = service.subtractWeighted([1, 1], [1, 1], 1.0);
      // [0, 0] → norm = 0, no division
      expect(result).toEqual([0, 0]);
    });
  });

  // ── Centroid Computation ───────────────────────────────────────────

  describe('computePreferenceCentroid', () => {
    it('returns insufficientData when fewer than MIN_PROFILE_SIZE high ratings', async () => {
      mockQueryDocuments.mockResolvedValueOnce(
        // Only 3 high ratings (need 5)
        [
          { data: { memoryId: 'm1', rating: 5, created_at: '', updated_at: '' } },
          { data: { memoryId: 'm2', rating: 4, created_at: '', updated_at: '' } },
          { data: { memoryId: 'm3', rating: 5, created_at: '', updated_at: '' } },
        ] as any,
      );

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      const result = await service.computePreferenceCentroid('user1');
      expect(result.insufficientData).toBe(true);
      expect(result.centroid).toBeNull();
    });

    it('returns insufficientData when exactly 4 high ratings (boundary)', async () => {
      mockQueryDocuments.mockResolvedValueOnce(
        Array.from({ length: 4 }, (_, i) => ({
          data: { memoryId: `m${i}`, rating: 5, created_at: '', updated_at: '' },
        })) as any,
      );

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      const result = await service.computePreferenceCentroid('user1');
      expect(result.insufficientData).toBe(true);
    });

    it('computes centroid with exactly MIN_PROFILE_SIZE high ratings', async () => {
      const memIds = Array.from({ length: MIN_PROFILE_SIZE }, (_, i) => `m${i}`);
      const mappings: Record<string, string> = {};
      const objects: any[] = [];
      memIds.forEach((id) => {
        mappings[id] = 'col1';
        objects.push({ uuid: id, properties: {}, vector: [1, 0, 0] });
      });

      mockQueryDocuments
        .mockResolvedValueOnce(
          // High ratings
          memIds.map((id) => ({
            data: { memoryId: id, rating: 5, created_at: '', updated_at: '' },
          })) as any,
        )
        .mockResolvedValueOnce([] as any); // No low ratings

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient({ col1: { objects } }),
        memoryIndexService: createMockMemoryIndexService(mappings),
        logger: createMockLogger(),
      });

      const result = await service.computePreferenceCentroid('user1');
      expect(result.insufficientData).toBe(false);
      expect(result.centroid).not.toBeNull();
      expect(result.centroid!.profileSize).toBe(MIN_PROFILE_SIZE);
      expect(result.centroid!.vector).toEqual([1, 0, 0]);
    });

    it('applies negative signal subtraction when low ratings exist', async () => {
      const highIds = Array.from({ length: MIN_PROFILE_SIZE }, (_, i) => `h${i}`);
      const lowIds = ['l1', 'l2'];
      const mappings: Record<string, string> = {};
      const objects: any[] = [];

      highIds.forEach((id) => {
        mappings[id] = 'col1';
        objects.push({ uuid: id, properties: {}, vector: [1, 0, 0] });
      });
      lowIds.forEach((id) => {
        mappings[id] = 'col1';
        objects.push({ uuid: id, properties: {}, vector: [0, 1, 0] });
      });

      mockQueryDocuments
        .mockResolvedValueOnce(
          highIds.map((id) => ({
            data: { memoryId: id, rating: 5, created_at: '', updated_at: '' },
          })) as any,
        )
        .mockResolvedValueOnce(
          lowIds.map((id) => ({
            data: { memoryId: id, rating: 1, created_at: '', updated_at: '' },
          })) as any,
        );

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient({ col1: { objects } }),
        memoryIndexService: createMockMemoryIndexService(mappings),
        logger: createMockLogger(),
      });

      const result = await service.computePreferenceCentroid('user1');
      expect(result.insufficientData).toBe(false);
      expect(result.centroid).not.toBeNull();
      // Positive centroid = [1, 0, 0], negative = [0, 1, 0]
      // subtracted = [1, -0.3, 0] → normalized
      expect(result.centroid!.vector[0]).toBeGreaterThan(0);
      expect(result.centroid!.vector[1]).toBeLessThan(0);
    });

    it('handles cross-collection embedding fetch', async () => {
      const mappings: Record<string, string> = {
        m1: 'col_A',
        m2: 'col_A',
        m3: 'col_B',
        m4: 'col_B',
        m5: 'col_B',
      };

      const objectsA = [
        { uuid: 'm1', properties: {}, vector: [1, 0, 0] },
        { uuid: 'm2', properties: {}, vector: [1, 0, 0] },
      ];
      const objectsB = [
        { uuid: 'm3', properties: {}, vector: [0, 1, 0] },
        { uuid: 'm4', properties: {}, vector: [0, 1, 0] },
        { uuid: 'm5', properties: {}, vector: [0, 1, 0] },
      ];

      mockQueryDocuments
        .mockResolvedValueOnce(
          ['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => ({
            data: { memoryId: id, rating: 5, created_at: '', updated_at: '' },
          })) as any,
        )
        .mockResolvedValueOnce([] as any);

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient({ col_A: { objects: objectsA }, col_B: { objects: objectsB } }),
        memoryIndexService: createMockMemoryIndexService(mappings),
        logger: createMockLogger(),
      });

      const result = await service.computePreferenceCentroid('user1');
      expect(result.centroid).not.toBeNull();
      // 2 vectors [1,0,0] + 3 vectors [0,1,0] → avg = [0.4, 0.6, 0]
      expect(result.centroid!.vector[0]).toBeCloseTo(0.4);
      expect(result.centroid!.vector[1]).toBeCloseTo(0.6);
    });

    it('returns insufficientData when no embeddings can be fetched', async () => {
      // 5 high ratings but all map to unknown collections
      mockQueryDocuments
        .mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => ({
            data: { memoryId: `m${i}`, rating: 5, created_at: '', updated_at: '' },
          })) as any,
        )
        .mockResolvedValueOnce([] as any);

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService({}), // no mappings
        logger: createMockLogger(),
      });

      const result = await service.computePreferenceCentroid('user1');
      expect(result.insufficientData).toBe(true);
      expect(result.centroid).toBeNull();
    });

    it('handles user with only negative ratings (no high ratings)', async () => {
      mockQueryDocuments.mockResolvedValueOnce([] as any); // no high ratings

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      const result = await service.computePreferenceCentroid('user1');
      expect(result.insufficientData).toBe(true);
      expect(result.centroid).toBeNull();
    });
  });

  // ── Centroid Caching ───────────────────────────────────────────────

  describe('centroid caching', () => {
    it('getCachedCentroid returns null on cache miss', async () => {
      mockGetDocument.mockResolvedValue(null);

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      const result = await service.getCachedCentroid('user1');
      expect(result).toBeNull();
    });

    it('getCachedCentroid returns centroid on cache hit', async () => {
      mockGetDocument.mockResolvedValue({
        centroid: [0.5, 0.5, 0],
        profileSize: 10,
        computedAt: '2026-01-01T00:00:00.000Z',
        version: 1,
      } as any);

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      const result = await service.getCachedCentroid('user1');
      expect(result).not.toBeNull();
      expect(result!.vector).toEqual([0.5, 0.5, 0]);
      expect(result!.profileSize).toBe(10);
    });

    it('cacheCentroid writes to Firestore', async () => {
      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      await service.cacheCentroid('user1', { vector: [1, 0, 0], profileSize: 5 });

      expect(mockSetDocument).toHaveBeenCalledWith(
        expect.any(String),
        'user1',
        expect.objectContaining({
          centroid: [1, 0, 0],
          profileSize: 5,
          version: 1,
        }),
      );
    });

    it('invalidateCentroid deletes from Firestore', async () => {
      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      await service.invalidateCentroid('user1');

      expect(mockDeleteDocument).toHaveBeenCalledWith(expect.any(String), 'user1');
    });

    it('getOrComputeCentroid returns cached value on hit', async () => {
      mockGetDocument.mockResolvedValue({
        centroid: [0.5, 0.5, 0],
        profileSize: 8,
        computedAt: '2026-01-01T00:00:00.000Z',
        version: 1,
      } as any);

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      const result = await service.getOrComputeCentroid('user1');
      expect(result.insufficientData).toBe(false);
      expect(result.centroid!.vector).toEqual([0.5, 0.5, 0]);
      // Should NOT call queryDocuments (no computation)
      expect(mockQueryDocuments).not.toHaveBeenCalled();
    });

    it('getOrComputeCentroid computes and caches on miss', async () => {
      // Cache miss
      mockGetDocument.mockResolvedValue(null);

      // Sufficient high ratings
      const memIds = Array.from({ length: MIN_PROFILE_SIZE }, (_, i) => `m${i}`);
      const mappings: Record<string, string> = {};
      const objects: any[] = [];
      memIds.forEach((id) => {
        mappings[id] = 'col1';
        objects.push({ uuid: id, properties: {}, vector: [1, 0, 0] });
      });

      mockQueryDocuments
        .mockResolvedValueOnce(
          memIds.map((id) => ({
            data: { memoryId: id, rating: 5, created_at: '', updated_at: '' },
          })) as any,
        )
        .mockResolvedValueOnce([] as any);

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient({ col1: { objects } }),
        memoryIndexService: createMockMemoryIndexService(mappings),
        logger: createMockLogger(),
      });

      const result = await service.getOrComputeCentroid('user1');
      expect(result.insufficientData).toBe(false);
      expect(result.centroid).not.toBeNull();
      // Should cache the result
      expect(mockSetDocument).toHaveBeenCalled();
    });
  });

  // ── User Rating Queries ────────────────────────────────────────────

  describe('getUserHighRatings', () => {
    it('queries with rating >= 4 filter', async () => {
      mockQueryDocuments.mockResolvedValue([
        { data: { memoryId: 'm1', rating: 5, created_at: '', updated_at: '' } },
      ] as any);

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      const results = await service.getUserHighRatings('user1');
      expect(mockQueryDocuments).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          where: [{ field: 'rating', op: '>=', value: 4 }],
        }),
      );
      expect(results).toHaveLength(1);
    });

    it('respects custom limit', async () => {
      mockQueryDocuments.mockResolvedValue([] as any);

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      await service.getUserHighRatings('user1', { limit: 10 });
      expect(mockQueryDocuments).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('defaults to VECTOR_FETCH_CAP limit', async () => {
      mockQueryDocuments.mockResolvedValue([] as any);

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      await service.getUserHighRatings('user1');
      expect(mockQueryDocuments).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ limit: VECTOR_FETCH_CAP }),
      );
    });
  });

  describe('getUserLowRatings', () => {
    it('queries with rating <= 2 filter', async () => {
      mockQueryDocuments.mockResolvedValue([] as any);

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      await service.getUserLowRatings('user1');
      expect(mockQueryDocuments).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          where: [{ field: 'rating', op: '<=', value: 2 }],
        }),
      );
    });
  });

  describe('getAllUserRatedIds', () => {
    it('returns all rated memory IDs', async () => {
      mockQueryDocuments.mockResolvedValue([
        { data: { memoryId: 'm1', rating: 5 } },
        { data: { memoryId: 'm2', rating: 2 } },
        { data: { memoryId: 'm3', rating: 3 } },
      ] as any);

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      const ids = await service.getAllUserRatedIds('user1');
      expect(ids).toEqual(['m1', 'm2', 'm3']);
    });
  });

  // ── Cache Invalidation Policy ─────────────────────────────────────

  describe('cache invalidation policy', () => {
    it('invalidateCentroid deletes cached entry for a user', async () => {
      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      await service.invalidateCentroid('user1');
      expect(mockDeleteDocument).toHaveBeenCalledTimes(1);
      expect(mockDeleteDocument).toHaveBeenCalledWith(expect.any(String), 'user1');
    });

    it('getOrComputeCentroid does not call invalidate (caller responsibility)', async () => {
      // Cache hit scenario — service never self-invalidates
      mockGetDocument.mockResolvedValue({
        centroid: [0.5, 0.5, 0],
        profileSize: 10,
        computedAt: '2026-01-01T00:00:00.000Z',
        version: 1,
      } as any);

      const service = new RecommendationService({
        weaviateClient: createMockWeaviateClient(),
        memoryIndexService: createMockMemoryIndexService(),
        logger: createMockLogger(),
      });

      await service.getOrComputeCentroid('user1');
      expect(mockDeleteDocument).not.toHaveBeenCalled();
    });
  });

  // ── Constants ──────────────────────────────────────────────────────

  describe('constants', () => {
    it('MIN_PROFILE_SIZE is 5', () => {
      expect(MIN_PROFILE_SIZE).toBe(5);
    });

    it('NEGATIVE_WEIGHT is 0.3', () => {
      expect(NEGATIVE_WEIGHT).toBe(0.3);
    });

    it('VECTOR_FETCH_CAP is 500', () => {
      expect(VECTOR_FETCH_CAP).toBe(500);
    });

    it('MIN_SIMILARITY is 0.3', () => {
      expect(MIN_SIMILARITY).toBe(0.3);
    });
  });
});
