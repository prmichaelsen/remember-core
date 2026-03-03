// src/search/index.ts
// Barrel export for remember-core/search subpath.

export {
  type TimeSlice,
  GRADED_OFFSETS_MS,
  BUCKET_COUNT,
  buildGradedSlices,
  buildEvenSlices,
} from './time-slices.js';

export {
  type TimeSliceSearchOptions,
  type TimeSliceSearchResult,
  type TimeSliceSearchClient,
  searchByTimeSlice,
} from './search-by-time-slice.js';
