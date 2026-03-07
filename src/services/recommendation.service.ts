/**
 * RecommendationService — builds preference centroids from user rating history
 * for the byRecommendation sort mode.
 *
 * Fetches highly-rated (4-5 star) and low-rated (1-2 star) memory embeddings
 * across all collections, computes an adjusted preference centroid, and caches
 * it in Firestore.
 *
 * See: agent/design/local.by-recommendation-sort-mode.md
 */

import type { WeaviateClient } from 'weaviate-client';
import { queryDocuments, getDocument, setDocument, deleteDocument } from '../database/firestore/init.js';
import { getUserRatingsPath, getPreferenceCentroidsPath } from '../database/firestore/paths.js';
import type { MemoryIndexService } from './memory-index.service.js';
import type { Logger } from '../utils/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────

/** Minimum number of highly-rated memories required to build a centroid */
export const MIN_PROFILE_SIZE = 5;

/** Weight for negative signal subtraction (tunable) */
export const NEGATIVE_WEIGHT = 0.3;

/** Maximum number of highly-rated memories to include in centroid */
export const VECTOR_FETCH_CAP = 500;

/** Minimum similarity threshold (0-1) for byRecommendation results */
export const MIN_SIMILARITY = 0.3;

// ─── Types ────────────────────────────────────────────────────────────────

export interface PreferenceCentroid {
  vector: number[];
  profileSize: number;
}

export interface CentroidComputationResult {
  centroid: PreferenceCentroid | null;
  insufficientData: boolean;
}

interface UserRatingEntry {
  memoryId: string;
  rating: number;
  created_at: string;
  updated_at: string;
}

interface CachedCentroid {
  centroid: number[];
  profileSize: number;
  computedAt: string;
  version: number;
}

// ─── Service ──────────────────────────────────────────────────────────────

export interface RecommendationServiceParams {
  weaviateClient: WeaviateClient;
  memoryIndexService: MemoryIndexService;
  logger?: Logger;
}

export class RecommendationService {
  private readonly weaviateClient: WeaviateClient;
  private readonly memoryIndexService: MemoryIndexService;
  private readonly logger: Logger;

  constructor(params: RecommendationServiceParams) {
    this.weaviateClient = params.weaviateClient;
    this.memoryIndexService = params.memoryIndexService;
    this.logger = params.logger ?? console;
  }

  // ── User Rating Queries ──────────────────────────────────────────────

  /**
   * Get user's highly-rated memory IDs (4-5 stars).
   * Queries the user-centric ratings index, ordered by most recent first.
   */
  async getUserHighRatings(userId: string, options?: { limit?: number }): Promise<UserRatingEntry[]> {
    const path = getUserRatingsPath(userId);
    const limit = options?.limit ?? VECTOR_FETCH_CAP;

    const results = await queryDocuments(path, {
      where: [{ field: 'rating', op: '>=', value: 4 }],
      orderBy: [{ field: 'updated_at', direction: 'DESCENDING' }],
      limit,
    });

    return results.map((r) => r.data as unknown as UserRatingEntry);
  }

  /**
   * Get user's low-rated memory IDs (1-2 stars).
   */
  async getUserLowRatings(userId: string): Promise<UserRatingEntry[]> {
    const path = getUserRatingsPath(userId);

    const results = await queryDocuments(path, {
      where: [{ field: 'rating', op: '<=', value: 2 }],
      limit: VECTOR_FETCH_CAP,
    });

    return results.map((r) => r.data as unknown as UserRatingEntry);
  }

  /**
   * Get all memory IDs the user has rated (any rating).
   * Used for exclusion filter in byRecommendation search.
   */
  async getAllUserRatedIds(userId: string): Promise<string[]> {
    const path = getUserRatingsPath(userId);

    const results = await queryDocuments(path, { limit: 10000 });
    return results.map((r) => (r.data as unknown as UserRatingEntry).memoryId);
  }

  // ── Embedding Fetch ──────────────────────────────────────────────────

  /**
   * Fetch embedding vectors for a list of memory IDs across all collections.
   * Resolves each memory's collection via MemoryIndexService, then fetches
   * the vector from Weaviate.
   */
  async getEmbeddingsAcrossCollections(ratings: UserRatingEntry[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Group by collection for batch efficiency
    const byCollection = new Map<string, string[]>();
    for (const r of ratings) {
      const collectionName = await this.memoryIndexService.lookup(r.memoryId);
      if (!collectionName) continue;

      if (!byCollection.has(collectionName)) {
        byCollection.set(collectionName, []);
      }
      byCollection.get(collectionName)!.push(r.memoryId);
    }

    // Fetch vectors per collection
    for (const [collectionName, memoryIds] of byCollection) {
      const collection = this.weaviateClient.collections.get(collectionName);

      for (const memoryId of memoryIds) {
        try {
          const obj = await collection.query.fetchObjectById(memoryId, {
            includeVector: true,
          });
          if (obj?.vectors?.default && Array.isArray(obj.vectors.default)) {
            embeddings.push(obj.vectors.default as number[]);
          }
        } catch (err) {
          this.logger.debug?.(`[RecommendationService] Failed to fetch vector for ${memoryId}: ${err}`);
        }
      }
    }

    return embeddings;
  }

  // ── Vector Arithmetic ────────────────────────────────────────────────

  /**
   * Compute the element-wise average of N vectors.
   */
  averageVectors(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    if (vectors.length === 1) return [...vectors[0]];

    const dims = vectors[0].length;
    const result = new Array(dims).fill(0);

    for (const vec of vectors) {
      for (let i = 0; i < dims; i++) {
        result[i] += vec[i];
      }
    }

    for (let i = 0; i < dims; i++) {
      result[i] /= vectors.length;
    }

    return result;
  }

  /**
   * Subtract a weighted negative centroid from the positive centroid.
   * result[i] = positive[i] - weight * negative[i]
   * Normalizes the result to unit length.
   */
  subtractWeighted(positive: number[], negative: number[], weight: number): number[] {
    const dims = positive.length;
    const result = new Array(dims);

    for (let i = 0; i < dims; i++) {
      result[i] = positive[i] - weight * negative[i];
    }

    // Normalize to unit length
    let norm = 0;
    for (let i = 0; i < dims; i++) {
      norm += result[i] * result[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < dims; i++) {
        result[i] /= norm;
      }
    }

    return result;
  }

  // ── Centroid Computation ─────────────────────────────────────────────

  /**
   * Compute the user's preference centroid from their rating history.
   * Returns insufficientData: true if fewer than MIN_PROFILE_SIZE high ratings.
   */
  async computePreferenceCentroid(userId: string): Promise<CentroidComputationResult> {
    // 1. Get highly-rated memories
    const highRatings = await this.getUserHighRatings(userId, { limit: VECTOR_FETCH_CAP });

    if (highRatings.length < MIN_PROFILE_SIZE) {
      this.logger.debug?.(`[RecommendationService] Insufficient data for ${userId}: ${highRatings.length} high ratings (need ${MIN_PROFILE_SIZE})`);
      return { centroid: null, insufficientData: true };
    }

    // 2. Get low-rated memories (negative signal)
    const lowRatings = await this.getUserLowRatings(userId);

    // 3. Fetch embedding vectors
    const positiveEmbeddings = await this.getEmbeddingsAcrossCollections(highRatings);
    if (positiveEmbeddings.length === 0) {
      this.logger.debug?.(`[RecommendationService] No embeddings found for high-rated memories of ${userId}`);
      return { centroid: null, insufficientData: true };
    }

    const negativeEmbeddings = lowRatings.length > 0
      ? await this.getEmbeddingsAcrossCollections(lowRatings)
      : [];

    // 4. Compute positive centroid
    const positiveCentroid = this.averageVectors(positiveEmbeddings);

    // 5. Adjust with negative signal if available
    let finalVector: number[];
    if (negativeEmbeddings.length > 0) {
      const negativeCentroid = this.averageVectors(negativeEmbeddings);
      finalVector = this.subtractWeighted(positiveCentroid, negativeCentroid, NEGATIVE_WEIGHT);
    } else {
      finalVector = positiveCentroid;
    }

    this.logger.debug?.(`[RecommendationService] Computed centroid for ${userId}: ${positiveEmbeddings.length} positive, ${negativeEmbeddings.length} negative embeddings`);

    return {
      centroid: {
        vector: finalVector,
        profileSize: highRatings.length,
      },
      insufficientData: false,
    };
  }

  // ── Centroid Caching ─────────────────────────────────────────────────

  /**
   * Get cached preference centroid from Firestore.
   * Returns null on cache miss.
   */
  async getCachedCentroid(userId: string): Promise<PreferenceCentroid | null> {
    const path = getPreferenceCentroidsPath();
    const doc = await getDocument(path, userId);
    if (!doc) return null;

    const cached = doc as unknown as CachedCentroid;
    return {
      vector: cached.centroid,
      profileSize: cached.profileSize,
    };
  }

  /**
   * Store computed centroid in Firestore cache.
   */
  async cacheCentroid(userId: string, centroid: PreferenceCentroid): Promise<void> {
    const path = getPreferenceCentroidsPath();
    const doc: CachedCentroid = {
      centroid: centroid.vector,
      profileSize: centroid.profileSize,
      computedAt: new Date().toISOString(),
      version: 1,
    };
    await setDocument(path, userId, doc as any);
    this.logger.debug?.(`[RecommendationService] Cached centroid for ${userId}`);
  }

  /**
   * Invalidate cached centroid. Called when user submits a new 4-5 star rating.
   */
  async invalidateCentroid(userId: string): Promise<void> {
    const path = getPreferenceCentroidsPath();
    await deleteDocument(path, userId);
    this.logger.debug?.(`[RecommendationService] Invalidated centroid cache for ${userId}`);
  }

  // ── Orchestration ────────────────────────────────────────────────────

  /**
   * Get or compute the user's preference centroid.
   * Checks cache first, computes and caches on miss.
   */
  async getOrComputeCentroid(userId: string): Promise<CentroidComputationResult> {
    // Check cache
    const cached = await this.getCachedCentroid(userId);
    if (cached) {
      return { centroid: cached, insufficientData: false };
    }

    // Compute
    const result = await this.computePreferenceCentroid(userId);

    // Cache if successful
    if (result.centroid) {
      await this.cacheCentroid(userId, result.centroid);
    }

    return result;
  }
}
