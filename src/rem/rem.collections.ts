/**
 * REM collection enumeration.
 *
 * Uses the Firestore collection registry for O(1) cursor-based
 * collection lookup instead of loading all Weaviate schemas.
 */

import { getNextRegisteredCollection } from '../database/collection-registry.js';

/**
 * Get the next memory collection after the given cursor.
 * Returns null if the registry is empty.
 * Wraps around to the first collection when the cursor is past the last.
 */
export async function getNextMemoryCollection(
  afterName: string | null,
): Promise<string | null> {
  return getNextRegisteredCollection(afterName);
}
