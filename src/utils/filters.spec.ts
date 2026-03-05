// src/utils/filters.spec.ts
import { createMockCollection } from '../testing/weaviate-mock';
import { buildMemoryOnlyFilters, combineFiltersWithAnd } from './filters';
import type { SearchFilters } from '../types/search.types';

describe('buildMemoryOnlyFilters', () => {
  let collection: ReturnType<typeof createMockCollection>;

  beforeEach(() => {
    collection = createMockCollection();
  });

  describe('memory_ids filter', () => {
    it('applies byId containsAny filter when memory_ids is non-empty', () => {
      const filters: SearchFilters = {
        memory_ids: ['mem-1', 'mem-2', 'mem-3'],
      };

      const result = buildMemoryOnlyFilters(collection, filters);

      // The filter should be an AND of doc_type=memory + default exclusions + byId containsAny
      expect(result).toBeDefined();
      // Verify the filter structure contains a byId_containsAny entry
      const flat = flattenFilter(result);
      expect(flat).toContainEqual(
        expect.objectContaining({ _type: 'byId_containsAny', values: ['mem-1', 'mem-2', 'mem-3'] }),
      );
    });

    it('omits byId filter when memory_ids is empty', () => {
      const filters: SearchFilters = {
        memory_ids: [],
      };

      const result = buildMemoryOnlyFilters(collection, filters);

      const flat = flattenFilter(result);
      expect(flat).not.toContainEqual(
        expect.objectContaining({ _type: 'byId_containsAny' }),
      );
    });

    it('omits byId filter when memory_ids is undefined', () => {
      const filters: SearchFilters = {};

      const result = buildMemoryOnlyFilters(collection, filters);

      const flat = flattenFilter(result);
      expect(flat).not.toContainEqual(
        expect.objectContaining({ _type: 'byId_containsAny' }),
      );
    });

    it('combines memory_ids with other filters via AND', () => {
      const filters: SearchFilters = {
        memory_ids: ['mem-1'],
        tags: ['important'],
      };

      const result = buildMemoryOnlyFilters(collection, filters);

      const flat = flattenFilter(result);
      expect(flat).toContainEqual(
        expect.objectContaining({ _type: 'byId_containsAny', values: ['mem-1'] }),
      );
      expect(flat).toContainEqual(
        expect.objectContaining({ _type: 'containsAny', field: 'tags', values: ['important'] }),
      );
    });
  });
});

/**
 * Recursively flatten a filter tree into leaf filter nodes.
 */
function flattenFilter(filter: any): any[] {
  if (!filter) return [];
  if (filter.operator === 'And' && filter.filters) {
    return filter.filters.flatMap((f: any) => flattenFilter(f));
  }
  if (filter.operator === 'Or' && filter.filters) {
    return filter.filters.flatMap((f: any) => flattenFilter(f));
  }
  return [filter];
}
