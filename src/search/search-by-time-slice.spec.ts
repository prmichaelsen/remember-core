import { searchByTimeSlice, TimeSliceSearchClient } from './search-by-time-slice.js';
import { createSuccess } from '../clients/response.js';
import { BUCKET_COUNT } from './time-slices.js';

function createMockSvc(): {
  svc: TimeSliceSearchClient;
  searchCalls: Array<{ userId: string; input: Record<string, unknown> }>;
  byTimeCalls: Array<{ userId: string; input: Record<string, unknown> }>;
} {
  const searchCalls: Array<{ userId: string; input: Record<string, unknown> }> = [];
  const byTimeCalls: Array<{ userId: string; input: Record<string, unknown> }> = [];

  const svc: TimeSliceSearchClient = {
    memories: {
      search: jest.fn(async (userId: string, input: Record<string, unknown>) => {
        searchCalls.push({ userId, input });
        // Return one memory per bucket with a created_at matching the bucket's date_to
        const memory = {
          memory_id: `mem-${searchCalls.length}`,
          content: `Memory ${searchCalls.length}`,
          created_at: input.date_to as string,
        };
        return createSuccess({ memories: [memory], total: 1 });
      }),
      byTime: jest.fn(async (userId: string, input: Record<string, unknown>) => {
        byTimeCalls.push({ userId, input });
        return createSuccess({
          memories: [{
            memory_id: 'oldest-mem',
            content: 'Oldest memory',
            created_at: '2025-01-01T00:00:00.000Z',
          }],
          total: 1,
        });
      }),
    },
  };

  return { svc, searchCalls, byTimeCalls };
}

describe('searchByTimeSlice', () => {
  describe('desc direction', () => {
    it('fires 14 parallel search calls with graded date boundaries', async () => {
      const { svc, searchCalls, byTimeCalls } = createMockSvc();

      await searchByTimeSlice(svc, 'user-1', 'vacation', {
        limit: 10,
        offset: 0,
        direction: 'desc',
      });

      expect(searchCalls).toHaveLength(BUCKET_COUNT);
      expect(byTimeCalls).toHaveLength(0); // desc does NOT call byTime

      // Every search call should have the query and date_to
      searchCalls.forEach((call) => {
        expect(call.userId).toBe('user-1');
        expect(call.input.query).toBe('vacation');
        expect(call.input.date_to).toBeDefined();
      });

      // Last bucket should NOT have date_from (open lower bound)
      expect(searchCalls[13].input.date_from).toBeUndefined();
    });

    it('does not call byTime', async () => {
      const { svc, byTimeCalls } = createMockSvc();

      await searchByTimeSlice(svc, 'user-1', 'query', {
        limit: 10,
        offset: 0,
        direction: 'desc',
      });

      expect(byTimeCalls).toHaveLength(0);
    });
  });

  describe('asc direction', () => {
    it('calls byTime(limit:1) then fires 14 parallel searches with even boundaries', async () => {
      const { svc, searchCalls, byTimeCalls } = createMockSvc();

      await searchByTimeSlice(svc, 'user-1', 'vacation', {
        limit: 10,
        offset: 0,
        direction: 'asc',
      });

      expect(byTimeCalls).toHaveLength(1);
      expect(byTimeCalls[0].input).toEqual({ direction: 'asc', limit: 1 });
      expect(searchCalls).toHaveLength(BUCKET_COUNT);

      // All search calls should have both date_from and date_to (even slices always have both)
      searchCalls.forEach((call) => {
        expect(call.input.date_from).toBeDefined();
        expect(call.input.date_to).toBeDefined();
      });
    });

    it('returns empty result when byTime returns no memories', async () => {
      const svc: TimeSliceSearchClient = {
        memories: {
          search: jest.fn(),
          byTime: jest.fn(async () => createSuccess({ memories: [], total: 0 })),
        },
      };

      const result = await searchByTimeSlice(svc, 'user-1', 'query', {
        limit: 10,
        offset: 0,
        direction: 'asc',
      });

      expect(result).toEqual({ memories: [], total: 0 });
      expect(svc.memories.search).not.toHaveBeenCalled();
    });
  });

  describe('pagination', () => {
    it('applies offset and limit to aggregated results', async () => {
      const { svc } = createMockSvc();

      // Each bucket returns 1 memory → 14 total
      const result = await searchByTimeSlice(svc, 'user-1', 'query', {
        limit: 3,
        offset: 5,
        direction: 'desc',
      });

      // Should get memories 6, 7, 8 (0-indexed: 5, 6, 7)
      expect(result.memories).toHaveLength(3);
      expect(result.total).toBe(14); // sum of per-bucket totals
    });

    it('returns fewer results when offset exceeds available', async () => {
      const { svc } = createMockSvc();

      const result = await searchByTimeSlice(svc, 'user-1', 'query', {
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
      const { svc, searchCalls } = createMockSvc();

      await searchByTimeSlice(svc, 'user-1', 'query', {
        limit: 10,
        offset: 0,
        direction: 'desc',
        filters: { types: ['note'], tags: ['important'] },
      });

      searchCalls.forEach((call) => {
        expect(call.input.types).toEqual(['note']);
        expect(call.input.tags).toEqual(['important']);
      });
    });
  });

  describe('per-bucket limit', () => {
    it('uses Math.max(ceil(limit/3), 5) as per-bucket limit', async () => {
      const { svc, searchCalls } = createMockSvc();

      // limit = 30 → perBucketLimit = ceil(30/3) = 10
      await searchByTimeSlice(svc, 'user-1', 'query', {
        limit: 30,
        offset: 0,
        direction: 'desc',
      });

      searchCalls.forEach((call) => {
        expect(call.input.limit).toBe(10);
      });
    });

    it('floors per-bucket limit at 5', async () => {
      const { svc, searchCalls } = createMockSvc();

      // limit = 3 → ceil(3/3) = 1, but min is 5
      await searchByTimeSlice(svc, 'user-1', 'query', {
        limit: 3,
        offset: 0,
        direction: 'desc',
      });

      searchCalls.forEach((call) => {
        expect(call.input.limit).toBe(5);
      });
    });
  });
});
