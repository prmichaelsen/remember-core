/**
 * Weaviate v3 filter builder utilities.
 *
 * Ported from remember-mcp/src/utils/weaviate-filters.ts.
 * Provides helper functions to build Weaviate v3 filters using the fluent API.
 */

import { Filters } from 'weaviate-client';
import type { SearchFilters, DeletedFilter } from '../types/search.types.js';
export type { DeletedFilter } from '../types/search.types.js';

/**
 * Build filters for searching both memories and relationships.
 * Uses OR logic: (doc_type=memory AND memory_filters) OR (doc_type=relationship AND relationship_filters)
 *
 * @param collection - Weaviate collection instance
 * @param filters - Optional search filters
 * @returns Combined filter or undefined if no filters
 */
export function buildCombinedSearchFilters(
  collection: any,
  filters?: SearchFilters,
): any {
  const memoryFilters = buildDocTypeFilters(collection, 'memory', filters);
  const relationshipFilters = buildDocTypeFilters(collection, 'relationship', filters);

  const validFilters = [memoryFilters, relationshipFilters].filter(
    (f) => f !== undefined && f !== null,
  );

  if (validFilters.length === 0) {
    return undefined;
  } else if (validFilters.length === 1) {
    return validFilters[0];
  } else {
    return combineFiltersWithOr(validFilters);
  }
}

/**
 * Build filters for a specific doc_type (memory or relationship).
 */
function buildDocTypeFilters(
  collection: any,
  docType: 'memory' | 'relationship',
  filters?: SearchFilters,
): any {
  const filterList: any[] = [];

  filterList.push(collection.filter.byProperty('doc_type').equal(docType));

  // Content type filter — only for memories
  if (docType === 'memory') {
    // Default-excluded content types (hidden unless explicitly requested via types filter)
    const DEFAULT_EXCLUDED_TYPES = ['agent'];

    if (filters?.types && filters.types.length > 0) {
      // Caller explicitly specified types — use as include filter (no default exclusion)
      if (filters.types.length === 1) {
        filterList.push(
          collection.filter.byProperty('content_type').equal(filters.types[0]),
        );
      } else {
        filterList.push(
          collection.filter.byProperty('content_type').containsAny(filters.types),
        );
      }
    } else {
      // No types filter — apply default exclusion
      for (const excludedType of DEFAULT_EXCLUDED_TYPES) {
        filterList.push(
          collection.filter.byProperty('content_type').notEqual(excludedType),
        );
      }
    }

    // Explicit exclude_types — always applied, takes precedence over types
    if (filters?.exclude_types && filters.exclude_types.length > 0) {
      for (const excludedType of filters.exclude_types) {
        filterList.push(
          collection.filter.byProperty('content_type').notEqual(excludedType),
        );
      }
    }
  }

  // Weight range
  if (filters?.weight_min !== undefined) {
    filterList.push(
      collection.filter.byProperty('weight').greaterOrEqual(filters.weight_min),
    );
  }
  if (filters?.weight_max !== undefined) {
    filterList.push(
      collection.filter.byProperty('weight').lessOrEqual(filters.weight_max),
    );
  }

  // Trust range
  if (filters?.trust_min !== undefined) {
    filterList.push(
      collection.filter.byProperty('trust_score').greaterOrEqual(filters.trust_min),
    );
  }
  if (filters?.trust_max !== undefined) {
    filterList.push(
      collection.filter.byProperty('trust_score').lessOrEqual(filters.trust_max),
    );
  }

  // Date range
  if (filters?.date_from) {
    filterList.push(
      collection.filter
        .byProperty('created_at')
        .greaterOrEqual(new Date(filters.date_from)),
    );
  }
  if (filters?.date_to) {
    filterList.push(
      collection.filter
        .byProperty('created_at')
        .lessOrEqual(new Date(filters.date_to)),
    );
  }

  // Relationship count range
  if (filters?.relationship_count_min !== undefined) {
    filterList.push(
      collection.filter.byProperty('relationship_count').greaterOrEqual(filters.relationship_count_min),
    );
  }
  if (filters?.relationship_count_max !== undefined) {
    filterList.push(
      collection.filter.byProperty('relationship_count').lessOrEqual(filters.relationship_count_max),
    );
  }

  // Rating minimum (Bayesian score)
  if (filters?.rating_min !== undefined) {
    filterList.push(
      collection.filter.byProperty('rating_bayesian').greaterOrEqual(filters.rating_min),
    );
  }

  // Tags
  if (filters?.tags && filters.tags.length > 0) {
    filterList.push(
      collection.filter.byProperty('tags').containsAny(filters.tags),
    );
  }

  // Memory IDs (pre-resolved from relationship_ids by caller)
  if (filters?.memory_ids && filters.memory_ids.length > 0) {
    filterList.push(
      collection.filter.byId().containsAny(filters.memory_ids),
    );
  }

  return combineFiltersWithAnd(filterList);
}

/**
 * Build filters for memory-only search.
 */
export function buildMemoryOnlyFilters(
  collection: any,
  filters?: SearchFilters,
): any {
  return buildDocTypeFilters(collection, 'memory', filters);
}

/**
 * Build filters for relationship-only search.
 */
export function buildRelationshipOnlyFilters(
  collection: any,
  filters?: SearchFilters,
): any {
  return buildDocTypeFilters(collection, 'relationship', filters);
}

/**
 * Combine multiple filters with AND logic.
 */
export function combineFiltersWithAnd(filters: any[]): any {
  const validFilters = filters.filter((f) => f !== undefined && f !== null);

  if (validFilters.length === 0) return undefined;
  if (validFilters.length === 1) return validFilters[0];

  return Filters.and(...validFilters);
}

/**
 * Combine multiple filters with OR logic.
 */
function combineFiltersWithOr(filters: any[]): any {
  const validFilters = filters.filter((f) => f !== undefined && f !== null);

  if (validFilters.length === 0) return undefined;
  if (validFilters.length === 1) return validFilters[0];

  return Filters.or(...validFilters);
}

/**
 * Check if a filter result is non-empty.
 */
export function hasFilters(filter: any): boolean {
  return filter !== undefined && filter !== null;
}

// ─── Moderation Filters ──────────────────────────────────────────────────

/** Valid moderation statuses for published memories */
export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'removed';

/**
 * Build filter for moderation_status on published memories.
 *
 * Default behavior (no status specified): show approved or null (backward compat).
 * Moderator override: pass specific status to see pending/rejected/removed.
 * Pass 'all' to skip the filter entirely (moderator view).
 *
 * @param collection - Weaviate collection instance
 * @param status - Specific status to filter by, or 'all' for no filter
 * @returns Filter for moderation_status, or null if no filter needed
 */
export function buildModerationStatusFilter(
  collection: any,
  status?: ModerationStatus | 'all',
): any | null {
  if (status === 'all') {
    return null;
  }

  if (status) {
    // Filter to specific status
    return collection.filter.byProperty('moderation_status').equal(status);
  }

  // Default: approved or null (backward compat for pre-moderation memories)
  return Filters.or(
    collection.filter.byProperty('moderation_status').equal('approved'),
    collection.filter.byProperty('moderation_status').isNull(true),
  );
}

/**
 * Build filter for deleted_at field based on deleted_filter parameter.
 *
 * @param collection - Weaviate collection instance
 * @param deletedFilter - Filter mode: 'exclude' (default), 'include', or 'only'
 * @returns Filter for deleted_at field, or null if no filter needed
 */
export function buildDeletedFilter(
  collection: any,
  deletedFilter: DeletedFilter = 'exclude',
): any | null {
  if (deletedFilter === 'exclude') {
    return collection.filter.byProperty('deleted_at').isNull(true);
  } else if (deletedFilter === 'only') {
    return collection.filter.byProperty('deleted_at').isNull(false);
  }
  return null;
}
