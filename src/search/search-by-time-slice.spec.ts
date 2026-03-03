import { searchByTimeSlice, TimeSliceMemoryService } from './search-by-time-slice.js';
import { BUCKET_COUNT } from './time-slices.js';
import type { SearchMemoryInput, SearchMemoryResult, TimeModeRequest, TimeModeResult } from '../services/memory.service.js';

function createMockService(): {
  service: TimeSliceMemoryService;
  searchCalls: SearchMemoryInput[];
  byTimeCalls: TimeModeRequest[];
} {
  const searchCalls: SearchMemoryInput[] = [];
  const byTimeCalls: TimeModeRequest[] = [];
  let searchCounter = 0;

  const service: TimeSliceMemoryService = {
    search: jest.fn(async (input: SearchMemoryInput): Promise<SearchMemoryResult> => {
      searchCalls.push(input);
      searchCounter++;
      const memory = {
        id: `mem-${searchCounter}`,
        content: `Memory ${searchCounter}`,
        doc_type: 'memory',
        created_at: input.filters?.date_to ?? new Date().toISOString(),
      };
      return {
        memories: [memory],
        relationships: undefined,
        total: 1,
        offset: 0,
        limit: input.limit ?? 10,
      };
    }),
    byTime: jest.fn(async (input: TimeModeRequest): Promise<TimeModeResult> => {
      byTimeCalls.push(input);
      return {
        memories: [{
          id: 'oldest-mem',
          content: 'Oldest memory',
          doc_type: 'memory',
          created_at: '2025-01-01T00:00:00.000Z',
        }],
        total: 1,
        offset: 0,
        limit: 1,
      };
    }),
  };

  return { service, searchCalls, byTimeCalls };
}

describe('searchByTimeSlice', () => {
  describe('desc direction', () => {
    it('fires 14 parallel search calls with graded date boundaries', async () => {
      const { service, searchCalls, byTimeCalls } = createMockService();

      await searchByTimeSlice(service, 'vacation', {
        limit: 10,
        offset: 0,
        direction: 'desc',
      });

      expect(searchCalls).toHaveLength(BUCKET_COUNT);
      expect(byTimeCalls).toHaveLength(0); // desc does NOT call byTime

      // Every search call should have the query and date_to in filters
      searchCalls.forEach((call) => {
        expect(call.query).toBe('vacation');
        expect(call.filters?.date_to).toBeDefined();
      });

      // Last bucket should NOT have date_from (open lower bound)
      expect(searchCalls[13].filters?.date_from).toBeUndefined();
    });

    it('does not call byTime', async () => {
      const { service, byTimeCalls } = createMockService();

      await searchByTimeSlice(service, 'query', {
        limit: 10,
        offset: 0,
        direction: 'desc',
      });

      expect(byTimeCalls).toHaveLength(0);
    });
  });

  describe('asc direction', () => {
    it('calls byTime(limit:1) then fires 14 parallel searches with even boundaries', async () => {
      const { service, searchCalls, byTimeCalls } = createMockService();

      await searchByTimeSlice(service, 'vacation', {
        limit: 10,
        offset: 0,
        direction: 'asc',
      });

      expect(byTimeCalls).toHaveLength(1);
      expect(byTimeCalls[0]).toEqual({ direction: 'asc', limit: 1 });
      expect(searchCalls).toHaveLength(BUCKET_COUNT);

      // All search calls should have both date_from and date_to (even slices always have both)
      searchCalls.forEach((call) => {
        expect(call.filters?.date_from).toBeDefined();
        expect(call.filters?.date_to).toBeDefined();
      });
    });

    it('returns empty result when byTime returns no memories', async () => {
      const service: TimeSliceMemoryService = {
        search: jest.fn(),
        byTime: jest.fn(async (): Promise<TimeModeResult> => ({
          memories: [],
          total: 0,
          offset: 0,
          limit: 1,
        })),
      };

      const result = await searchByTimeSlice(service, 'query', {
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

      // Each bucket returns 1 memory → 14 total
      const result = await searchByTimeSlice(service, 'query', {
        limit: 3,
        offset: 5,
        direction: 'desc',
      });

      // Should get memories 6, 7, 8 (0-indexed: 5, 6, 7)
      expect(result.memories).toHaveLength(3);
      expect(result.total).toBe(14); // sum of per-bucket totals
    });

    it('returns fewer results when offset exceeds available', async () => {
      const { service } = createMockService();

      const result = await searchByTimeSlice(service, 'query', {
        limit: 10,
        offset: 12,
        direction: 'desc',
      });

      // Only 2 memories left after offset 12 (14 total)
      expect(result.memories).toHaveLength(2);
    });
  });

  describe('filters pass-through', () => {
    it('includes custom filters in every bucket search call', async () => {
      const { service, searchCalls } = createMockService();

      await searchByTimeSlice(service, 'query', {
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
      await searchByTimeSlice(service, 'query', {
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
      await searchByTimeSlice(service, 'query', {
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
