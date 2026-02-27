/**
 * Search-related types for remember-core.
 * Ported from remember-mcp/src/types/memory.ts
 */

import type { GPSCoordinates } from './context.types';
import type { ContentType, Memory, Relationship } from './memory.types';

/**
 * Search filters
 */
export interface SearchFilters {
  types?: ContentType[];
  tags?: string[];
  weight_min?: number;
  weight_max?: number;
  trust_min?: number;
  trust_max?: number;
  date_from?: string;
  date_to?: string;
  location_near?: GPSCoordinates;
  location_radius_meters?: number;
  has_relationships?: boolean;
}

/**
 * Deleted filter type
 */
export type DeletedFilter = 'exclude' | 'include' | 'only';

/**
 * Search options
 */
export interface SearchOptions {
  query: string;
  alpha?: number; // 0-1, balance between semantic (1.0) and keyword (0.0)
  filters?: SearchFilters;
  include_relationships?: boolean;
  deleted_filter?: DeletedFilter;
  limit?: number;
  offset?: number;
}

/**
 * Search result
 */
export interface SearchResult {
  memories: Memory[];
  relationships?: Relationship[];
  total: number;
  offset: number;
  limit: number;
}
