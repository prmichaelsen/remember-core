/**
 * Integration test: User Deletion (account deletion) flow.
 *
 * Creates all entity types targeted by UserDeletionService, runs deleteUserData(),
 * then verifies every entity type was cleaned up. Uses mocked Weaviate + Firestore.
 */

import type { DeleteUserDataResult } from '../../user-deletion.service.js';

// ─── Firestore Mock ─────────────────────────────────────────────────────

const firestoreStore = new Map<string, any>();

jest.mock('../../../database/firestore/init.js', () => ({
  getDocument: jest.fn(async (collectionPath: string, docId: string) => {
    return firestoreStore.get(`${collectionPath}/${docId}`) ?? null;
  }),
  setDocument: jest.fn(async (collectionPath: string, docId: string, data: any) => {
    firestoreStore.set(`${collectionPath}/${docId}`, data);
  }),
  updateDocument: jest.fn(async (collectionPath: string, docId: string, data: any) => {
    const key = `${collectionPath}/${docId}`;
    const existing = firestoreStore.get(key);
    if (!existing) throw new Error(`Document not found: ${key}`);
    firestoreStore.set(key, { ...existing, ...data });
  }),
  deleteDocument: jest.fn(async (collectionPath: string, docId: string) => {
    firestoreStore.delete(`${collectionPath}/${docId}`);
  }),
  queryDocuments: jest.fn(async (collectionPath: string, options?: any) => {
    const prefix = collectionPath + '/';
    const entries = Array.from(firestoreStore.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, data]) => ({
        id: key.slice(prefix.length),
        data,
      }));

    // Support startAfter for pagination
    let filtered = entries;
    if (options?.startAfter?.length) {
      const cursor = options.startAfter[0];
      const idx = filtered.findIndex((e) => e.id === cursor);
      if (idx >= 0) {
        filtered = filtered.slice(idx + 1);
      }
    }

    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }),
}));

jest.mock('../../../database/firestore/paths.js', () => ({
  BASE: 'test',
  getUserPreferencesPath: (userId: string) => `test.users/${userId}/preferences`,
  getUserAccessLogsPath: (userId: string) => `test.users/${userId}/access-logs`,
  getUserTrustRelationshipsPath: (userId: string) => `test.users/${userId}/trust-relationships`,
  getUserRatingsPath: (userId: string) => `test.user_ratings/${userId}/ratings`,
  getPreferenceCentroidsPath: () => 'test.preference_centroids',
  getCollectionRegistryPath: () => 'test.collection_registry',
  getMemoryRatingsPath: (memoryId: string) => `test.memory_ratings/${memoryId}/ratings`,
  getMemoryIndexPath: () => 'test.memory_index',
  getUserPermissionsPath: (ownerUserId: string) => `test.user-permissions/${ownerUserId}/allowed-accessors`,
}));

// ─── Weaviate Mock ──────────────────────────────────────────────────────

const weaviateCollections = new Set<string>();

jest.mock('../../../database/weaviate/client.js', () => ({
  getWeaviateClient: () => ({
    collections: {
      exists: jest.fn(async (name: string) => weaviateCollections.has(name)),
      delete: jest.fn(async (name: string) => { weaviateCollections.delete(name); }),
    },
  }),
}));

// ─── Collection Registry Mock ───────────────────────────────────────────

jest.mock('../../../database/collection-registry.js', () => ({
  unregisterCollection: jest.fn(async (name: string) => {
    firestoreStore.delete(`test.collection_registry/${name}`);
  }),
}));

// ─── Import after mocks ────────────────────────────────────────────────

import { UserDeletionService } from '../../user-deletion.service.js';

// ─── Helpers ────────────────────────────────────────────────────────────

const TEST_USER_ID = 'e2e-delete-user-123';
const OTHER_USER_ID = 'other-user-456';

function seed(key: string, data: any) {
  firestoreStore.set(key, data);
}

function exists(key: string): boolean {
  return firestoreStore.has(key);
}

function countKeysWithPrefix(prefix: string): number {
  return Array.from(firestoreStore.keys()).filter((k) => k.startsWith(prefix)).length;
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('User Deletion (e2e integration)', () => {
  let service: UserDeletionService;

  beforeEach(() => {
    firestoreStore.clear();
    weaviateCollections.clear();
    service = new UserDeletionService();
  });

  describe('full deletion flow — all entity types', () => {
    let result: DeleteUserDataResult;

    beforeEach(async () => {
      // ── Step 1: Create Weaviate collections ──
      weaviateCollections.add(`Memory_users_${TEST_USER_ID}`);
      weaviateCollections.add(`Memory_friends_${TEST_USER_ID}`);

      // ── Step 2: Create Firestore user-scoped data ──
      // Preferences
      seed(`test.users/${TEST_USER_ID}/preferences/theme`, { value: 'dark' });
      seed(`test.users/${TEST_USER_ID}/preferences/language`, { value: 'en' });

      // Access logs
      seed(`test.users/${TEST_USER_ID}/access-logs/log-1`, { accessed_at: '2026-03-10T00:00:00Z', accessor_id: OTHER_USER_ID });
      seed(`test.users/${TEST_USER_ID}/access-logs/log-2`, { accessed_at: '2026-03-11T00:00:00Z', accessor_id: OTHER_USER_ID });

      // Trust relationships
      seed(`test.users/${TEST_USER_ID}/trust-relationships/trust-1`, { target_id: OTHER_USER_ID, trust_level: 3 });

      // Ghost config
      seed(`test.users/${TEST_USER_ID}/ghost_config/default`, { persona: 'shadow', active: true });

      // ── Step 3: Create user ratings ──
      const memoryId1 = 'mem-aaa-111';
      const memoryId2 = 'mem-bbb-222';
      // User ratings index (user → memory)
      seed(`test.user_ratings/${TEST_USER_ID}/ratings/${memoryId1}`, { rating: 5, created_at: '2026-03-10' });
      seed(`test.user_ratings/${TEST_USER_ID}/ratings/${memoryId2}`, { rating: 3, created_at: '2026-03-11' });
      // Memory ratings (memory → user)
      seed(`test.memory_ratings/${memoryId1}/ratings/${TEST_USER_ID}`, { rating: 5 });
      seed(`test.memory_ratings/${memoryId2}/ratings/${TEST_USER_ID}`, { rating: 3 });
      // Another user's rating on same memory (should NOT be deleted)
      seed(`test.memory_ratings/${memoryId1}/ratings/${OTHER_USER_ID}`, { rating: 4 });

      // ── Step 4: Create preference centroids ──
      seed(`test.preference_centroids/${TEST_USER_ID}`, { vector: [0.1, 0.2, 0.3], updated_at: '2026-03-10' });
      // Another user's centroid (should NOT be deleted)
      seed(`test.preference_centroids/${OTHER_USER_ID}`, { vector: [0.4, 0.5, 0.6] });

      // ── Step 5: Create collection registry entries ──
      seed(`test.collection_registry/Memory_users_${TEST_USER_ID}`, {
        collection_name: `Memory_users_${TEST_USER_ID}`,
        collection_type: 'users',
        owner_id: TEST_USER_ID,
        created_at: '2026-03-01',
      });
      seed(`test.collection_registry/Memory_friends_${TEST_USER_ID}`, {
        collection_name: `Memory_friends_${TEST_USER_ID}`,
        collection_type: 'friends',
        owner_id: TEST_USER_ID,
        created_at: '2026-03-01',
      });
      // Another user's registry entry (should NOT be deleted)
      seed(`test.collection_registry/Memory_users_${OTHER_USER_ID}`, {
        collection_name: `Memory_users_${OTHER_USER_ID}`,
        collection_type: 'users',
        owner_id: OTHER_USER_ID,
        created_at: '2026-03-01',
      });

      // ── Step 6: Create memory index entries ──
      seed(`test.memory_index/mem-aaa-111`, { collection_name: `Memory_users_${TEST_USER_ID}` });
      seed(`test.memory_index/mem-bbb-222`, { collection_name: `Memory_users_${TEST_USER_ID}` });
      seed(`test.memory_index/mem-ccc-333`, { collection_name: `Memory_friends_${TEST_USER_ID}` });
      // Memory in another user's collection (should NOT be deleted)
      seed(`test.memory_index/mem-ddd-444`, { collection_name: `Memory_users_${OTHER_USER_ID}` });

      // ── Step 7: Create user permissions ──
      seed(`test.user-permissions/${TEST_USER_ID}/allowed-accessors/${OTHER_USER_ID}`, {
        accessor_id: OTHER_USER_ID,
        granted_at: '2026-03-01',
      });
      seed(`test.user-permissions/${TEST_USER_ID}/allowed-accessors/accessor-2`, {
        accessor_id: 'accessor-2',
        granted_at: '2026-03-02',
      });

      // ── Run deletion ──
      result = await service.deleteUserData({ user_id: TEST_USER_ID });
    });

    it('should succeed with no errors', () => {
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    // Weaviate collections
    it('should delete user Weaviate collections', () => {
      expect(weaviateCollections.has(`Memory_users_${TEST_USER_ID}`)).toBe(false);
      expect(weaviateCollections.has(`Memory_friends_${TEST_USER_ID}`)).toBe(false);
      expect(result.deleted.weaviate_collections).toContain(`Memory_users_${TEST_USER_ID}`);
      expect(result.deleted.weaviate_collections).toContain(`Memory_friends_${TEST_USER_ID}`);
    });

    // Firestore user-scoped data
    it('should delete preferences', () => {
      expect(countKeysWithPrefix(`test.users/${TEST_USER_ID}/preferences/`)).toBe(0);
    });

    it('should delete access logs', () => {
      expect(countKeysWithPrefix(`test.users/${TEST_USER_ID}/access-logs/`)).toBe(0);
    });

    it('should delete trust relationships', () => {
      expect(countKeysWithPrefix(`test.users/${TEST_USER_ID}/trust-relationships/`)).toBe(0);
    });

    it('should delete ghost config', () => {
      expect(countKeysWithPrefix(`test.users/${TEST_USER_ID}/ghost_config/`)).toBe(0);
    });

    // Ratings
    it('should retract all user ratings from both indexes', () => {
      expect(result.deleted.ratings_retracted).toBe(2);
      // User ratings index cleared
      expect(countKeysWithPrefix(`test.user_ratings/${TEST_USER_ID}/ratings/`)).toBe(0);
      // Memory ratings for this user cleared
      expect(exists(`test.memory_ratings/mem-aaa-111/ratings/${TEST_USER_ID}`)).toBe(false);
      expect(exists(`test.memory_ratings/mem-bbb-222/ratings/${TEST_USER_ID}`)).toBe(false);
    });

    it('should preserve other users\' ratings on the same memories', () => {
      expect(exists(`test.memory_ratings/mem-aaa-111/ratings/${OTHER_USER_ID}`)).toBe(true);
    });

    // Preference centroids
    it('should delete user preference centroid', () => {
      expect(exists(`test.preference_centroids/${TEST_USER_ID}`)).toBe(false);
    });

    it('should preserve other users\' preference centroids', () => {
      expect(exists(`test.preference_centroids/${OTHER_USER_ID}`)).toBe(true);
    });

    // Collection registry
    it('should delete user collection registry entries', () => {
      expect(exists(`test.collection_registry/Memory_users_${TEST_USER_ID}`)).toBe(false);
      expect(exists(`test.collection_registry/Memory_friends_${TEST_USER_ID}`)).toBe(false);
    });

    it('should preserve other users\' collection registry entries', () => {
      expect(exists(`test.collection_registry/Memory_users_${OTHER_USER_ID}`)).toBe(true);
    });

    // Memory index
    it('should delete memory index entries for user collections', () => {
      expect(exists('test.memory_index/mem-aaa-111')).toBe(false);
      expect(exists('test.memory_index/mem-bbb-222')).toBe(false);
      expect(exists('test.memory_index/mem-ccc-333')).toBe(false);
    });

    it('should preserve memory index entries for other users', () => {
      expect(exists('test.memory_index/mem-ddd-444')).toBe(true);
    });

    // User permissions
    it('should delete all user permissions', () => {
      expect(countKeysWithPrefix(`test.user-permissions/${TEST_USER_ID}/allowed-accessors/`)).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('should succeed on second run with no data', async () => {
      // Run once on empty state
      const result = await service.deleteUserData({ user_id: TEST_USER_ID });
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);

      // Run again — still succeeds
      const result2 = await service.deleteUserData({ user_id: TEST_USER_ID });
      expect(result2.success).toBe(true);
      expect(result2.errors).toEqual([]);
    });

    it('should succeed when run twice with initial data', async () => {
      // Seed some data
      weaviateCollections.add(`Memory_users_${TEST_USER_ID}`);
      seed(`test.users/${TEST_USER_ID}/preferences/theme`, { value: 'dark' });
      seed(`test.collection_registry/Memory_users_${TEST_USER_ID}`, {
        collection_name: `Memory_users_${TEST_USER_ID}`,
        collection_type: 'users',
        owner_id: TEST_USER_ID,
        created_at: '2026-03-01',
      });

      const result1 = await service.deleteUserData({ user_id: TEST_USER_ID });
      expect(result1.success).toBe(true);

      const result2 = await service.deleteUserData({ user_id: TEST_USER_ID });
      expect(result2.success).toBe(true);
    });
  });

  describe('partial data', () => {
    it('handles user with only Weaviate collections (no Firestore data)', async () => {
      weaviateCollections.add(`Memory_users_${TEST_USER_ID}`);

      const result = await service.deleteUserData({ user_id: TEST_USER_ID });
      expect(result.success).toBe(true);
      expect(result.deleted.weaviate_collections).toContain(`Memory_users_${TEST_USER_ID}`);
      expect(weaviateCollections.has(`Memory_users_${TEST_USER_ID}`)).toBe(false);
    });

    it('handles user with only Firestore data (no Weaviate collections)', async () => {
      seed(`test.users/${TEST_USER_ID}/preferences/theme`, { value: 'dark' });
      seed(`test.user_ratings/${TEST_USER_ID}/ratings/mem-1`, { rating: 5 });
      seed(`test.memory_ratings/mem-1/ratings/${TEST_USER_ID}`, { rating: 5 });

      const result = await service.deleteUserData({ user_id: TEST_USER_ID });
      expect(result.success).toBe(true);
      expect(result.deleted.ratings_retracted).toBe(1);
      expect(countKeysWithPrefix(`test.users/${TEST_USER_ID}/preferences/`)).toBe(0);
    });

    it('handles user with registry-owned collections beyond default two', async () => {
      // Default collections
      weaviateCollections.add(`Memory_users_${TEST_USER_ID}`);
      weaviateCollections.add(`Memory_friends_${TEST_USER_ID}`);
      // Extra collection found via registry scan
      const extraCollection = `Memory_groups_team-alpha`;
      weaviateCollections.add(extraCollection);
      seed(`test.collection_registry/${extraCollection}`, {
        collection_name: extraCollection,
        collection_type: 'groups',
        owner_id: TEST_USER_ID,
        created_at: '2026-03-01',
      });

      const result = await service.deleteUserData({ user_id: TEST_USER_ID });
      expect(result.success).toBe(true);
      expect(result.deleted.weaviate_collections).toContain(extraCollection);
      expect(weaviateCollections.has(extraCollection)).toBe(false);
    });
  });
});
