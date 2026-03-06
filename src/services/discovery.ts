/**
 * byDiscovery sort mode — interleaving algorithm.
 *
 * Merges a rated pool (proven content sorted by Bayesian average)
 * with a discovery pool (unproven content sorted by recency)
 * at a configurable ratio (default 4:1).
 */

// ─── Constants ──────────────────────────────────────────────────────────

/** Default ratio of rated:discovery items. Every (RATIO+1)th item is discovery. */
export const DISCOVERY_RATIO = 4;

/** Minimum rating_count to be considered "rated" (proven). */
export const DISCOVERY_THRESHOLD = 5;

// ─── Types ──────────────────────────────────────────────────────────────

export interface InterleaveOptions<T> {
  rated: T[];
  discovery: T[];
  ratio?: number;
  offset?: number;
  limit?: number;
}

export interface DiscoveryItem<T> {
  item: T;
  is_discovery: boolean;
}

// ─── Interleave ─────────────────────────────────────────────────────────

/**
 * Interleave rated and discovery pools at the given ratio.
 *
 * At ratio=4, positions 5, 10, 15, ... are filled from the discovery pool.
 * When one pool is exhausted, remaining slots are filled from the other.
 * Offset/limit are applied to the merged result.
 */
export function interleaveDiscovery<T>(options: InterleaveOptions<T>): DiscoveryItem<T>[] {
  const { rated, discovery, ratio = DISCOVERY_RATIO, offset = 0, limit } = options;

  const totalAvailable = rated.length + discovery.length;
  if (totalAvailable === 0) return [];

  const merged: DiscoveryItem<T>[] = [];
  let ratedIdx = 0;
  let discoveryIdx = 0;

  // Build the full interleaved list up to the total available items
  for (let pos = 0; pos < totalAvailable; pos++) {
    const isDiscoverySlot = (pos + 1) % (ratio + 1) === 0;

    if (isDiscoverySlot) {
      if (discoveryIdx < discovery.length) {
        merged.push({ item: discovery[discoveryIdx++], is_discovery: true });
      } else if (ratedIdx < rated.length) {
        merged.push({ item: rated[ratedIdx++], is_discovery: false });
      }
    } else {
      if (ratedIdx < rated.length) {
        merged.push({ item: rated[ratedIdx++], is_discovery: false });
      } else if (discoveryIdx < discovery.length) {
        merged.push({ item: discovery[discoveryIdx++], is_discovery: true });
      }
    }
  }

  // Apply offset and limit
  const start = Math.min(offset, merged.length);
  const end = limit !== undefined ? Math.min(start + limit, merged.length) : merged.length;
  return merged.slice(start, end);
}
