// src/search/search-by-time-slice.ts
// Orchestration function: combines text search with chronological ordering
// via parallel time-bucketed searches against MemoryService (Weaviate-direct).

import type { SearchFilters } from '../types/search.types.js';
import type {
  SearchMemoryInput,
  SearchMemoryResult,
  TimeModeRequest,
  TimeModeResult,
} from '../services/memory.service.js';
import { buildGradedSlices, buildEvenSlices } from './time-slices.js';

export interface TimeSliceSearchOptions {
  limit: number;
  offset: number;
  direction: 'asc' | 'desc';
  filters?: SearchFilters;
}

export interface TimeSliceSearchResult {
  memories: Record<string, unknown>[];
  total: number;
}

/**
 * Minimal interface for the MemoryService methods used by searchByTimeSlice.
 * Accepts MemoryService directly — calls go to Weaviate, not through REST.
 */
export interface TimeSliceMemoryService {
  search(input: SearchMemoryInput): Promise<SearchMemoryResult>;
  byTime(input: TimeModeRequest): Promise<TimeModeResult>;
}

/**
 * Search memories with chronological ordering by partitioning the time axis
 * into buckets and running parallel searches per bucket.
 *
 * Calls MemoryService directly (14 Weaviate queries, not 14 REST calls).
 *
 * - **desc**: Builds graded (exponential) slices anchored at now, fires 14 parallel searches.
 * - **asc**: Fetches oldest memory via byTime(limit:1), builds even slices, fires 14 parallel searches.
 */
export async function searchByTimeSlice(
  memoryService: TimeSliceMemoryService,
  query: string,
  options: TimeSliceSearchOptions,
): Promise<TimeSliceSearchResult> {
  const now = Date.now();
  const perBucketLimit = Math.max(Math.ceil(options.limit / 3), 5);

  let slices;

  if (options.direction === 'desc') {
    slices = buildGradedSlices(now);
  } else {
    // Oldest first: fetch oldest memory to anchor the even buckets
    const oldest = await memoryService.byTime({
      direction: 'asc',
      limit: 1,
    });
    const oldestDate = (oldest.memories[0] as Record<string, unknown> | undefined)?.created_at as string | undefined;
    if (!oldestDate) {
      return { memories: [], total: 0 };
    }
    slices = buildEvenSlices(oldestDate, now);
  }

  // Fire all searches in parallel
  const bucketResults = await Promise.all(
    slices.map(async (slice) => {
      const filters: SearchFilters = {
        ...options.filters,
        ...(slice.from && { date_from: slice.from }),
        date_to: slice.to,
      };

      const result = await memoryService.search({
        query,
        limit: perBucketLimit,
        offset: 0,
        include_relationships: true,
        filters,
      });

      return {
        memories: result.memories,
        total: result.total,
      };
    })
  );

  const allMemories = bucketResults.flatMap((r) => r.memories);
  const totalEstimate = bucketResults.reduce((sum, r) => sum + r.total, 0);

  // Apply offset and limit
  const paged = allMemories.slice(options.offset, options.offset + options.limit);

  return { memories: paged, total: totalEstimate };
}
