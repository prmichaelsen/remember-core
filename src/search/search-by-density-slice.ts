// src/search/search-by-density-slice.ts
// Orchestration function: combines text search with relationship-density ordering
// via parallel density-bucketed searches against MemoryService (Weaviate-direct).

import type { SearchFilters } from '../types/search.types.js';
import type {
  SearchMemoryInput,
  SearchMemoryResult,
  DensityModeRequest,
  DensityModeResult,
} from '../services/memory.service.js';
import { buildGradedDensitySlices, buildEvenDensitySlices } from './density-slices.js';

export interface DensitySliceSearchOptions {
  limit: number;
  offset: number;
  direction: 'asc' | 'desc';
  filters?: SearchFilters;
}

export interface DensitySliceSearchResult {
  memories: Record<string, unknown>[];
  total: number;
}

/**
 * Minimal interface for the MemoryService methods used by searchByDensitySlice.
 * Accepts MemoryService directly — calls go to Weaviate, not through REST.
 */
export interface DensitySliceMemoryService {
  search(input: SearchMemoryInput): Promise<SearchMemoryResult>;
  byDensity(input: DensityModeRequest): Promise<DensityModeResult>;
}

/**
 * Search memories with density ordering by partitioning the relationship_count axis
 * into buckets and running parallel searches per bucket.
 *
 * Calls MemoryService directly (9 Weaviate queries, not 9 REST calls).
 *
 * - **desc**: Builds graded density slices, fires 9 parallel searches (most-connected first).
 * - **asc**: Fetches max-density memory via byDensity(limit:1), builds even slices, fires parallel searches.
 */
export async function searchByDensitySlice(
  memoryService: DensitySliceMemoryService,
  query: string,
  options: DensitySliceSearchOptions,
): Promise<DensitySliceSearchResult> {
  const perBucketLimit = Math.max(Math.ceil(options.limit / 3), 5);

  let slices;

  if (options.direction === 'desc') {
    slices = buildGradedDensitySlices();
  } else {
    // Least-connected first: fetch most-connected memory to get max count
    const densest = await memoryService.byDensity({
      limit: 1,
    });
    const maxCount = (densest.memories[0] as Record<string, unknown> | undefined)?.relationship_count as number | undefined;
    if (maxCount === undefined || densest.memories.length === 0) {
      return { memories: [], total: 0 };
    }
    slices = buildEvenDensitySlices(maxCount);
  }

  // Fire all searches in parallel
  const bucketResults = await Promise.all(
    slices.map(async (slice) => {
      const filters: SearchFilters = {
        ...options.filters,
        relationship_count_min: slice.min,
        ...(slice.max !== undefined && { relationship_count_max: slice.max }),
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
