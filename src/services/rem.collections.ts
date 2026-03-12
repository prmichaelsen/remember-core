/**
 * Collection enumeration via Weaviate API.
 *
 * Lists memory collections directly from Weaviate (source of truth)
 * and yields them as an async iterable for scanners and job schedulers.
 */

import type { WeaviateClient } from 'weaviate-client';
import { getNextRegisteredCollection } from '../database/collection-registry.js';

const MEMORY_COLLECTION_PREFIX = 'Memory_';

/**
 * Async generator that yields all memory collection names from Weaviate.
 * Filters to collections matching the Memory_* naming convention.
 */
export async function* enumerateAllCollections(
  weaviateClient: WeaviateClient,
): AsyncIterable<string> {
  const all = await (weaviateClient.collections as any).listAll();
  for (const col of all) {
    if (col.name.startsWith(MEMORY_COLLECTION_PREFIX)) {
      yield col.name;
    }
  }
}

/**
 * @deprecated Use enumerateAllCollections() instead. This function returns
 * only one collection per call with wrap-around semantics, making it
 * unsuitable for full-scan use cases like the follow-up scheduler.
 */
export async function getNextMemoryCollection(
  afterName: string | null,
): Promise<string | null> {
  return getNextRegisteredCollection(afterName);
}
