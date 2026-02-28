/**
 * Search-related types for remember-core.
 * Ported from remember-mcp/src/types/memory.ts
 */

import type { GPSCoordinates } from './context.types.js';
import type { ContentType, Memory, Relationship } from './memory.types.js';

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
 * Ghost/trust context for memory searches.
 * When provided, MemoryService applies trust-level filtering and ghost content exclusion.
 */
export interface GhostSearchContext {
  /** Trust level of the user accessing ghost memories (0-1) */
  accessor_trust_level: number;
  /** Owner of the ghost memories being searched */
  owner_user_id: string;
  /** If true, skip ghost content_type exclusion (explicit ghost search) */
  include_ghost_content?: boolean;
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
