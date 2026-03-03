// src/search/density-slices.ts
// Pure functions for building density-bucketed search slices (by relationship_count).

export interface DensitySlice {
  label: string;
  min: number;   // inclusive lower bound
  max?: number;  // inclusive upper bound — undefined means "no upper bound"
}

/**
 * Fixed boundaries for graded (most-connected-first) density buckets.
 * 9 ranges: [50+, 20-49, 10-19, 7-9, 5-6, 3-4, 2, 1, 0]
 */
export const GRADED_DENSITY_BOUNDARIES: readonly { min: number; max?: number }[] = [
  { min: 50 },
  { min: 20, max: 49 },
  { min: 10, max: 19 },
  { min: 7, max: 9 },
  { min: 5, max: 6 },
  { min: 3, max: 4 },
  { min: 2, max: 2 },
  { min: 1, max: 1 },
  { min: 0, max: 0 },
];

export const DENSITY_BUCKET_COUNT = 9;

/**
 * Build 9 graded density slices for desc (most-connected-first) search.
 * Static boundaries — no parameters needed.
 */
export function buildGradedDensitySlices(): DensitySlice[] {
  return GRADED_DENSITY_BOUNDARIES.map((b, i) => ({
    label: `density-${i + 1}`,
    min: b.min,
    max: b.max,
  }));
}

/**
 * Build even density slices for asc (least-connected-first) search.
 * Divides [0, maxCount] into N equal integer buckets.
 *
 * @param maxCount - Maximum relationship_count in the collection
 * @param bucketCount - Number of buckets (defaults to DENSITY_BUCKET_COUNT)
 */
export function buildEvenDensitySlices(
  maxCount: number,
  bucketCount: number = DENSITY_BUCKET_COUNT,
): DensitySlice[] {
  if (maxCount <= 0) {
    return [{ label: 'density-1', min: 0, max: 0 }];
  }

  const effectiveBuckets = Math.min(bucketCount, maxCount + 1);
  const width = (maxCount + 1) / effectiveBuckets;
  const slices: DensitySlice[] = [];

  for (let i = 0; i < effectiveBuckets; i++) {
    const min = Math.floor(i * width);
    const max = Math.floor((i + 1) * width) - 1;
    slices.push({
      label: `density-${i + 1}`,
      min,
      max: Math.min(max, maxCount),
    });
  }

  return slices;
}
