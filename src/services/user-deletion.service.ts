/**
 * UserDeletionService — bulk-deletes all user data from Weaviate and Firestore.
 *
 * Used for account deletion. Hard-deletes everything: Weaviate collections,
 * Firestore user-scoped data, ratings, preference centroids, collection registry entries.
 *
 * Designed to be idempotent — safe to call multiple times on the same user.
 */

import { getWeaviateClient } from '../database/weaviate/client.js';
import {
  deleteDocument,
  queryDocuments,
} from '../database/firestore/init.js';
import {
  BASE,
  getUserPreferencesPath,
  getUserAccessLogsPath,
  getUserTrustRelationshipsPath,
  getUserRatingsPath,
  getPreferenceCentroidsPath,
  getCollectionRegistryPath,
  getMemoryRatingsPath,
  getMemoryIndexPath,
  getUserPermissionsPath,
} from '../database/firestore/paths.js';
import { unregisterCollection } from '../database/collection-registry.js';
import { getCollectionName, CollectionType } from '../collections/dot-notation.js';

export interface DeleteUserDataInput {
  user_id: string;
}

export interface DeleteUserDataResult {
  success: boolean;
  deleted: {
    weaviate_collections: string[];
    firestore_paths: string[];
    ratings_retracted: number;
  };
  errors: string[];
}

export class UserDeletionService {
  /**
   * Delete all user data from Weaviate and Firestore.
   */
  async deleteUserData(input: DeleteUserDataInput): Promise<DeleteUserDataResult> {
    const { user_id } = input;
    const result: DeleteUserDataResult = {
      success: true,
      deleted: {
        weaviate_collections: [],
        firestore_paths: [],
        ratings_retracted: 0,
      },
      errors: [],
    };

    // Step 1: Delete Weaviate collections
    await this.deleteWeaviateCollections(user_id, result);

    // Step 2: Delete Firestore user-scoped data
    await this.deleteFirestoreUserData(user_id, result);

    // Step 3: Retract all user ratings
    await this.retractAllUserRatings(user_id, result);

    // Step 4: Clean up preference centroids
    await this.deletePreferenceCentroids(user_id, result);

    // Step 5: Clean up collection registry entries owned by user
    await this.deleteCollectionRegistryEntries(user_id, result);

    // Step 6: Clean up memory index entries for user's memories
    await this.deleteMemoryIndexEntries(user_id, result);

    // Step 7: Clean up user permissions
    await this.deleteUserPermissions(user_id, result);

    result.success = result.errors.length === 0;
    return result;
  }

  private async deleteWeaviateCollections(
    userId: string,
    result: DeleteUserDataResult,
  ): Promise<void> {
    const client = getWeaviateClient();

    // Known per-user collection patterns
    const collections = [
      getCollectionName(CollectionType.USERS, userId),      // Memory_users_{userId}
      getCollectionName(CollectionType.FRIENDS, userId),     // Memory_friends_{userId}
    ];

    // Also check registry for any other collections owned by this user
    try {
      const registryPath = getCollectionRegistryPath();
      let hasMore = true;
      let lastDoc: string | null = null;

      while (hasMore) {
        const docs = await queryDocuments(registryPath, {
          orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
          ...(lastDoc ? { startAfter: [lastDoc] } : {}),
          limit: 100,
        });

        for (const doc of docs) {
          const data = doc.data as Record<string, unknown>;
          if (data.owner_id === userId) {
            const name = data.collection_name as string;
            if (!collections.includes(name)) {
              collections.push(name);
            }
          }
        }

        hasMore = docs.length === 100;
        if (docs.length > 0) {
          lastDoc = docs[docs.length - 1].id;
        }
      }
    } catch (err) {
      result.errors.push(`registry scan: ${err instanceof Error ? err.message : String(err)}`);
    }

    for (const collectionName of collections) {
      try {
        const exists = await client.collections.exists(collectionName);
        if (exists) {
          await client.collections.delete(collectionName);
          result.deleted.weaviate_collections.push(collectionName);
        }
        // Also unregister from Firestore registry
        await unregisterCollection(collectionName);
      } catch (err) {
        result.errors.push(
          `weaviate delete ${collectionName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async deleteFirestoreUserData(
    userId: string,
    result: DeleteUserDataResult,
  ): Promise<void> {
    // User-scoped subcollections under {BASE}.users/{userId}/
    const subcollections = [
      { path: getUserPreferencesPath(userId), name: 'preferences' },
      { path: getUserAccessLogsPath(userId), name: 'access-logs' },
      { path: getUserTrustRelationshipsPath(userId), name: 'trust-relationships' },
      { path: `${BASE}.users/${userId}/ghost_config`, name: 'ghost_config' },
    ];

    for (const { path, name } of subcollections) {
      try {
        await this.deleteAllDocumentsInCollection(path);
        result.deleted.firestore_paths.push(name);
      } catch (err) {
        result.errors.push(
          `firestore ${name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async retractAllUserRatings(
    userId: string,
    result: DeleteUserDataResult,
  ): Promise<void> {
    try {
      const userRatingsPath = getUserRatingsPath(userId);
      let retracted = 0;

      // Paginate through all ratings by this user
      let hasMore = true;
      let lastDoc: string | null = null;

      while (hasMore) {
        const docs = await queryDocuments(userRatingsPath, {
          orderBy: [{ field: '__name__', direction: 'ASCENDING' }],
          ...(lastDoc ? { startAfter: [lastDoc] } : {}),
          limit: 100,
        });

        for (const doc of docs) {
          const memoryId = doc.id;

          // Delete from memory_ratings/{memoryId}/ratings/{userId}
          try {
            const memRatingsPath = getMemoryRatingsPath(memoryId);
            await deleteDocument(memRatingsPath, userId);
          } catch {
            // Memory may already be deleted — skip silently
          }

          // Delete from user_ratings/{userId}/ratings/{memoryId}
          await deleteDocument(userRatingsPath, memoryId);
          retracted++;
        }

        hasMore = docs.length === 100;
        if (docs.length > 0) {
          lastDoc = docs[docs.length - 1].id;
        }
      }

      result.deleted.ratings_retracted = retracted;
      if (retracted > 0) {
        result.deleted.firestore_paths.push('user_ratings');
        result.deleted.firestore_paths.push('memory_ratings (user entries)');
      }
    } catch (err) {
      result.errors.push(`ratings retraction: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async deletePreferenceCentroids(
    userId: string,
    result: DeleteUserDataResult,
  ): Promise<void> {
    try {
      const centroidsPath = getPreferenceCentroidsPath();
      await deleteDocument(centroidsPath, userId);
      result.deleted.firestore_paths.push('preference_centroids');
    } catch (err) {
      result.errors.push(
        `preference centroids: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async deleteCollectionRegistryEntries(
    userId: string,
    result: DeleteUserDataResult,
  ): Promise<void> {
    try {
      const registryPath = getCollectionRegistryPath();
      let hasMore = true;
      let lastDoc: string | null = null;
      let deleted = 0;

      while (hasMore) {
        const docs = await queryDocuments(registryPath, {
          orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
          ...(lastDoc ? { startAfter: [lastDoc] } : {}),
          limit: 100,
        });

        for (const doc of docs) {
          const data = doc.data as Record<string, unknown>;
          if (data.owner_id === userId) {
            await deleteDocument(registryPath, doc.id);
            deleted++;
          }
        }

        hasMore = docs.length === 100;
        if (docs.length > 0) {
          lastDoc = docs[docs.length - 1].id;
        }
      }

      if (deleted > 0) {
        result.deleted.firestore_paths.push(`collection_registry (${deleted} entries)`);
      }
    } catch (err) {
      result.errors.push(
        `collection registry: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async deleteMemoryIndexEntries(
    userId: string,
    result: DeleteUserDataResult,
  ): Promise<void> {
    try {
      const indexPath = getMemoryIndexPath();
      // Memory index entries have collection_name containing the userId
      // We need to find entries pointing to this user's collections
      const userCollectionPrefix = `Memory_users_${userId}`;
      const friendsCollectionPrefix = `Memory_friends_${userId}`;

      let hasMore = true;
      let lastDoc: string | null = null;
      let deleted = 0;

      while (hasMore) {
        const docs = await queryDocuments(indexPath, {
          orderBy: [{ field: '__name__', direction: 'ASCENDING' }],
          ...(lastDoc ? { startAfter: [lastDoc] } : {}),
          limit: 500,
        });

        for (const doc of docs) {
          const data = doc.data as Record<string, unknown>;
          const collectionName = data.collection_name as string;
          if (
            collectionName === userCollectionPrefix ||
            collectionName === friendsCollectionPrefix
          ) {
            await deleteDocument(indexPath, doc.id);
            deleted++;
          }
        }

        hasMore = docs.length === 500;
        if (docs.length > 0) {
          lastDoc = docs[docs.length - 1].id;
        }
      }

      if (deleted > 0) {
        result.deleted.firestore_paths.push(`memory_index (${deleted} entries)`);
      }
    } catch (err) {
      result.errors.push(
        `memory index: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async deleteUserPermissions(
    userId: string,
    result: DeleteUserDataResult,
  ): Promise<void> {
    try {
      // Delete permissions where this user is the owner
      const ownerPermissionsPath = getUserPermissionsPath(userId);
      await this.deleteAllDocumentsInCollection(ownerPermissionsPath);
      result.deleted.firestore_paths.push('user-permissions (as owner)');
    } catch (err) {
      result.errors.push(
        `user permissions: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Delete all documents in a Firestore collection (paginated).
   */
  private async deleteAllDocumentsInCollection(collectionPath: string): Promise<number> {
    let deleted = 0;
    let hasMore = true;

    while (hasMore) {
      const docs = await queryDocuments(collectionPath, {
        limit: 500,
      });

      for (const doc of docs) {
        await deleteDocument(collectionPath, doc.id);
        deleted++;
      }

      hasMore = docs.length === 500;
    }

    return deleted;
  }
}
