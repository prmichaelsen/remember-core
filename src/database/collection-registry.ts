/**
 * Collection Registry — lightweight Firestore-backed index of Weaviate memory collections.
 *
 * Instead of calling Weaviate's listAll() (which returns full schema metadata for every
 * collection), REM queries this registry for O(1) cursor-based collection enumeration.
 *
 * Entries are written when a collection is first created via ensure*Collection().
 * No backfill is needed — in e1, collections are deleted and recreated (hard cutover).
 */

import { setDocument, deleteDocument, queryDocuments } from './firestore/init.js';
import { getCollectionRegistryPath } from './firestore/paths.js';

export type CollectionRegistryEntry = {
  collection_name: string;
  collection_type: 'users' | 'spaces' | 'groups';
  owner_id: string | null;
  created_at: string;
};

/**
 * Register a collection in the Firestore registry.
 * Idempotent — uses collection_name as the document ID.
 */
export async function registerCollection(entry: CollectionRegistryEntry): Promise<void> {
  const path = getCollectionRegistryPath();
  await setDocument(path, entry.collection_name, entry as any);
}

/**
 * Get the next registered collection after the given cursor (alphabetical order).
 * Returns null if the registry is empty.
 * Wraps around to the first collection if no collection exists after the cursor.
 */
export async function getNextRegisteredCollection(
  afterName: string | null,
): Promise<string | null> {
  const path = getCollectionRegistryPath();

  if (afterName) {
    // Get next collection after cursor
    const results = await queryDocuments(path, {
      orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
      startAfter: [afterName],
      limit: 1,
    });
    if (results.length > 0) return results[0].id;

    // Wrap-around: start from beginning
    const first = await queryDocuments(path, {
      orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
      limit: 1,
    });
    return first.length > 0 ? first[0].id : null;
  }

  // No cursor — return first collection
  const results = await queryDocuments(path, {
    orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
    limit: 1,
  });
  return results.length > 0 ? results[0].id : null;
}

/**
 * Remove a collection from the registry.
 */
export async function unregisterCollection(name: string): Promise<void> {
  const path = getCollectionRegistryPath();
  await deleteDocument(path, name);
}
