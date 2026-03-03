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
  type TimeSliceMemoryService,
  searchByTimeSlice,
} from './search-by-time-slice.js';

export {
  type DensitySlice,
  GRADED_DENSITY_BOUNDARIES,
  DENSITY_BUCKET_COUNT,
  buildGradedDensitySlices,
  buildEvenDensitySlices,
} from './density-slices.js';

export {
  type DensitySliceSearchOptions,
  type DensitySliceSearchResult,
  type DensitySliceMemoryService,
  searchByDensitySlice,
} from './search-by-density-slice.js';
