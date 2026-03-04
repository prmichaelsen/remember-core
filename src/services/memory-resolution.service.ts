/**
 * MemoryResolutionService — cross-collection memory lookup with fallback.
 *
 * Resolves a memory by ID, trying the collection indicated by source params
 * (author/space/group) first, then falling back to the user's own collection
 * if the primary lookup returns nothing.
 *
 * This handles the case where agents (LLMs) construct memory links with
 * incorrect context params — the memory exists but in a different collection.
 */

import type { Logger } from '../utils/logger.js';
import { CollectionType, getCollectionName } from '../collections/dot-notation.js';
import { fetchMemoryWithAllProperties } from '../database/weaviate/client.js';

export interface MemorySource {
  author?: string | null;
  space?: string | null;
  group?: string | null;
}

export interface ResolvedMemory {
  /** The memory object with id + all properties */
  memory: Record<string, unknown>;
  /** The collection name where the memory was found */
  collectionName: string;
}

export class MemoryResolutionService {
  constructor(
    private weaviateClient: any,
    private userId: string,
    private logger: Logger,
  ) {}

  /**
   * Resolve collection name from source params.
   * Priority: group → space → author → user's own.
   */
  resolveCollectionName(source?: MemorySource): string {
    if (source?.group) return getCollectionName(CollectionType.GROUPS, source.group);
    if (source?.space) return getCollectionName(CollectionType.SPACES);
    if (source?.author) return getCollectionName(CollectionType.USERS, source.author);
    return getCollectionName(CollectionType.USERS, this.userId);
  }

  /**
   * Fetch memory by ID with cross-collection fallback.
   *
   * 1. Try the collection indicated by source params
   * 2. If not found AND source params were provided, try user's own collection
   * 3. Return resolved memory + collection name, or null
   */
  async resolve(memoryId: string, source?: MemorySource): Promise<ResolvedMemory | null> {
    const primaryName = this.resolveCollectionName(source);
    const primary = this.weaviateClient.collections.get(primaryName);

    try {
      const existing = await fetchMemoryWithAllProperties(primary, memoryId);
      if (existing?.properties) {
        return {
          memory: { id: existing.uuid, ...existing.properties },
          collectionName: primaryName,
        };
      }
    } catch (err) {
      this.logger.debug?.(`[MemoryResolution] Primary lookup failed in ${primaryName}: ${err}`);
    }

    // Fallback: try user's own collection if context params were provided
    const hasContext = source?.author || source?.space || source?.group;
    if (!hasContext) return null;

    const userColName = getCollectionName(CollectionType.USERS, this.userId);
    if (userColName === primaryName) return null; // Already tried

    this.logger.debug?.(`[MemoryResolution] Fallback: ${primaryName} → ${userColName}`);

    try {
      const userCol = this.weaviateClient.collections.get(userColName);
      const fallback = await fetchMemoryWithAllProperties(userCol, memoryId);
      if (fallback?.properties) {
        return {
          memory: { id: fallback.uuid, ...fallback.properties },
          collectionName: userColName,
        };
      }
    } catch (err) {
      this.logger.debug?.(`[MemoryResolution] Fallback lookup failed in ${userColName}: ${err}`);
    }

    return null;
  }
}
