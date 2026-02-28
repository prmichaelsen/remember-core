/**
 * Mock Weaviate collection for unit testing.
 *
 * Provides an in-memory implementation of the Weaviate v3 collection API
 * used by MemoryService, RelationshipService, and SpaceService.
 */

import { randomUUID } from 'crypto';

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

    query: {
      async fetchObjectById(
        id: string,
        _opts?: { returnProperties?: string[] },
      ): Promise<MockWeaviateObject | null> {
        return store.get(id) ?? null;
      },

      async fetchObjects(
        opts?: { filters?: any; limit?: number },
      ): Promise<{ objects: MockWeaviateObject[] }> {
        let objects = Array.from(store.values());
        if (opts?.filters) {
          objects = applyFilter(objects, opts.filters);
        }
        if (opts?.limit) {
          objects = objects.slice(0, opts.limit);
        }
        return { objects };
      },

      async hybrid(
        _query: string,
        opts?: { alpha?: number; limit?: number; filters?: any },
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
        if (opts?.limit) {
          objects = objects.slice(0, opts.limit);
        }
        return { objects };
      },

      async nearText(
        _query: string | string[],
        opts?: { limit?: number; distance?: number; returnMetadata?: string[]; filters?: any },
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
        if (opts?.limit) {
          objects = objects.slice(0, opts.limit);
        }
        return { objects };
      },

      async nearObject(
        _id: string,
        opts?: { limit?: number; distance?: number; returnMetadata?: string[]; filters?: any },
      ): Promise<{ objects: MockWeaviateObject[] }> {
        let objects = Array.from(store.values());
        if (opts?.filters) {
          objects = applyFilter(objects, opts.filters);
        }
        objects = objects.map((obj, i) => ({
          ...obj,
          metadata: { ...obj.metadata, distance: i * 0.1 },
        }));
        if (opts?.limit) {
          objects = objects.slice(0, opts.limit);
        }
        return { objects };
      },

      async bm25(
        _query: string,
        opts?: { limit?: number; filters?: any },
      ): Promise<{ objects: MockWeaviateObject[] }> {
        let objects = Array.from(store.values());
        if (opts?.filters) {
          objects = applyFilter(objects, opts.filters);
        }
        if (opts?.limit) {
          objects = objects.slice(0, opts.limit);
        }
        return { objects };
      },
    },

    filter: {
      byProperty(name: string) {
        return {
          equal(value: any) {
            return { _type: 'equal', field: name, value };
          },
          notEqual(value: any) {
            return { _type: 'notEqual', field: name, value };
          },
          greaterOrEqual(value: any) {
            return { _type: 'gte', field: name, value };
          },
          lessOrEqual(value: any) {
            return { _type: 'lte', field: name, value };
          },
          lessThanOrEqual(value: any) {
            return { _type: 'lte', field: name, value };
          },
          containsAny(values: any[]) {
            return { _type: 'containsAny', field: name, values };
          },
          isNull(value: boolean) {
            return { _type: 'isNull', field: name, value };
          },
        };
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
    case 'gte':
      return objects.filter((obj) => obj.properties[filter.field!] >= filter.value);
    case 'lte':
      return objects.filter((obj) => obj.properties[filter.field!] <= filter.value);
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
