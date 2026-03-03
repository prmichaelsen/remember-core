// src/search/time-slices.ts
// Pure functions for building time-bucketed search slices.

export interface TimeSlice {
  label: string;
  from?: string; // ISO date string — undefined means "no lower bound"
  to: string;    // ISO date string
}

/**
 * Millisecond offsets from `now` for graded (newest-first) bucketing.
 * 15 boundaries → 14 buckets.
 * Fine granularity near now, coarser further back.
 */
export const GRADED_OFFSETS_MS: readonly number[] = [
  0,
  10 * 60_000,             // 10m
  30 * 60_000,             // 30m
  60 * 60_000,             // 1h
  12 * 3_600_000,          // 12h
  24 * 3_600_000,          // 24h
  3 * 86_400_000,          // 3d
  7 * 86_400_000,          // 7d
  14 * 86_400_000,         // 2w
  28 * 86_400_000,         // 4w
  90 * 86_400_000,         // 3m
  180 * 86_400_000,        // 6m
  365 * 86_400_000,        // 1y
  730 * 86_400_000,        // 2y
  Number.MAX_SAFE_INTEGER, // epoch
];

export const BUCKET_COUNT = 14;

/**
 * Build 14 exponentially-graded time slices anchored at `now`.
 * Used for newest-first (desc) search — fine granularity for recent memories,
 * coarser for older ones.
 */
export function buildGradedSlices(now: number): TimeSlice[] {
  const slices: TimeSlice[] = [];
  for (let i = 0; i < GRADED_OFFSETS_MS.length - 1; i++) {
    const to = new Date(now - GRADED_OFFSETS_MS[i]).toISOString();
    const from = GRADED_OFFSETS_MS[i + 1] === Number.MAX_SAFE_INTEGER
      ? undefined
      : new Date(now - GRADED_OFFSETS_MS[i + 1]).toISOString();
    slices.push({ label: `bucket-${i + 1}`, from, to });
  }
  return slices;
}

/**
 * Build BUCKET_COUNT equal-width time slices from `oldestCreatedAt` to `now`.
 * Used for oldest-first (asc) search — uniform representation across all time periods.
 */
export function buildEvenSlices(oldestCreatedAt: string, now: number): TimeSlice[] {
  const oldestMs = new Date(oldestCreatedAt).getTime();
  const span = now - oldestMs;
  const width = span / BUCKET_COUNT;
  const slices: TimeSlice[] = [];
  for (let i = 0; i < BUCKET_COUNT; i++) {
    slices.push({
      label: `bucket-${i + 1}`,
      from: new Date(oldestMs + i * width).toISOString(),
      to: new Date(oldestMs + (i + 1) * width).toISOString(),
    });
  }
  return slices;
}
