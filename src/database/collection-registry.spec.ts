import {
  registerCollection,
  getNextRegisteredCollection,
  unregisterCollection,
} from './collection-registry.js';

// Mock Firestore
jest.mock('./firestore/init.js', () => {
  const store = new Map<string, any>();
  return {
    setDocument: jest.fn(async (collectionPath: string, docId: string, data: any) => {
      store.set(`${collectionPath}/${docId}`, { id: docId, data });
    }),
    deleteDocument: jest.fn(async (collectionPath: string, docId: string) => {
      store.delete(`${collectionPath}/${docId}`);
    }),
    queryDocuments: jest.fn(async (collectionPath: string, options: any) => {
      const entries = Array.from(store.entries())
        .filter(([key]) => key.startsWith(collectionPath + '/'))
        .map(([, value]) => value);

      // Sort by collection_name ascending
      entries.sort((a: any, b: any) =>
        (a.data.collection_name as string).localeCompare(b.data.collection_name as string),
      );

      // Apply startAfter cursor
      let filtered = entries;
      if (options?.startAfter?.length) {
        const cursor = options.startAfter[0];
        const idx = filtered.findIndex(
          (e: any) => (e.data.collection_name as string) > cursor,
        );
        filtered = idx >= 0 ? filtered.slice(idx) : [];
      }

      // Apply limit
      if (options?.limit) {
        filtered = filtered.slice(0, options.limit);
      }

      return filtered;
    }),
    __store: store,
  };
});

describe('Collection Registry', () => {
  beforeEach(() => {
    const { __store } = require('./firestore/init.js');
    __store.clear();
  });

  describe('registerCollection', () => {
    it('writes entry to Firestore', async () => {
      await registerCollection({
        collection_name: 'Memory_users_alice',
        collection_type: 'users',
        owner_id: 'alice',
        created_at: '2026-01-01T00:00:00.000Z',
      });

      const { __store } = require('./firestore/init.js');
      const keys = Array.from(__store.keys()) as string[];
      const key = keys.find((k) => k.includes('Memory_users_alice'));
      expect(key).toBeDefined();
    });

    it('is idempotent (overwrites same doc)', async () => {
      const entry = {
        collection_name: 'Memory_users_alice',
        collection_type: 'users' as const,
        owner_id: 'alice',
        created_at: '2026-01-01T00:00:00.000Z',
      };

      await registerCollection(entry);
      await registerCollection(entry);

      const { __store } = require('./firestore/init.js');
      const keys = Array.from(__store.keys()) as string[];
      const matches = keys.filter((k) => k.includes('Memory_users_alice'));
      expect(matches.length).toBe(1);
    });
  });

  describe('getNextRegisteredCollection', () => {
    async function seedCollections(names: string[]) {
      for (const name of names) {
        await registerCollection({
          collection_name: name,
          collection_type: 'users',
          owner_id: null,
          created_at: new Date().toISOString(),
        });
      }
    }

    it('returns null when registry is empty', async () => {
      const result = await getNextRegisteredCollection(null);
      expect(result).toBeNull();
    });

    it('returns first collection when cursor is null', async () => {
      await seedCollections([
        'Memory_users_charlie',
        'Memory_users_alice',
        'Memory_users_bob',
      ]);

      const result = await getNextRegisteredCollection(null);
      expect(result).toBe('Memory_users_alice');
    });

    it('returns next collection after cursor', async () => {
      await seedCollections([
        'Memory_users_alice',
        'Memory_users_bob',
        'Memory_users_charlie',
      ]);

      const result = await getNextRegisteredCollection('Memory_users_alice');
      expect(result).toBe('Memory_users_bob');
    });

    it('wraps around to first when cursor is at last', async () => {
      await seedCollections([
        'Memory_users_alice',
        'Memory_users_bob',
        'Memory_users_charlie',
      ]);

      const result = await getNextRegisteredCollection('Memory_users_charlie');
      expect(result).toBe('Memory_users_alice');
    });

    it('wraps around when cursor name does not exist but is past all entries', async () => {
      await seedCollections([
        'Memory_users_alice',
        'Memory_users_bob',
      ]);

      const result = await getNextRegisteredCollection('Memory_users_zzz');
      expect(result).toBe('Memory_users_alice');
    });
  });

  describe('unregisterCollection', () => {
    it('removes entry from registry', async () => {
      await registerCollection({
        collection_name: 'Memory_users_alice',
        collection_type: 'users',
        owner_id: 'alice',
        created_at: '2026-01-01T00:00:00.000Z',
      });

      await unregisterCollection('Memory_users_alice');

      const result = await getNextRegisteredCollection(null);
      expect(result).toBeNull();
    });
  });
});
