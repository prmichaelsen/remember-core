// src/search/search-by-time-slice.ts
// Orchestration function: combines text search with chronological ordering
// via parallel time-bucketed searches.

import type { MemoriesResource } from '../clients/svc/v1/memories.js';
import { buildGradedSlices, buildEvenSlices } from './time-slices.js';

export interface TimeSliceSearchOptions {
  limit: number;
  offset: number;
  direction: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

export interface TimeSliceSearchResult {
  memories: Record<string, unknown>[];
  total: number;
}

export interface TimeSliceSearchClient {
  memories: Pick<MemoriesResource, 'search' | 'byTime'>;
}

/**
 * Search memories with chronological ordering by partitioning the time axis
 * into buckets and running parallel searches per bucket.
 *
 * - **desc**: Builds graded (exponential) slices anchored at now, fires 14 parallel searches.
 * - **asc**: Fetches oldest memory via byTime(limit:1), builds even slices, fires 14 parallel searches.
 */
export async function searchByTimeSlice(
  svc: TimeSliceSearchClient,
  userId: string,
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
    const oldestRes = await svc.memories.byTime(userId, {
      direction: 'asc',
      limit: 1,
    });
    const oldest = oldestRes.throwOnError() as { memories?: Array<{ created_at?: string }> };
    const oldestDate = oldest.memories?.[0]?.created_at;
    if (!oldestDate) {
      return { memories: [], total: 0 };
    }
    slices = buildEvenSlices(oldestDate, now);
  }

  // Fire all searches in parallel
  const bucketResults = await Promise.all(
    slices.map(async (slice) => {
      const res = await svc.memories.search(userId, {
        query,
        limit: perBucketLimit,
        offset: 0,
        include_relationships: true,
        ...(slice.from && { date_from: slice.from }),
        date_to: slice.to,
        ...(options.filters ?? {}),
      });
      const data = res.throwOnError() as { memories?: Record<string, unknown>[]; total?: number };
      return {
        memories: data.memories ?? [],
        total: data.total ?? 0,
      };
    })
  );

  const allMemories = bucketResults.flatMap((r) => r.memories);
  const totalEstimate = bucketResults.reduce((sum, r) => sum + r.total, 0);

  // Apply offset and limit
  const paged = allMemories.slice(options.offset, options.offset + options.limit);

  return { memories: paged, total: totalEstimate };
}
