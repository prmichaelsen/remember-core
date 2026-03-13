/**
 * Mock Weaviate collection for unit testing.
 *
 * Provides an in-memory implementation of the Weaviate v3 collection API
 * used by MemoryService, RelationshipService, and SpaceService.
 */

const randomUUID = () => globalThis.crypto.randomUUID();

export interface MockWeaviateObject {
  uuid: string;
  properties: Record<string, any>;
  metadata?: { distance?: number; score?: number };
}

/**
 * Create a mock Weaviate collection for testing.
 * Stores objects in memory and provides the same API as a real Weaviate collection.
 */
export function createMockCollection() {
  const store = new Map<string, MockWeaviateObject>();

  const collection = {
    /** Direct access to the in-memory store for assertions. */
    _store: store,

    /** Collection name (mirrors Weaviate collection.name) */
    name: 'Memory_users_mock',

    data: {
      async insert(opts: { id?: string; properties: Record<string, any> }): Promise<string> {
        const id = opts.id ?? randomUUID();
        store.set(id, { uuid: id, properties: { ...opts.properties } });
        return id;
      },

      async update(opts: { id: string; properties: Record<string, any> }): Promise<void> {
        const existing = store.get(opts.id);
        if (!existing) throw new Error(`Object not found: ${opts.id}`);
        existing.properties = { ...existing.properties, ...opts.properties };
      },

      async replace(opts: { id: string; properties: Record<string, any> }): Promise<void> {
        if (!store.has(opts.id)) throw new Error(`Object not found: ${opts.id}`);
        store.set(opts.id, { uuid: opts.id, properties: { ...opts.properties } });
      },

      async deleteById(id: string): Promise<void> {
        store.delete(id);
      },
    },

    sort: {
      byProperty(property: string, ascending = true) {
        return { sorts: [{ property, ascending }] };
      },
    },

    query: {
      async fetchObjectById(
        id: string,
        _opts?: { returnProperties?: string[]; includeVector?: boolean },
      ): Promise<(MockWeaviateObject & { vectors?: Record<string, number[]> }) | null> {
        const obj = store.get(id);
        if (!obj) return null;
        if (_opts?.includeVector && obj.properties._vector) {
          return { ...obj, vectors: { default: obj.properties._vector } };
        }
        return obj;
      },

      async fetchObjects(
        opts?: { filters?: any; limit?: number; offset?: number; sort?: { sorts: Array<{ property: string; ascending: boolean }> } },
      ): Promise<{ objects: MockWeaviateObject[] }> {
        let objects = Array.from(store.values());
        if (opts?.filters) {
          objects = applyFilter(objects, opts.filters);
        }
        if (opts?.sort?.sorts && opts.sort.sorts.length > 0) {
          const sortConfig = opts.sort.sorts[0];
          objects.sort((a, b) => {
            const aVal = a.properties[sortConfig.property];
            const bVal = b.properties[sortConfig.property];

            let comparison = 0;
            if (typeof aVal === 'string' && typeof bVal === 'string') {
              comparison = aVal.localeCompare(bVal);
            } else if (typeof aVal === 'number' && typeof bVal === 'number') {
              comparison = aVal - bVal;
            }

            return sortConfig.ascending ? comparison : -comparison;
          });
        }
        if (opts?.offset) {
          objects = objects.slice(opts.offset);
        }
        if (opts?.limit) {
          objects = objects.slice(0, opts.limit);
        }
        return { objects };
      },

      async hybrid(
        _query: string,
        opts?: { alpha?: number; limit?: number; offset?: number; filters?: any },
      ): Promise<{ objects: MockWeaviateObject[] }> {
        let objects = Array.from(store.values());
        if (opts?.filters) {
          objects = applyFilter(objects, opts.filters);
        }
        // Add mock score metadata
        objects = objects.map((obj, i) => ({
          ...obj,
          metadata: { ...obj.metadata, score: 1 - i * 0.1 },
        }));
        if (opts?.offset) {
          objects = objects.slice(opts.offset);
        }
        if (opts?.limit) {
          objects = objects.slice(0, opts.limit);
        }
        return { objects };
      },

      async nearText(
        _query: string | string[],
        opts?: { limit?: number; offset?: number; distance?: number; returnMetadata?: string[]; filters?: any },
      ): Promise<{ objects: MockWeaviateObject[] }> {
        let objects = Array.from(store.values());
        if (opts?.filters) {
          objects = applyFilter(objects, opts.filters);
        }
        // Add mock distance metadata
        objects = objects.map((obj, i) => ({
          ...obj,
          metadata: { ...obj.metadata, distance: i * 0.1 },
        }));
        if (opts?.offset) {
          objects = objects.slice(opts.offset);
        }
        if (opts?.limit) {
          objects = objects.slice(0, opts.limit);
        }
        return { objects };
      },

      async nearObject(
        _id: string,
        opts?: { limit?: number; offset?: number; distance?: number; returnMetadata?: string[]; filters?: any },
      ): Promise<{ objects: MockWeaviateObject[] }> {
        let objects = Array.from(store.values());
        if (opts?.filters) {
          objects = applyFilter(objects, opts.filters);
        }
        objects = objects.map((obj, i) => ({
          ...obj,
          metadata: { ...obj.metadata, distance: i * 0.1 },
        }));
        if (opts?.offset) {
          objects = objects.slice(opts.offset);
        }
        if (opts?.limit) {
          objects = objects.slice(0, opts.limit);
        }
        return { objects };
      },

      async nearVector(
        _vector: number[],
        opts?: { limit?: number; offset?: number; filters?: any; returnMetadata?: string[] },
      ): Promise<{ objects: MockWeaviateObject[] }> {
        let objects = Array.from(store.values());
        if (opts?.filters) {
          objects = applyFilter(objects, opts.filters);
        }
        // Add mock distance metadata (ascending by insertion order)
        objects = objects.map((obj, i) => ({
          ...obj,
          metadata: { ...obj.metadata, distance: i * 0.05 },
        }));
        if (opts?.offset) {
          objects = objects.slice(opts.offset);
        }
        if (opts?.limit) {
          objects = objects.slice(0, opts.limit);
        }
        return { objects };
      },

      async bm25(
        _query: string,
        opts?: { limit?: number; offset?: number; filters?: any },
      ): Promise<{ objects: MockWeaviateObject[] }> {
        let objects = Array.from(store.values());
        if (opts?.filters) {
          objects = applyFilter(objects, opts.filters);
        }
        if (opts?.offset) {
          objects = objects.slice(opts.offset);
        }
        if (opts?.limit) {
          objects = objects.slice(0, opts.limit);
        }
        return { objects };
      },
    },

    filter: {
      byId() {
        return {
          equal(value: string) {
            return { _type: 'byId_equal', value };
          },
          notEqual(value: string) {
            return { _type: 'byId_notEqual', value };
          },
          containsAny(values: string[]) {
            return { _type: 'byId_containsAny', values };
          },
        };
      },
      byProperty(name: string) {
        const createChainableFilter = (filterObj: any) => {
          return {
            ...filterObj,
            and() {
              return {
                byProperty(nextName: string) {
                  const nextFilter = createChainableFilter;
                  return {
                    equal(value: any) {
                      return nextFilter({ operator: 'And', filters: [filterObj, { _type: 'equal', field: nextName, value }] });
                    },
                    notEqual(value: any) {
                      return nextFilter({ operator: 'And', filters: [filterObj, { _type: 'notEqual', field: nextName, value }] });
                    },
                    greaterThan(value: any) {
                      return nextFilter({ operator: 'And', filters: [filterObj, { _type: 'gt', field: nextName, value }] });
                    },
                    greaterOrEqual(value: any) {
                      return nextFilter({ operator: 'And', filters: [filterObj, { _type: 'gte', field: nextName, value }] });
                    },
                    lessThan(value: any) {
                      return nextFilter({ operator: 'And', filters: [filterObj, { _type: 'lt', field: nextName, value }] });
                    },
                    lessOrEqual(value: any) {
                      return nextFilter({ operator: 'And', filters: [filterObj, { _type: 'lte', field: nextName, value }] });
                    },
                    containsAny(values: any[]) {
                      return nextFilter({ operator: 'And', filters: [filterObj, { _type: 'containsAny', field: nextName, values }] });
                    },
                    isNull(value: boolean) {
                      return nextFilter({ operator: 'And', filters: [filterObj, { _type: 'isNull', field: nextName, value }] });
                    },
                  };
                },
              };
            },
          };
        };

        return {
          equal(value: any) {
            return createChainableFilter({ _type: 'equal', field: name, value });
          },
          notEqual(value: any) {
            return createChainableFilter({ _type: 'notEqual', field: name, value });
          },
          greaterThan(value: any) {
            return createChainableFilter({ _type: 'gt', field: name, value });
          },
          greaterOrEqual(value: any) {
            return createChainableFilter({ _type: 'gte', field: name, value });
          },
          lessThan(value: any) {
            return createChainableFilter({ _type: 'lt', field: name, value });
          },
          lessOrEqual(value: any) {
            return createChainableFilter({ _type: 'lte', field: name, value });
          },
          containsAny(values: any[]) {
            return createChainableFilter({ _type: 'containsAny', field: name, values });
          },
          isNull(value: boolean) {
            return createChainableFilter({ _type: 'isNull', field: name, value });
          },
        };
      },
    },

    aggregate: {
      async overAll() {
        return { totalCount: store.size };
      },
    },
  };

  return collection;
}

/**
 * Create a mock Weaviate client for testing SpaceService.
 * Supports multiple collections by name.
 */
export function createMockWeaviateClient() {
  const collections = new Map<string, ReturnType<typeof createMockCollection>>();

  return {
    _collections: collections,

    collections: {
      get(name: string) {
        if (!collections.has(name)) {
          collections.set(name, createMockCollection());
        }
        return collections.get(name)!;
      },

      async exists(name: string): Promise<boolean> {
        return collections.has(name);
      },

      async create(_schema: any): Promise<void> {
        // no-op in mock
      },

      async listAll(): Promise<{ name: string }[]> {
        return Array.from(collections.keys()).map((name) => ({ name }));
      },
    },
  };
}

// ─── Filter Application ─────────────────────────────────────────────────

interface MockFilter {
  _type?: string;
  field?: string;
  value?: any;
  values?: any[];
  operands?: MockFilter[];
  // Weaviate Filters.and/or format
  operator?: string;
  filters?: MockFilter[];
}

/** Convert a value to a timestamp (ms) if it's a Date or a date-like ISO string,
 *  so that comparisons between Date objects and ISO strings work like real Weaviate. */
function toComparable(value: unknown): any {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const t = Date.parse(value);
    if (!isNaN(t)) return t;
  }
  return value;
}

function applyFilter(objects: MockWeaviateObject[], filter: MockFilter): MockWeaviateObject[] {
  if (!filter) return objects;

  // Handle Weaviate Filters.and/or format (operator + filters)
  if (filter.operator === 'And' && filter.filters) {
    return filter.filters.reduce(
      (remaining, operand) => applyFilter(remaining, operand),
      objects,
    );
  }
  if (filter.operator === 'Or' && filter.filters) {
    const seen = new Set<string>();
    const resultObjects: MockWeaviateObject[] = [];
    for (const operand of filter.filters) {
      for (const obj of applyFilter(objects, operand)) {
        if (!seen.has(obj.uuid)) {
          seen.add(obj.uuid);
          resultObjects.push(obj);
        }
      }
    }
    return resultObjects;
  }

  // Handle our mock filter format (_type + field)
  if (!filter._type) return objects;

  switch (filter._type) {
    case 'equal':
      return objects.filter((obj) => obj.properties[filter.field!] === filter.value);
    case 'notEqual':
      return objects.filter((obj) => obj.properties[filter.field!] !== filter.value);
    case 'gt':
      return objects.filter((obj) => toComparable(obj.properties[filter.field!]) > toComparable(filter.value));
    case 'gte':
      return objects.filter((obj) => toComparable(obj.properties[filter.field!]) >= toComparable(filter.value));
    case 'lt':
      return objects.filter((obj) => toComparable(obj.properties[filter.field!]) < toComparable(filter.value));
    case 'lte':
      return objects.filter((obj) => toComparable(obj.properties[filter.field!]) <= toComparable(filter.value));
    case 'containsAny':
      return objects.filter((obj) => {
        const arr = obj.properties[filter.field!];
        if (!Array.isArray(arr)) return false;
        return filter.values!.some((v: any) => arr.includes(v));
      });
    case 'isNull':
      return objects.filter((obj) => {
        const val = obj.properties[filter.field!];
        return filter.value ? (val === null || val === undefined) : (val !== null && val !== undefined);
      });
    case 'byId_equal':
      return objects.filter((obj) => obj.uuid === filter.value);
    case 'byId_notEqual':
      return objects.filter((obj) => obj.uuid !== filter.value);
    case 'byId_containsAny':
      return objects.filter((obj) => filter.values!.includes(obj.uuid));
    case 'and':
      return (filter.operands || []).reduce(
        (remaining, operand) => applyFilter(remaining, operand),
        objects,
      );
    case 'or':
      if (!filter.operands?.length) return objects;
      const results = new Set<string>();
      const resultObjects: MockWeaviateObject[] = [];
      for (const operand of filter.operands) {
        for (const obj of applyFilter(objects, operand)) {
          if (!results.has(obj.uuid)) {
            results.add(obj.uuid);
            resultObjects.push(obj);
          }
        }
      }
      return resultObjects;
    default:
      return objects;
  }
}

/**
 * Create a silent mock logger for tests.
 */
export function createMockLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}
