/**
 * ScoringContextService — gathers contextual information for emotional scoring.
 *
 * Assembles three context sources for per-dimension Haiku scoring:
 * 1. Relationship observation texts from connected memories
 * 2. Nearest-neighbor emotional scores (3-5 similar, already-scored memories)
 * 3. Collection-level emotional averages (cached per REM cycle)
 *
 * See: agent/design/local.rem-emotional-weighting.md
 */

import { Filters } from 'weaviate-client';
import type { Logger } from '../utils/logger.js';
import { ALL_SCORING_DIMENSIONS } from '../database/weaviate/v2-collections.js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface ScoringContextResult {
  relationship_observations: string[];
  nearest_neighbor_scores: Record<string, number>;
  collection_averages: Record<string, number>;
}

export interface NeighborResult {
  content_preview: string;
  scores: Partial<Record<string, number>>;
}

export interface CollectionStatsCache {
  get(collectionName: string): Partial<Record<string, number>> | undefined;
  set(collectionName: string, stats: Partial<Record<string, number>>): void;
  invalidate(collectionName: string): void;
  invalidateAll(): void;
}

// ─── Collection Stats Cache ─────────────────────────────────────────────

export function createCollectionStatsCache(): CollectionStatsCache {
  const cache = new Map<string, Partial<Record<string, number>>>();

  return {
    get(collectionName: string) {
      return cache.get(collectionName);
    },
    set(collectionName: string, stats: Partial<Record<string, number>>) {
      cache.set(collectionName, stats);
    },
    invalidate(collectionName: string) {
      cache.delete(collectionName);
    },
    invalidateAll() {
      cache.clear();
    },
  };
}

// ─── Service ──────────────────────────────────────────────────────────────

export interface ScoringContextServiceParams {
  logger?: Logger;
}

export class ScoringContextService {
  private readonly logger: Logger;

  constructor(params?: ScoringContextServiceParams) {
    this.logger = params?.logger ?? console;
  }

  /**
   * Fetch relationship observation texts for a memory.
   * Queries the collection for relationship docs linked to this memory,
   * then returns their observation texts.
   */
  async fetchRelationshipObservations(
    collection: any,
    memoryId: string,
  ): Promise<string[]> {
    try {
      // Find relationships that include this memory
      const filter = Filters.and(
        collection.filter.byProperty('doc_type').equal('relationship'),
        collection.filter.byProperty('related_memory_ids').containsAny([memoryId]),
      );

      const result = await collection.query.fetchObjects({
        filters: filter,
        limit: 10,
      });

      const observations: string[] = [];
      for (const obj of result.objects) {
        const obs = obj.properties?.observation;
        if (obs && typeof obs === 'string' && obs.trim().length > 0) {
          observations.push(obs);
        }
      }

      return observations;
    } catch (err) {
      this.logger.debug?.(`[ScoringContext] Failed to fetch relationship observations for ${memoryId}: ${err}`);
      return [];
    }
  }

  /**
   * Fetch nearest-neighbor emotional scores for a memory.
   * Uses vector similarity to find 3-5 similar memories that already have scores.
   */
  async fetchNearestNeighborScores(
    collection: any,
    memoryId: string,
    options?: { limit?: number },
  ): Promise<NeighborResult[]> {
    const limit = options?.limit ?? 5;

    try {
      // Filter for scored memories (has total_significance set)
      const filter = Filters.and(
        collection.filter.byProperty('total_significance').greaterThan(0),
        collection.filter.byProperty('doc_type').equal('memory'),
      );

      const result = await collection.query.nearObject(memoryId, {
        limit: limit + 1, // +1 to exclude self
        filters: filter,
        returnMetadata: ['distance'],
      });

      const neighbors: NeighborResult[] = [];
      for (const obj of result.objects) {
        if (obj.uuid === memoryId) continue;
        if (neighbors.length >= limit) break;

        const scores: Partial<Record<string, number>> = {};
        for (const dim of ALL_SCORING_DIMENSIONS) {
          const val = obj.properties?.[dim];
          if (val !== undefined && val !== null && typeof val === 'number') {
            scores[dim] = val;
          }
        }

        if (Object.keys(scores).length > 0) {
          const content = obj.properties?.content ?? '';
          neighbors.push({
            content_preview: typeof content === 'string' ? content.slice(0, 100) : '',
            scores,
          });
        }
      }

      return neighbors;
    } catch (err) {
      this.logger.debug?.(`[ScoringContext] Failed to fetch nearest neighbors for ${memoryId}: ${err}`);
      return [];
    }
  }

  /**
   * Compute collection-level averages for all scoring dimensions.
   * Only considers memories that have at least one scored dimension.
   */
  async computeCollectionAverages(
    collection: any,
    statsCache: CollectionStatsCache,
    collectionName: string,
  ): Promise<Partial<Record<string, number>>> {
    // Check cache first
    const cached = statsCache.get(collectionName);
    if (cached) return cached;

    try {
      // Fetch all memories with total_significance > 0 (scored)
      const filter = Filters.and(
        collection.filter.byProperty('total_significance').greaterThan(0),
        collection.filter.byProperty('doc_type').equal('memory'),
      );

      const result = await collection.query.fetchObjects({
        filters: filter,
        limit: 1000,
      });

      if (result.objects.length === 0) {
        const empty: Partial<Record<string, number>> = {};
        statsCache.set(collectionName, empty);
        return empty;
      }

      // Compute per-dimension averages
      const sums: Record<string, number> = {};
      const counts: Record<string, number> = {};

      for (const obj of result.objects) {
        for (const dim of ALL_SCORING_DIMENSIONS) {
          const val = obj.properties?.[dim];
          if (val !== undefined && val !== null && typeof val === 'number') {
            sums[dim] = (sums[dim] ?? 0) + val;
            counts[dim] = (counts[dim] ?? 0) + 1;
          }
        }
      }

      const averages: Partial<Record<string, number>> = {};
      for (const dim of ALL_SCORING_DIMENSIONS) {
        if (counts[dim] && counts[dim] > 0) {
          averages[dim] = sums[dim] / counts[dim];
        }
      }

      statsCache.set(collectionName, averages);
      return averages;
    } catch (err) {
      this.logger.debug?.(`[ScoringContext] Failed to compute collection averages for ${collectionName}: ${err}`);
      return {};
    }
  }

  /**
   * Gather full scoring context for a memory.
   * Assembles relationship observations, nearest-neighbor scores,
   * and collection averages.
   */
  async gatherScoringContext(
    collection: any,
    collectionName: string,
    memoryId: string,
    statsCache: CollectionStatsCache,
  ): Promise<ScoringContextResult> {
    // Fetch all three sources in parallel
    const [observations, neighbors, averages] = await Promise.all([
      this.fetchRelationshipObservations(collection, memoryId),
      this.fetchNearestNeighborScores(collection, memoryId),
      this.computeCollectionAverages(collection, statsCache, collectionName),
    ]);

    // Flatten neighbor scores into a single per-dimension map (average across neighbors)
    const neighborScoreMap: Record<string, number> = {};
    if (neighbors.length > 0) {
      const dimSums: Record<string, number> = {};
      const dimCounts: Record<string, number> = {};

      for (const neighbor of neighbors) {
        for (const [dim, score] of Object.entries(neighbor.scores)) {
          if (score !== undefined) {
            dimSums[dim] = (dimSums[dim] ?? 0) + score;
            dimCounts[dim] = (dimCounts[dim] ?? 0) + 1;
          }
        }
      }

      for (const dim of Object.keys(dimSums)) {
        neighborScoreMap[dim] = dimSums[dim] / dimCounts[dim];
      }
    }

    return {
      relationship_observations: observations,
      nearest_neighbor_scores: neighborScoreMap,
      collection_averages: averages as Record<string, number>,
    };
  }
}
