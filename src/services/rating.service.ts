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
import { getDocument, setDocument, deleteDocument } from '../database/firestore/init.js';
import { getMemoryRatingsPath } from '../database/firestore/paths.js';
import { fetchMemoryWithAllProperties } from '../database/weaviate/client.js';
import type { MemoryIndexService } from './memory-index.service.js';
import type { Logger } from '../utils/logger.js';
import type { MemoryRating, RateMemoryInput, RatingResult } from '../types/rating.types.js';
import { computeBayesianScore, computeRatingAvg, isValidRating } from '../types/rating.types.js';

export interface RatingServiceParams {
  weaviateClient: WeaviateClient;
  memoryIndexService: MemoryIndexService;
  logger?: Logger;
}

export class RatingService {
  private readonly weaviateClient: WeaviateClient;
  private readonly memoryIndexService: MemoryIndexService;
  private readonly logger: Logger;

  constructor(params: RatingServiceParams) {
    this.weaviateClient = params.weaviateClient;
    this.memoryIndexService = params.memoryIndexService;
    this.logger = params.logger ?? console;
  }

  /**
   * Submit or update a rating (idempotent upsert).
   *
   * 1. Validate rating 1-5
   * 2. Validate not self-rating
   * 3. Resolve collection via MemoryIndexService
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

    // Fetch memory to check ownership and get current aggregates
    const memoryObj = await fetchMemoryWithAllProperties(collection, memoryId);
    if (!memoryObj) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    const props = memoryObj.properties as Record<string, unknown>;

    // Self-rating check
    const authorId = (props.user_id as string) || (props.author_id as string);
    if (authorId && authorId === userId) {
      throw new Error('Cannot rate your own memory.');
    }

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
}
