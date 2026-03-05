/**
 * MemoryIndexService — Firestore lookup table for memory UUID → collection name.
 *
 * Enables O(1) cross-collection memory resolution. Every memory's UUID maps
 * to the Weaviate collection it lives in, eliminating the need to guess
 * or try multiple collections.
 */

import { getDocument, setDocument } from '../database/firestore/init.js';
import { getMemoryIndexPath } from '../database/firestore/paths.js';
import type { Logger } from '../utils/logger.js';

export interface MemoryIndexEntry {
  collection_name: string;
  created_at: string;
}

export class MemoryIndexService {
  private readonly collectionPath: string;

  constructor(private logger: Logger) {
    this.collectionPath = getMemoryIndexPath();
  }

  /**
   * Index a memory UUID → collection name mapping.
   * Uses set() for idempotency (safe to re-index).
   */
  async index(memoryUuid: string, collectionName: string): Promise<void> {
    const entry: MemoryIndexEntry = {
      collection_name: collectionName,
      created_at: new Date().toISOString(),
    };
    await setDocument(this.collectionPath, memoryUuid, entry as any);
    this.logger.debug?.(`[MemoryIndex] Indexed ${memoryUuid} → ${collectionName}`);
  }

  /**
   * Look up the collection name for a memory UUID.
   * Returns null if the memory is not indexed.
   */
  async lookup(memoryUuid: string): Promise<string | null> {
    const doc = await getDocument(this.collectionPath, memoryUuid);
    if (!doc) return null;
    const entry = doc as unknown as MemoryIndexEntry;
    return entry.collection_name ?? null;
  }
}
