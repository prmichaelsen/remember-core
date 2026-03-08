/**
 * RatingService — manages 1-5 star ratings on memories.
 *
 * Individual ratings stored in Firestore, aggregate fields (rating_sum,
 * rating_count, rating_bayesian) denormalized on Memory objects in Weaviate.
 * Uses MemoryIndexService for collection resolution.
 *
 * See: agent/design/local.memory-ratings.md
 */

import type { WeaviateClient } from 'weaviate-client';
import { getDocument, setDocument, deleteDocument, queryDocuments } from '../database/firestore/init.js';
import { getMemoryRatingsPath, getUserRatingsPath } from '../database/firestore/paths.js';
import { fetchMemoryWithAllProperties } from '../database/weaviate/client.js';
import type { MemoryIndexService } from './memory-index.service.js';
import type { RecommendationService } from './recommendation.service.js';
import type { Logger } from '../utils/logger.js';
import type { MemoryRating, RateMemoryInput, RatingResult, MyRatingsRequest, MyRatingsResult } from '../types/rating.types.js';
import { computeBayesianScore, computeRatingAvg, isValidRating } from '../types/rating.types.js';

export interface RatingServiceParams {
  weaviateClient: WeaviateClient;
  memoryIndexService: MemoryIndexService;
  recommendationService?: RecommendationService;
  logger?: Logger;
}

export class RatingService {
  private readonly weaviateClient: WeaviateClient;
  private readonly memoryIndexService: MemoryIndexService;
  private readonly recommendationService?: RecommendationService;
  private readonly logger: Logger;

  constructor(params: RatingServiceParams) {
    this.weaviateClient = params.weaviateClient;
    this.memoryIndexService = params.memoryIndexService;
    this.recommendationService = params.recommendationService;
    this.logger = params.logger ?? console;
  }

  /**
   * Submit or update a rating (idempotent upsert).
   *
   * 1. Validate rating 1-5
   * 2. Resolve collection via MemoryIndexService
   * 4. Read existing Firestore rating
   * 5. Write/update Firestore rating doc
   * 6. Update Weaviate aggregates
   * 7. Recompute rating_bayesian
   */
  async rate(input: RateMemoryInput): Promise<RatingResult> {
    const { memoryId, userId, rating } = input;

    if (!isValidRating(rating)) {
      throw new Error(`Invalid rating: ${rating}. Must be an integer between 1 and 5.`);
    }

    // Resolve collection
    const collectionName = await this.memoryIndexService.lookup(memoryId);
    if (!collectionName) {
      throw new Error(`Memory not found in index: ${memoryId}`);
    }

    const collection = this.weaviateClient.collections.get(collectionName);

    // Fetch memory to get current aggregates
    const memoryObj = await fetchMemoryWithAllProperties(collection, memoryId);
    if (!memoryObj) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    const props = memoryObj.properties as Record<string, unknown>;

    // Read existing Firestore rating
    const ratingsPath = getMemoryRatingsPath(memoryId);
    const existingDoc = await getDocument(ratingsPath, userId);
    const existingRating = existingDoc ? (existingDoc as unknown as MemoryRating) : null;
    const previousRating = existingRating?.rating ?? null;

    // Write Firestore rating
    const now = new Date().toISOString();
    const ratingDoc: MemoryRating = {
      rating,
      created_at: existingRating?.created_at ?? now,
      updated_at: now,
    };
    await setDocument(ratingsPath, userId, ratingDoc as any);

    // Dual-write: user-centric index for byRecommendation/byMyRatings queries
    const userRatingsPath = getUserRatingsPath(userId);
    await setDocument(userRatingsPath, memoryId, { ...ratingDoc, memoryId, collectionName } as any);

    // Compute new aggregates
    let ratingSum = (props.rating_sum as number) ?? 0;
    let ratingCount = (props.rating_count as number) ?? 0;

    if (previousRating !== null) {
      // Change: adjust sum by delta, count unchanged
      ratingSum += rating - previousRating;
    } else {
      // New rating
      ratingSum += rating;
      ratingCount += 1;
    }

    const ratingBayesian = computeBayesianScore(ratingSum, ratingCount);

    // Update Weaviate
    await collection.data.update({
      id: memoryId,
      properties: {
        rating_sum: ratingSum,
        rating_count: ratingCount,
        rating_bayesian: ratingBayesian,
      },
    });

    this.logger.debug?.(`[RatingService] rate: ${memoryId} by ${userId} → ${rating} (was ${previousRating})`);

    // Invalidate preference centroid cache on high rating (4-5 stars)
    if (rating >= 4 && this.recommendationService) {
      await this.recommendationService.invalidateCentroid(userId);
    }

    return {
      previousRating,
      newRating: rating,
      ratingCount,
      ratingAvg: computeRatingAvg(ratingSum, ratingCount),
    };
  }

  /**
   * Retract a rating entirely.
   *
   * 1. Read existing Firestore rating (must exist)
   * 2. Delete Firestore doc
   * 3. Decrement Weaviate aggregates
   * 4. Recompute rating_bayesian
   */
  async retract(memoryId: string, userId: string): Promise<void> {
    // Read existing rating
    const ratingsPath = getMemoryRatingsPath(memoryId);
    const existingDoc = await getDocument(ratingsPath, userId);
    if (!existingDoc) {
      throw new Error(`No rating found for user ${userId} on memory ${memoryId}`);
    }

    const existingRating = (existingDoc as unknown as MemoryRating).rating;

    // Delete Firestore doc
    await deleteDocument(ratingsPath, userId);

    // Dual-delete: user-centric index
    const userRatingsPath = getUserRatingsPath(userId);
    await deleteDocument(userRatingsPath, memoryId);

    // Resolve collection and fetch current aggregates
    const collectionName = await this.memoryIndexService.lookup(memoryId);
    if (!collectionName) {
      throw new Error(`Memory not found in index: ${memoryId}`);
    }

    const collection = this.weaviateClient.collections.get(collectionName);
    const memoryObj = await fetchMemoryWithAllProperties(collection, memoryId);
    if (!memoryObj) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    const props = memoryObj.properties as Record<string, unknown>;
    const ratingSum = ((props.rating_sum as number) ?? 0) - existingRating;
    const ratingCount = Math.max(0, ((props.rating_count as number) ?? 0) - 1);
    const ratingBayesian = computeBayesianScore(ratingSum, ratingCount);

    await collection.data.update({
      id: memoryId,
      properties: {
        rating_sum: ratingSum,
        rating_count: ratingCount,
        rating_bayesian: ratingBayesian,
      },
    });

    this.logger.debug?.(`[RatingService] retract: ${memoryId} by ${userId} (was ${existingRating})`);
  }

  /**
   * Get the current user's rating for a memory.
   * Returns null if the user has not rated this memory.
   */
  async getUserRating(memoryId: string, userId: string): Promise<MemoryRating | null> {
    const ratingsPath = getMemoryRatingsPath(memoryId);
    const doc = await getDocument(ratingsPath, userId);
    if (!doc) return null;
    return doc as unknown as MemoryRating;
  }

  /**
   * Browse and search memories the user has rated.
   *
   * Browse mode (no query): Firestore cursor pagination → scope/star filter → Weaviate hydration
   * Search mode (with query): hybrid search per collection intersected with rated ID set
   */
  async byMyRatings(input: MyRatingsRequest): Promise<MyRatingsResult> {
    const {
      userId,
      spaces,
      groups,
      rating_filter,
      sort_by = 'rated_at',
      direction = 'desc',
      query,
      limit = 50,
      offset = 0,
    } = input;

    // Search mode: hybrid search intersected with rated ID set
    if (query?.trim()) {
      return this.byMyRatingsSearch(input);
    }

    // Browse mode: read rating docs from Firestore
    const ratingsPath = getUserRatingsPath(userId);
    const firestoreDirection = direction === 'asc' ? 'ASCENDING' : 'DESCENDING';
    const orderField = sort_by === 'rating' ? 'rating' : 'updated_at';

    const ratingDocs = await queryDocuments(ratingsPath, {
      orderBy: [{ field: orderField, direction: firestoreDirection }],
    });

    if (ratingDocs.length === 0) {
      return { items: [], total: 0, offset, limit };
    }

    // Scope filter: filter by collectionName matching spaces/groups
    const hasScope = (spaces && spaces.length > 0) || (groups && groups.length > 0);
    let filtered = ratingDocs;

    if (hasScope) {
      const scopeSet = new Set<string>();
      if (spaces) {
        for (const s of spaces) scopeSet.add(s);
      }
      if (groups) {
        for (const g of groups) scopeSet.add(g);
      }
      filtered = filtered.filter((doc) => {
        const cn = (doc.data as Record<string, unknown>).collectionName as string | undefined;
        return cn && scopeSet.has(cn);
      });
    }

    // Star filter
    if (rating_filter) {
      const min = rating_filter.min ?? 1;
      const max = rating_filter.max ?? 5;
      filtered = filtered.filter((doc) => {
        const r = (doc.data as Record<string, unknown>).rating as number;
        return r >= min && r <= max;
      });
    }

    const total = filtered.length;

    // Paginate
    const page = filtered.slice(offset, offset + limit);

    if (page.length === 0) {
      return { items: [], total, offset, limit };
    }

    // Hydrate: group by collectionName for batch fetches
    const byCollection = new Map<string, Array<{ memoryId: string; rating: number; rated_at: string }>>();

    for (const doc of page) {
      const data = doc.data as Record<string, unknown>;
      const memoryId = (data.memoryId as string) ?? doc.id;
      const cn = (data.collectionName as string) ?? null;
      const rating = data.rating as number;
      const rated_at = (data.updated_at as string) ?? '';

      if (!cn) {
        // Missing collectionName (pre-backfill doc) — attempt fallback lookup
        this.logger.warn?.(`[RatingService] byMyRatings: rating doc ${memoryId} missing collectionName, attempting fallback lookup`);
        const resolved = await this.memoryIndexService.lookup(memoryId);
        if (resolved) {
          if (!byCollection.has(resolved)) byCollection.set(resolved, []);
          byCollection.get(resolved)!.push({ memoryId, rating, rated_at });
        } else {
          if (!byCollection.has('__unavailable__')) byCollection.set('__unavailable__', []);
          byCollection.get('__unavailable__')!.push({ memoryId, rating, rated_at });
        }
        continue;
      }

      if (!byCollection.has(cn)) byCollection.set(cn, []);
      byCollection.get(cn)!.push({ memoryId, rating, rated_at });
    }

    // Fetch memories from Weaviate per collection
    const memoryMap = new Map<string, Record<string, unknown>>();

    for (const [cn, entries] of byCollection) {
      if (cn === '__unavailable__') continue;

      const collection = this.weaviateClient.collections.get(cn);
      for (const entry of entries) {
        try {
          const memObj = await fetchMemoryWithAllProperties(collection, entry.memoryId);
          if (memObj) {
            const props = memObj.properties as Record<string, unknown>;
            memoryMap.set(entry.memoryId, { id: memObj.uuid, ...props });
          }
        } catch (error) {
          this.logger.warn?.(`[RatingService] byMyRatings: failed to fetch ${entry.memoryId} from ${cn}: ${error}`);
        }
      }
    }

    // Build response items in page order
    const items: MyRatingsResult['items'] = [];
    for (const doc of page) {
      const data = doc.data as Record<string, unknown>;
      const memoryId = (data.memoryId as string) ?? doc.id;
      const rating = data.rating as number;
      const rated_at = (data.updated_at as string) ?? '';

      const memory = memoryMap.get(memoryId);
      if (memory) {
        const isDeleted = !!(memory.deleted_at || memory.is_deleted);
        items.push({
          memory,
          metadata: {
            my_rating: rating,
            rated_at,
            ...(isDeleted ? { deleted: true } : {}),
          },
        });
      } else {
        // Unavailable stub
        items.push({
          memory: { id: memoryId },
          metadata: {
            my_rating: rating,
            rated_at,
            unavailable: true,
          },
        });
      }
    }

    return { items, total, offset, limit };
  }

  /**
   * Search mode for byMyRatings: hybrid search per Weaviate collection
   * intersected with the user's rated memory ID set.
   */
  private async byMyRatingsSearch(input: MyRatingsRequest): Promise<MyRatingsResult> {
    const {
      userId,
      spaces,
      groups,
      rating_filter,
      query,
      limit = 50,
      offset = 0,
    } = input;

    // 1. Fetch all rating docs (need full ID set for intersection)
    const ratingsPath = getUserRatingsPath(userId);
    const ratingDocs = await queryDocuments(ratingsPath, {
      orderBy: [{ field: 'updated_at', direction: 'DESCENDING' }],
    });

    if (ratingDocs.length === 0) {
      return { items: [], total: 0, offset, limit };
    }

    // 2. Filter by scope and star
    const hasScope = (spaces && spaces.length > 0) || (groups && groups.length > 0);
    let filtered = ratingDocs;

    if (hasScope) {
      const scopeSet = new Set<string>();
      if (spaces) for (const s of spaces) scopeSet.add(s);
      if (groups) for (const g of groups) scopeSet.add(g);
      filtered = filtered.filter((doc) => {
        const cn = (doc.data as Record<string, unknown>).collectionName as string | undefined;
        return cn && scopeSet.has(cn);
      });
    }

    if (rating_filter) {
      const min = rating_filter.min ?? 1;
      const max = rating_filter.max ?? 5;
      filtered = filtered.filter((doc) => {
        const r = (doc.data as Record<string, unknown>).rating as number;
        return r >= min && r <= max;
      });
    }

    // 3. Collect rated memory IDs grouped by collectionName
    const ratedByCollection = new Map<string, Set<string>>();
    const ratingLookup = new Map<string, { rating: number; rated_at: string }>();

    for (const doc of filtered) {
      const data = doc.data as Record<string, unknown>;
      const memoryId = (data.memoryId as string) ?? doc.id;
      const cn = data.collectionName as string | undefined;
      if (!cn) continue; // Skip docs without collectionName in search mode

      if (!ratedByCollection.has(cn)) ratedByCollection.set(cn, new Set());
      ratedByCollection.get(cn)!.add(memoryId);
      ratingLookup.set(memoryId, {
        rating: data.rating as number,
        rated_at: (data.updated_at as string) ?? '',
      });
    }

    if (ratedByCollection.size === 0) {
      return { items: [], total: 0, offset, limit };
    }

    // 4. Run hybrid search per collection, intersect with rated IDs
    const SEARCH_LIMIT = 200;
    const intersectedResults: Array<{ memoryId: string; memory: Record<string, unknown> }> = [];

    for (const [cn, ratedIds] of ratedByCollection) {
      try {
        const collection = this.weaviateClient.collections.get(cn);
        const searchResults = await collection.query.hybrid(query!, {
          alpha: 0.7,
          limit: SEARCH_LIMIT,
        });

        // Intersect: only keep results that are in the rated set
        for (const obj of searchResults.objects) {
          if (ratedIds.has(obj.uuid)) {
            const props = obj.properties as Record<string, unknown>;
            intersectedResults.push({
              memoryId: obj.uuid,
              memory: { id: obj.uuid, ...props },
            });
          }
        }
      } catch (error) {
        this.logger.warn?.(`[RatingService] byMyRatings search: failed on collection ${cn}: ${error}`);
      }
    }

    // 5. Apply offset/limit to merged results (Weaviate relevance ordering preserved)
    const total = intersectedResults.length;
    const page = intersectedResults.slice(offset, offset + limit);

    // 6. Attach metadata from rating docs
    const items: MyRatingsResult['items'] = page.map(({ memoryId, memory }) => {
      const ratingData = ratingLookup.get(memoryId);
      const isDeleted = !!(memory.deleted_at || memory.is_deleted);
      return {
        memory,
        metadata: {
          my_rating: ratingData?.rating ?? 0,
          rated_at: ratingData?.rated_at ?? '',
          ...(isDeleted ? { deleted: true } : {}),
        },
      };
    });

    return { items, total, offset, limit };
  }
}
