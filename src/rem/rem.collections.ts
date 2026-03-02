/**
 * REM collection enumeration.
 *
 * Lists all Weaviate memory collections (user, group, space)
 * for REM's round-robin processing.
 */

import type { WeaviateClient } from 'weaviate-client';

const MEMORY_COLLECTION_PATTERN = /^Memory_(users_|spaces_|groups_)/;

/**
 * List all Weaviate collections matching memory collection naming patterns.
 * Returns sorted collection names for stable cursor ordering.
 */
export async function listMemoryCollections(
  client: WeaviateClient,
): Promise<string[]> {
  const all = await client.collections.listAll();
  const names = all
    .map((c: any) => c.name ?? c)
    .filter((name: string) => MEMORY_COLLECTION_PATTERN.test(name));
  names.sort();
  return names;
}
