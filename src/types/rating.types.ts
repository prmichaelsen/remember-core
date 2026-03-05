/**
 * Rating system types for memory quality signals.
 *
 * Individual ratings stored in Firestore, aggregates denormalized on Memory in Weaviate.
 * See: agent/design/local.memory-ratings.md
 */

// ─── Firestore Individual Rating ────────────────────────────────────────

/** Individual user rating stored in Firestore */
export interface MemoryRating {
  rating: number;       // 1-5
  created_at: string;   // ISO 8601
  updated_at: string;   // ISO 8601
}

// ─── Service Input/Output ───────────────────────────────────────────────

export interface RateMemoryInput {
  memoryId: string;       // Weaviate UUID
  userId: string;         // rater's user ID
  rating: number;         // 1-5
}

export interface RatingResult {
  previousRating: number | null;
  newRating: number;
  ratingCount: number;
  ratingAvg: number | null;
}

// ─── Sort Mode ──────────────────────────────────────────────────────────

export interface RatingModeRequest {
  direction?: 'desc' | 'asc';  // default: desc
  limit?: number;
  offset?: number;
  filters?: import('./search.types.js').SearchFilters;
  deleted_filter?: import('../utils/filters.js').DeletedFilter;
  ghost_context?: import('./search.types.js').GhostSearchContext;
}

export interface RatingModeResult {
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Bayesian prior constants */
export const RATING_PRIOR_AVG = 3.0;
export const RATING_PRIOR_COUNT = 5;
export const RATING_MIN_THRESHOLD = 5;

/** Compute Bayesian average from sum and count */
export function computeBayesianScore(ratingSum: number, ratingCount: number): number {
  return (ratingSum + RATING_PRIOR_AVG * RATING_PRIOR_COUNT) / (ratingCount + RATING_PRIOR_COUNT);
}

/** Compute simple average, null if below threshold */
export function computeRatingAvg(ratingSum: number, ratingCount: number): number | null {
  if (ratingCount < RATING_MIN_THRESHOLD) return null;
  return ratingSum / ratingCount;
}

/** Validate a rating value (must be integer 1-5) */
export function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}
