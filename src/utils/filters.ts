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
  if (docType === 'memory' && filters?.types && filters.types.length > 0) {
    if (filters.types.length === 1) {
      filterList.push(
        collection.filter.byProperty('content_type').equal(filters.types[0]),
      );
    } else {
      filterList.push(
        collection.filter.byProperty('content_type').containsAny(filters.types),
      );
    }
  }

  // Weight range
  if (filters?.weight_min !== undefined) {
    filterList.push(
      collection.filter.byProperty('weight').greaterThanOrEqual(filters.weight_min),
    );
  }
  if (filters?.weight_max !== undefined) {
    filterList.push(
      collection.filter.byProperty('weight').lessThanOrEqual(filters.weight_max),
    );
  }

  // Trust range
  if (filters?.trust_min !== undefined) {
    filterList.push(
      collection.filter.byProperty('trust_score').greaterThanOrEqual(filters.trust_min),
    );
  }
  if (filters?.trust_max !== undefined) {
    filterList.push(
      collection.filter.byProperty('trust_score').lessThanOrEqual(filters.trust_max),
    );
  }

  // Date range
  if (filters?.date_from) {
    filterList.push(
      collection.filter
        .byProperty('created_at')
        .greaterThanOrEqual(new Date(filters.date_from)),
    );
  }
  if (filters?.date_to) {
    filterList.push(
      collection.filter
        .byProperty('created_at')
        .lessThanOrEqual(new Date(filters.date_to)),
    );
  }

  // Tags
  if (filters?.tags && filters.tags.length > 0) {
    filterList.push(
      collection.filter.byProperty('tags').containsAny(filters.tags),
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
