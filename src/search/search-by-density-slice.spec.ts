import { searchByDensitySlice, DensitySliceMemoryService } from './search-by-density-slice.js';
import { DENSITY_BUCKET_COUNT } from './density-slices.js';
import type { SearchMemoryInput, SearchMemoryResult, DensityModeRequest, DensityModeResult } from '../services/memory.service.js';

function createMockService(): {
  service: DensitySliceMemoryService;
  searchCalls: SearchMemoryInput[];
  byDensityCalls: DensityModeRequest[];
} {
  const searchCalls: SearchMemoryInput[] = [];
  const byDensityCalls: DensityModeRequest[] = [];
  let searchCounter = 0;

  const service: DensitySliceMemoryService = {
    search: jest.fn(async (input: SearchMemoryInput): Promise<SearchMemoryResult> => {
      searchCalls.push(input);
      searchCounter++;
      const memory = {
        id: `mem-${searchCounter}`,
        content: `Memory ${searchCounter}`,
        doc_type: 'memory',
        relationship_count: input.filters?.relationship_count_min ?? 0,
      };
      return {
        memories: [memory],
        relationships: undefined,
        total: 1,
        offset: 0,
        limit: input.limit ?? 10,
      };
    }),
    byDensity: jest.fn(async (input: DensityModeRequest): Promise<DensityModeResult> => {
      byDensityCalls.push(input);
      return {
        memories: [{
          id: 'densest-mem',
          content: 'Most connected memory',
          doc_type: 'memory',
          relationship_count: 25,
        }],
        total: 1,
        offset: 0,
        limit: 1,
      };
    }),
  };

  return { service, searchCalls, byDensityCalls };
}

describe('searchByDensitySlice', () => {
  describe('desc direction', () => {
    it('fires 9 parallel search calls with graded density boundaries', async () => {
      const { service, searchCalls, byDensityCalls } = createMockService();

      await searchByDensitySlice(service, 'vacation', {
        limit: 10,
        offset: 0,
        direction: 'desc',
      });

      expect(searchCalls).toHaveLength(DENSITY_BUCKET_COUNT);
      expect(byDensityCalls).toHaveLength(0); // desc does NOT call byDensity

      // Every search call should have the query and relationship_count_min in filters
      searchCalls.forEach((call) => {
        expect(call.query).toBe('vacation');
        expect(call.filters?.relationship_count_min).toBeDefined();
      });

      // First bucket (50+) should NOT have relationship_count_max
      expect(searchCalls[0].filters?.relationship_count_max).toBeUndefined();

      // Last bucket (0-0) should have both min and max
      expect(searchCalls[8].filters?.relationship_count_min).toBe(0);
      expect(searchCalls[8].filters?.relationship_count_max).toBe(0);
    });

    it('does not call byDensity', async () => {
      const { service, byDensityCalls } = createMockService();

      await searchByDensitySlice(service, 'query', {
        limit: 10,
        offset: 0,
        direction: 'desc',
      });

      expect(byDensityCalls).toHaveLength(0);
    });
  });

  describe('asc direction', () => {
    it('calls byDensity(limit:1) then fires parallel searches with even boundaries', async () => {
      const { service, searchCalls, byDensityCalls } = createMockService();

      await searchByDensitySlice(service, 'vacation', {
        limit: 10,
        offset: 0,
        direction: 'asc',
      });

      expect(byDensityCalls).toHaveLength(1);
      expect(byDensityCalls[0]).toEqual({ limit: 1 });
      expect(searchCalls.length).toBeGreaterThan(0);

      // All search calls should have relationship_count_min and relationship_count_max
      searchCalls.forEach((call) => {
        expect(call.filters?.relationship_count_min).toBeDefined();
        expect(call.filters?.relationship_count_max).toBeDefined();
      });
    });

    it('returns empty result when byDensity returns no memories', async () => {
      const service: DensitySliceMemoryService = {
        search: jest.fn(),
        byDensity: jest.fn(async (): Promise<DensityModeResult> => ({
          memories: [],
          total: 0,
          offset: 0,
          limit: 1,
        })),
      };

      const result = await searchByDensitySlice(service, 'query', {
        limit: 10,
        offset: 0,
        direction: 'asc',
      });

      expect(result).toEqual({ memories: [], total: 0 });
      expect(service.search).not.toHaveBeenCalled();
    });
  });

  describe('pagination', () => {
    it('applies offset and limit to aggregated results', async () => {
      const { service } = createMockService();

      // Each bucket returns 1 memory → 9 total
      const result = await searchByDensitySlice(service, 'query', {
        limit: 3,
        offset: 5,
        direction: 'desc',
      });

      // Should get memories 6, 7, 8 (0-indexed: 5, 6, 7)
      expect(result.memories).toHaveLength(3);
      expect(result.total).toBe(9); // sum of per-bucket totals
    });

    it('returns fewer results when offset exceeds available', async () => {
      const { service } = createMockService();

      const result = await searchByDensitySlice(service, 'query', {
        limit: 10,
        offset: 7,
        direction: 'desc',
      });

      // Only 2 memories left after offset 7 (9 total)
      expect(result.memories).toHaveLength(2);
    });
  });

  describe('filters pass-through', () => {
    it('includes custom filters in every bucket search call', async () => {
      const { service, searchCalls } = createMockService();

      await searchByDensitySlice(service, 'query', {
        limit: 10,
        offset: 0,
        direction: 'desc',
        filters: { types: ['note' as any], tags: ['important'] },
      });

      searchCalls.forEach((call) => {
        expect(call.filters?.types).toEqual(['note']);
        expect(call.filters?.tags).toEqual(['important']);
      });
    });
  });

  describe('per-bucket limit', () => {
    it('uses Math.max(ceil(limit/3), 5) as per-bucket limit', async () => {
      const { service, searchCalls } = createMockService();

      // limit = 30 → perBucketLimit = ceil(30/3) = 10
      await searchByDensitySlice(service, 'query', {
        limit: 30,
        offset: 0,
        direction: 'desc',
      });

      searchCalls.forEach((call) => {
        expect(call.limit).toBe(10);
      });
    });

    it('floors per-bucket limit at 5', async () => {
      const { service, searchCalls } = createMockService();

      // limit = 3 → ceil(3/3) = 1, but min is 5
      await searchByDensitySlice(service, 'query', {
        limit: 3,
        offset: 0,
        direction: 'desc',
      });

      searchCalls.forEach((call) => {
        expect(call.limit).toBe(5);
      });
    });
  });
});
