/**
 * Source-ID deduplication for aggregate feed results.
 *
 * Deduplicates memories from multiple collections by original_memory_id,
 * using precedence: space > group > personal.
 */

import { getCollectionType } from '../database/weaviate/v2-collections.js';

export interface DedupeOptions {
  /** Enable/disable deduplication (default: true) */
  enabled?: boolean;
  /** Group ID the user is currently viewing (for same-tier sub-precedence) */
  viewingGroupId?: string;
}

export interface DedupeAlsoIn {
  source: string; // collection name
  id: string;     // memory UUID
}

/**
 * Tag a Weaviate result object with its source collection name.
 */
export function tagWithSource<T extends { uuid: string }>(
  objects: T[],
  collectionName: string,
): Array<T & { _collectionName: string }> {
  return objects.map((obj) => ({ ...obj, _collectionName: collectionName }));
}

/**
 * Get precedence tier for a collection.
 * Lower number = higher precedence.
 */
function getTier(collectionName: string): number {
  try {
    const type = getCollectionType(collectionName);
    switch (type) {
      case 'spaces': return 1;
      case 'groups': return 2;
      case 'friends': return 3;
      case 'users': return 4;
    }
  } catch {
    return 5; // unknown — lowest
  }
}

/**
 * Extract group ID from a collection name like "Memory_groups_abc123".
 */
function extractGroupId(collectionName: string): string | null {
  if (collectionName.startsWith('Memory_groups_')) {
    return collectionName.replace('Memory_groups_', '');
  }
  return null;
}

/**
 * Compare two memories and return the winner based on precedence.
 * Returns true if `a` should win over `b`.
 */
function shouldPrefer(
  aCollection: string,
  bCollection: string,
  viewingGroupId?: string,
): boolean {
  const aTier = getTier(aCollection);
  const bTier = getTier(bCollection);

  if (aTier !== bTier) return aTier < bTier;

  // Same tier — sub-precedence
  if (viewingGroupId) {
    const aGroup = extractGroupId(aCollection);
    const bGroup = extractGroupId(bCollection);
    if (aGroup === viewingGroupId && bGroup !== viewingGroupId) return true;
    if (bGroup === viewingGroupId && aGroup !== viewingGroupId) return false;
  }

  // Fallback: alphanumeric sort of collection name
  return aCollection <= bCollection;
}

/**
 * Deduplicate memories by original_memory_id with precedence rules.
 *
 * Objects must be tagged with `_collectionName` (use `tagWithSource`).
 * Memories without original_memory_id (originals) pass through without deduplication.
 *
 * Returns the original objects (preserving order of winners) with
 * `_also_in` metadata attached to winners.
 */
export function dedupeBySourceId<
  T extends { uuid: string; properties: Record<string, unknown>; _collectionName: string },
>(
  objects: T[],
  options: DedupeOptions = {},
): Array<T & { _also_in?: DedupeAlsoIn[] }> {
  if (options.enabled === false) return objects;

  const sourceMap = new Map<string, { winner: T & { _also_in: DedupeAlsoIn[] }; index: number }>();
  const results: Array<{ obj: T & { _also_in?: DedupeAlsoIn[] }; index: number }> = [];
  const deduped = new Set<string>(); // UUIDs of losers

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const sourceId = obj.properties.original_memory_id as string | undefined;

    if (!sourceId) {
      results.push({ obj, index: i });
      continue;
    }

    const existing = sourceMap.get(sourceId);
    if (!existing) {
      const tagged = { ...obj, _also_in: [] as DedupeAlsoIn[] };
      sourceMap.set(sourceId, { winner: tagged, index: i });
      results.push({ obj: tagged, index: i });
      continue;
    }

    // Determine winner
    if (shouldPrefer(obj._collectionName, existing.winner._collectionName, options.viewingGroupId)) {
      // New object wins — demote existing
      existing.winner._also_in.push({
        source: obj._collectionName,
        id: obj.uuid,
      });
      // Swap: new becomes winner, old becomes also_in
      const loser = existing.winner;
      const newWinner = {
        ...obj,
        _also_in: [
          ...existing.winner._also_in.filter(a => a.id !== obj.uuid),
          { source: loser._collectionName, id: loser.uuid },
        ],
      };
      deduped.add(loser.uuid);
      deduped.delete(obj.uuid);
      sourceMap.set(sourceId, { winner: newWinner, index: i });
      // Replace the old winner's slot with the new winner
      const oldSlot = results.find(r => r.obj.uuid === loser.uuid);
      if (oldSlot) {
        oldSlot.obj = newWinner;
        oldSlot.index = i;
      }
    } else {
      // Existing wins — add new to also_in
      existing.winner._also_in.push({
        source: obj._collectionName,
        id: obj.uuid,
      });
      deduped.add(obj.uuid);
    }
  }

  return results
    .filter((r) => !deduped.has(r.obj.uuid))
    .map((r) => r.obj);
}
