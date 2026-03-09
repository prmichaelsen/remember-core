/**
 * MemoryService — unified CRUD + search for user memories.
 *
 * Extracted from 6 remember-mcp tool handlers:
 *   create-memory.ts, search-memory.ts, find-similar.ts,
 *   query-memory.ts, update-memory.ts, delete-memory.ts
 *
 * Design: accepts Weaviate collection + Logger via constructor. No MCP-specific code.
 */

import { Filters } from 'weaviate-client';
import type { Logger } from '../utils/logger.js';
import type { SearchFilters, GhostSearchContext } from '../types/search.types.js';
import type { ContentType } from '../types/index.js';
import { normalizeTrustScore, isValidTrustLevel, TrustLevel } from '../types/trust.types.js';
import { computeRatingAvg, type RatingModeRequest, type RatingModeResult, RATING_MIN_THRESHOLD } from '../types/rating.types.js';
import { interleaveDiscovery, DISCOVERY_RATIO, type DiscoveryItem } from './discovery.js';
import type { RecommendationService } from './recommendation.service.js';
import { MIN_SIMILARITY } from './recommendation.service.js';
import { isValidContentType, DEFAULT_CONTENT_TYPE } from '../constants/content-types.js';
import { fetchMemoryWithAllProperties, ALL_MEMORY_PROPERTIES } from '../database/weaviate/client.js';
import {
  ALL_SCORING_DIMENSIONS,
  COMPOSITE_SCORE_PROPERTIES,
  FEEL_DIMENSION_PROPERTIES,
  FUNCTIONAL_DIMENSION_PROPERTIES,
} from '../database/weaviate/v2-collections.js';
import { computeAllComposites, type DimensionScores } from './composite-scoring.js';
import {
  buildCombinedSearchFilters,
  buildMemoryOnlyFilters,
  buildDeletedFilter,
  combineFiltersWithAnd,
  type DeletedFilter,
} from '../utils/filters.js';
import { buildTrustFilter } from './trust-enforcement.service.js';
import type { MemoryIndexService } from './memory-index.service.js';

// ─── Input/Output Types ──────────────────────────────────────────────────

export interface CreateMemoryInput {
  content: string;
  title?: string;
  type?: ContentType;
  weight?: number;
  trust?: number;
  tags?: string[];
  references?: string[];
  template_id?: string;
  parent_id?: string | null;
  thread_root_id?: string | null;
  moderation_flags?: string[];
  context_summary?: string;
  context_conversation_id?: string;
  follow_up_at?: string;
  is_user_organized?: boolean;

  // ── REM Emotional Weighting (optional create-time seeding) ────────
  // Layer 1: Discrete emotions (0-1, except feel_valence: -1 to 1)
  feel_emotional_significance?: number;
  feel_vulnerability?: number;
  feel_trauma?: number;
  feel_humor?: number;
  feel_happiness?: number;
  feel_sadness?: number;
  feel_fear?: number;
  feel_anger?: number;
  feel_surprise?: number;
  feel_disgust?: number;
  feel_contempt?: number;
  feel_embarrassment?: number;
  feel_shame?: number;
  feel_guilt?: number;
  feel_excitement?: number;
  feel_pride?: number;
  feel_valence?: number;
  feel_arousal?: number;
  feel_dominance?: number;
  feel_intensity?: number;
  feel_coherence_tension?: number;
  // Layer 2: Functional signals (0-1)
  functional_salience?: number;
  functional_urgency?: number;
  functional_social_weight?: number;
  functional_agency?: number;
  functional_novelty?: number;
  functional_retrieval_utility?: number;
  functional_narrative_importance?: number;
  functional_aesthetic_quality?: number;
  functional_valence?: number;
  functional_coherence_tension?: number;
  // Composites
  feel_significance?: number;
  functional_significance?: number;
  total_significance?: number;
  // Observation
  observation?: string;
}

export interface CreateMemoryResult {
  memory_id: string;
  created_at: string;
}

export interface SearchMemoryInput {
  query: string;
  alpha?: number;
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
  include_relationships?: boolean;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface SearchMemoryResult {
  memories: Record<string, unknown>[];
  relationships?: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

export interface FindSimilarInput {
  memory_id?: string;
  text?: string;
  limit?: number;
  min_similarity?: number;
  include_relationships?: boolean;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface SimilarMemoryItem {
  id: string;
  similarity: number;
  [key: string]: unknown;
}

export interface FindSimilarResult {
  similar_memories: SimilarMemoryItem[];
  total: number;
}

export interface QueryMemoryInput {
  query: string;
  limit?: number;
  min_relevance?: number;
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface RelevantMemoryItem {
  id: string;
  relevance: number;
  [key: string]: unknown;
}

export interface QueryMemoryResult {
  memories: RelevantMemoryItem[];
  total: number;
}

export interface TimeModeRequest {
  limit?: number;
  offset?: number;
  direction?: 'asc' | 'desc';
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface TimeModeResult {
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

export interface DensityModeRequest {
  limit?: number;
  offset?: number;
  min_relationship_count?: number;
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface DensityModeResult {
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

export interface DiscoveryModeRequest {
  query?: string;
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface DiscoveryModeResult {
  memories: (Record<string, unknown> & { is_discovery: boolean })[];
  total: number;
  offset: number;
  limit: number;
}

export interface RecommendationModeRequest {
  userId: string;
  query?: string;
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface RecommendedMemory {
  similarity_pct: number;
  [key: string]: unknown;
}

export interface RecommendationModeResult {
  memories: RecommendedMemory[];
  profileSize: number;
  insufficientData: boolean;
  fallback_sort_mode?: 'byDiscovery';
  total: number;
  offset: number;
  limit: number;
}

// ── byProperty Sort Mode ──────────────────────────────────────────────

export interface PropertyModeRequest {
  sort_field: string;
  sort_direction: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface PropertyModeResult {
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
  sort_field: string;
  sort_direction: 'asc' | 'desc';
}

// ── byBroad Sort Mode ─────────────────────────────────────────────────

export interface BroadSearchResult {
  memory_id: string;
  title?: string;
  content_type: string;
  content_head: string;
  content_mid: string;
  content_tail: string;
  created_at: string;
  tags: string[];
  weight: number;
  total_significance?: number;
  feel_significance?: number;
  functional_significance?: number;
}

export interface BroadModeRequest {
  query?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface BroadModeResult {
  results: BroadSearchResult[];
  total: number;
  offset: number;
  limit: number;
}

// ── byRandom Sort Mode ────────────────────────────────────────────────

export interface RandomModeRequest {
  limit?: number;
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface RandomModeResult {
  results: Record<string, unknown>[];
  total_pool_size: number;
}

// ── byCurated Sort Mode ─────────────────────────────────────────────────

export interface CuratedModeRequest {
  query?: string;
  limit?: number;
  offset?: number;
  direction?: 'asc' | 'desc';
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface CuratedModeResult {
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

export interface UpdateMemoryInput {
  memory_id: string;
  content?: string;
  title?: string;
  type?: string;
  weight?: number;
  trust?: number;
  tags?: string[];
  references?: string[];
  parent_id?: string | null;
  thread_root_id?: string | null;
  moderation_flags?: string[];
  is_user_organized?: boolean;
}

export interface UpdateMemoryResult {
  memory_id: string;
  updated_at: string;
  version: number;
  updated_fields: string[];
}

export interface DeleteMemoryInput {
  memory_id: string;
  reason?: string;
}

export interface GetMemoryResult {
  memory: Record<string, unknown>;
}

export interface ResolveByIdResult {
  memory: Record<string, unknown> | null;
  collectionName: string | null;
}

export interface DeleteMemoryResult {
  memory_id: string;
  deleted_at: string;
  orphaned_relationship_ids: string[];
}

// ─── Content Slicing (byBroad) ──────────────────────────────────────────

export function sliceContent(content: string): { head: string; mid: string; tail: string } {
  const SLICE_SIZE = 100;
  if (content.length <= SLICE_SIZE * 3) {
    if (content.length <= SLICE_SIZE) return { head: content, mid: '', tail: '' };
    if (content.length <= SLICE_SIZE * 2) {
      const midpoint = Math.floor(content.length / 2);
      return { head: content.slice(0, midpoint), mid: '', tail: content.slice(midpoint) };
    }
    const third = Math.floor(content.length / 3);
    return { head: content.slice(0, third), mid: content.slice(third, third * 2), tail: content.slice(third * 2) };
  }
  const head = content.slice(0, SLICE_SIZE);
  const midStart = Math.floor(content.length / 2) - Math.floor(SLICE_SIZE / 2);
  const mid = content.slice(midStart, midStart + SLICE_SIZE);
  const tail = content.slice(-SLICE_SIZE);
  return { head, mid, tail };
}

// ─── Emotional Weighting Helpers ─────────────────────────────────────────

/** Validate emotional/functional dimension ranges on create input */
function validateDimensionRanges(input: CreateMemoryInput): void {
  for (const dim of ALL_SCORING_DIMENSIONS) {
    const value = input[dim as keyof CreateMemoryInput] as number | undefined;
    if (value === undefined || value === null) continue;

    if (dim === 'feel_valence') {
      if (value < -1 || value > 1) {
        throw new Error(`${dim} must be between -1 and 1, got ${value}`);
      }
    } else {
      if (value < 0 || value > 1) {
        throw new Error(`${dim} must be between 0 and 1, got ${value}`);
      }
    }
  }
}

/** Compute composite significance from individual dimension values at create-time */
function computeComposites(input: CreateMemoryInput) {
  // If explicitly provided, use as-is
  const hasExplicitComposites = input.feel_significance !== undefined
    || input.functional_significance !== undefined
    || input.total_significance !== undefined;

  if (hasExplicitComposites) {
    return {
      feel_significance: input.feel_significance ?? null,
      functional_significance: input.functional_significance ?? null,
      total_significance: input.total_significance ?? null,
    };
  }

  // Build scores map from input for the reusable composite module
  const scores: DimensionScores = {};
  for (const dim of ALL_SCORING_DIMENSIONS) {
    const v = input[dim as keyof CreateMemoryInput] as number | undefined;
    if (v !== undefined) scores[dim] = v;
  }

  return computeAllComposites(scores);
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Normalize trust_score and compute derived rating_avg on a Weaviate document */
function normalizeDoc(doc: Record<string, unknown>): Record<string, unknown> {
  if ('trust_score' in doc) {
    doc.trust_score = normalizeTrustScore(doc.trust_score as number);
  }
  // Compute derived rating_avg from stored aggregates
  const ratingSum = doc.rating_sum as number | undefined;
  const ratingCount = doc.rating_count as number | undefined;
  if (ratingSum !== undefined && ratingCount !== undefined) {
    doc.rating_avg = computeRatingAvg(ratingSum, ratingCount);
  }
  return doc;
}

// ─── Service ─────────────────────────────────────────────────────────────

/**
 * MemoryService provides transport-agnostic memory CRUD + search operations.
 *
 * @param collection - A Weaviate collection instance for the user (Memory_users_{userId})
 * @param userId - The owner user ID
 * @param logger - Logger instance
 */
export class MemoryService {
  constructor(
    private collection: any,
    private userId: string,
    private logger: Logger,
    private options: {
      memoryIndex: MemoryIndexService;
      weaviateClient?: any;
      recommendationService?: RecommendationService;
    },
  ) {}

  /**
   * Execute a search function, retrying without the deleted_at filter if
   * the collection lacks indexNullState (created before soft-delete support).
   */
  private async retryWithoutDeletedFilter<T>(
    fn: (useDeletedFilter: boolean) => Promise<T>,
  ): Promise<T> {
    try {
      return await fn(true);
    } catch (err: any) {
      if (err?.message?.includes('Nullstate must be indexed')) {
        return fn(false);
      }
      throw err;
    }
  }

  // ── Get by ID ────────────────────────────────────────────────────────

  async getById(memoryId: string): Promise<GetMemoryResult> {
    const existing = await fetchMemoryWithAllProperties(this.collection, memoryId);
    if (!existing?.properties) throw new Error(`Memory not found: ${memoryId}`);
    if (existing.properties.user_id !== this.userId) throw new Error('Unauthorized');
    return { memory: normalizeDoc({ id: existing.uuid, ...existing.properties }) };
  }

  // ── Resolve by ID (cross-collection) ─────────────────────────────────

  /**
   * Resolve any memory by UUID alone using the Firestore index.
   * Requires `memoryIndex` and `weaviateClient` in constructor options.
   */
  async resolveById(memoryId: string): Promise<ResolveByIdResult> {
    if (!this.options.weaviateClient) {
      throw new Error('resolveById requires weaviateClient in options');
    }

    const collectionName = await this.options.memoryIndex.lookup(memoryId);
    if (collectionName) {
      const col = this.options.weaviateClient.collections.get(collectionName);
      const memory = await fetchMemoryWithAllProperties(col, memoryId);
      if (memory?.properties) {
        return {
          memory: normalizeDoc({ id: memory.uuid, ...memory.properties }),
          collectionName,
        };
      }
    }

    return { memory: null, collectionName: null };
  }

  // ── Create ──────────────────────────────────────────────────────────

  async create(input: CreateMemoryInput): Promise<CreateMemoryResult> {
    // Validate emotional dimension ranges
    validateDimensionRanges(input);

    const now = new Date().toISOString();
    const contentType =
      input.type && isValidContentType(input.type) ? input.type : DEFAULT_CONTENT_TYPE;

    const properties: Record<string, unknown> = {
      user_id: this.userId,
      doc_type: 'memory',
      content: input.content,
      title: input.title,
      summary: input.title,
      content_type: contentType,
      weight: input.weight ?? 0.5,
      trust_score: normalizeTrustScore(input.trust ?? TrustLevel.INTERNAL),
      confidence: 1.0,
      context_summary: input.context_summary || 'Memory created',
      context_conversation_id: input.context_conversation_id,
      relationship_ids: [],
      relationship_count: 0,
      rating_sum: 0,
      rating_count: 0,
      rating_bayesian: 3.0,  // (0 + 15) / (0 + 5) = 3.0 (prior mean)
      access_count: 0,
      last_accessed_at: now,
      created_at: now,
      updated_at: now,
      version: 1,
      tags: input.tags || [],
      references: input.references || [],
      template_id: input.template_id,
      base_weight: input.weight ?? 0.5,
      computed_weight: input.weight ?? 0.5,
      parent_id: input.parent_id ?? null,
      thread_root_id: input.thread_root_id ?? null,
      moderation_flags: input.moderation_flags ?? [],
      follow_up_at: input.follow_up_at || null,
      is_user_organized: input.is_user_organized ?? false,
      space_ids: [],
      group_ids: [],
    };

    // Pass through emotional/functional dimensions
    for (const dim of ALL_SCORING_DIMENSIONS) {
      const value = input[dim as keyof CreateMemoryInput] as number | undefined;
      if (value !== undefined) {
        properties[dim] = value;
      }
    }

    // Pass through observation
    if (input.observation !== undefined) {
      properties.observation = input.observation;
    }

    // Compute or pass through composites
    const composites = computeComposites(input);
    if (composites.feel_significance !== null) properties.feel_significance = composites.feel_significance;
    if (composites.functional_significance !== null) properties.functional_significance = composites.functional_significance;
    if (composites.total_significance !== null) properties.total_significance = composites.total_significance;

    // REM metadata: NOT settable via create (REM-only)
    properties.rem_visits = 0;

    const memoryId = await this.collection.data.insert({ properties });
    this.logger.info('Memory created', { memoryId, userId: this.userId });

    // Index memory UUID → collection name for cross-collection resolution
    try {
      const collectionName = this.collection.name;
      await this.options.memoryIndex.index(memoryId, collectionName);
    } catch (err) {
      this.logger.warn?.(`[MemoryService] Index write failed for ${memoryId}: ${err}`);
    }

    return { memory_id: memoryId, created_at: now };
  }

  // ── Search (hybrid) ─────────────────────────────────────────────────

  async search(input: SearchMemoryInput): Promise<SearchMemoryResult> {
    if (!input.query?.trim()) throw new Error('Query cannot be empty');

    const includeRelationships = input.include_relationships !== false;
    const alpha = input.alpha ?? 0.7;
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;

    const searchFilters = includeRelationships
      ? buildCombinedSearchFilters(this.collection, input.filters)
      : buildMemoryOnlyFilters(this.collection, input.filters);

    // Ghost/trust filtering
    const ghostFilters: any[] = [];
    if (input.ghost_context) {
      ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
    }
    if (!input.ghost_context?.include_ghost_content && !input.filters?.types?.includes('ghost')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
    }
    if (!input.filters?.types?.includes('rem')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
    }

    // Use BM25 for wildcard queries since vectorizing '*' is meaningless
    // and fails on collections without a vectorizer configured.
    const isWildcard = input.query === '*';

    const executeSearch = async (useDeletedFilter: boolean) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;

      const combinedFilters = combineFiltersWithAnd(
        [deletedFilter, searchFilters, ...ghostFilters].filter((f) => f !== null),
      );

      const searchOptions: any = { limit: limit + offset };
      if (combinedFilters) searchOptions.filters = combinedFilters;

      if (isWildcard) {
        return this.collection.query.fetchObjects(searchOptions);
      } else {
        searchOptions.alpha = alpha;
        return this.collection.query.hybrid(input.query, searchOptions);
      }
    };

    const results = await this.retryWithoutDeletedFilter(executeSearch);
    const paginated = results.objects.slice(offset);

    const memories: Record<string, unknown>[] = [];
    const relationships: Record<string, unknown>[] = [];

    for (const obj of paginated) {
      const doc = normalizeDoc({ id: obj.uuid, ...obj.properties });
      if (doc.doc_type === 'memory') memories.push(doc);
      else if (doc.doc_type === 'relationship') relationships.push(doc);
    }

    return {
      memories,
      relationships: includeRelationships ? relationships : undefined,
      total: memories.length + relationships.length,
      offset,
      limit,
    };
  }

  // ── By Time (chronological sort) ───────────────────────────────────

  async byTime(input: TimeModeRequest): Promise<TimeModeResult> {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const direction = input.direction ?? 'desc';

    // Build filters
    const memoryFilters = buildMemoryOnlyFilters(this.collection, input.filters);

    // Ghost/trust filtering
    const ghostFilters: any[] = [];
    if (input.ghost_context) {
      ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
    }
    if (!input.ghost_context?.include_ghost_content && !input.filters?.types?.includes('ghost')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
    }
    if (!input.filters?.types?.includes('rem')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
    }

    const executeQuery = async (useDeletedFilter: boolean) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;

      const combinedFilters = combineFiltersWithAnd(
        [deletedFilter, memoryFilters, ...ghostFilters].filter((f) => f !== null),
      );

      const queryOptions: any = {
        limit: limit + offset,
        sort: this.collection.sort.byProperty('created_at', direction === 'asc'),
      };

      if (combinedFilters) {
        queryOptions.filters = combinedFilters;
      }

      return this.collection.query.fetchObjects(queryOptions);
    };

    const results = await this.retryWithoutDeletedFilter(executeQuery);
    const paginated = results.objects.slice(offset);

    const memories: Record<string, unknown>[] = [];
    for (const obj of paginated) {
      const doc = normalizeDoc({ id: obj.uuid, ...obj.properties });
      if (doc.doc_type === 'memory') {
        memories.push(doc);
      }
    }

    return {
      memories,
      total: memories.length,
      offset,
      limit,
    };
  }

  // ── By Density (relationship count) ────────────────────────────────

  async byDensity(input: DensityModeRequest): Promise<DensityModeResult> {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    // Build filters
    const memoryFilters = buildMemoryOnlyFilters(this.collection, input.filters);

    // Ghost/trust filtering
    const ghostFilters: any[] = [];
    if (input.ghost_context) {
      ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
    }
    if (!input.ghost_context?.include_ghost_content && !input.filters?.types?.includes('ghost')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
    }
    if (!input.filters?.types?.includes('rem')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
    }

    // Min relationship count filter
    const densityFilters: any[] = [];
    if (input.min_relationship_count !== undefined) {
      densityFilters.push(
        this.collection.filter.byProperty('relationship_count').greaterOrEqual(input.min_relationship_count),
      );
    }

    const executeQuery = async (useDeletedFilter: boolean) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;

      const combinedFilters = combineFiltersWithAnd(
        [deletedFilter, memoryFilters, ...ghostFilters, ...densityFilters].filter((f) => f !== null),
      );

      const queryOptions: any = {
        limit: limit + offset,
        sort: this.collection.sort.byProperty('relationship_count', false),
      };

      if (combinedFilters) {
        queryOptions.filters = combinedFilters;
      }

      return this.collection.query.fetchObjects(queryOptions);
    };

    const results = await this.retryWithoutDeletedFilter(executeQuery);
    const paginated = results.objects.slice(offset);

    const memories: Record<string, unknown>[] = [];
    for (const obj of paginated) {
      const doc = normalizeDoc({ id: obj.uuid, ...obj.properties });
      if (doc.doc_type === 'memory') {
        memories.push(doc);
      }
    }

    return {
      memories,
      total: memories.length,
      offset,
      limit,
    };
  }

  // ── By Rating (Bayesian average) ─────────────────────────────────

  async byRating(input: RatingModeRequest): Promise<RatingModeResult> {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const direction = input.direction ?? 'desc';

    // Build filters
    const memoryFilters = buildMemoryOnlyFilters(this.collection, input.filters);

    // Ghost/trust filtering
    const ghostFilters: any[] = [];
    if (input.ghost_context) {
      ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
    }
    if (!input.ghost_context?.include_ghost_content && !input.filters?.types?.includes('ghost')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
    }
    if (!input.filters?.types?.includes('rem')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
    }

    const executeQuery = async (useDeletedFilter: boolean) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;

      const combinedFilters = combineFiltersWithAnd(
        [deletedFilter, memoryFilters, ...ghostFilters].filter((f) => f !== null),
      );

      const queryOptions: any = {
        limit: limit + offset,
        sort: this.collection.sort.byProperty('rating_bayesian', direction === 'asc'),
      };

      if (combinedFilters) {
        queryOptions.filters = combinedFilters;
      }

      return this.collection.query.fetchObjects(queryOptions);
    };

    const results = await this.retryWithoutDeletedFilter(executeQuery);
    const paginated = results.objects.slice(offset);

    const memories: Record<string, unknown>[] = [];
    for (const obj of paginated) {
      const doc = normalizeDoc({ id: obj.uuid, ...obj.properties });
      if (doc.doc_type === 'memory') {
        memories.push(doc);
      }
    }

    return {
      memories,
      total: memories.length,
      offset,
      limit,
    };
  }

  // ── By Discovery (interleaved rated + unrated) ────────────────────

  async byDiscovery(input: DiscoveryModeRequest): Promise<DiscoveryModeResult> {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    // Build shared filters
    const memoryFilters = buildMemoryOnlyFilters(this.collection, input.filters);
    const ghostFilters: any[] = [];
    if (input.ghost_context) {
      ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
    }
    if (!input.ghost_context?.include_ghost_content && !input.filters?.types?.includes('ghost')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
    }
    if (!input.filters?.types?.includes('rem')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
    }

    const buildBaseFilters = (useDeletedFilter: boolean) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;
      return [deletedFilter, memoryFilters, ...ghostFilters].filter((f) => f !== null);
    };

    // Generous fetch — we merge in-memory then slice
    const fetchLimit = (limit + offset) * 2;

    const hasQuery = input.query?.trim();

    // Rated pool: rating_count >= threshold
    const executeRated = async (useDeletedFilter: boolean) => {
      const base = buildBaseFilters(useDeletedFilter);
      base.push(this.collection.filter.byProperty('rating_count').greaterOrEqual(RATING_MIN_THRESHOLD));
      const combinedFilters = combineFiltersWithAnd(base);
      const queryOptions: any = { limit: fetchLimit };
      if (combinedFilters) queryOptions.filters = combinedFilters;
      if (hasQuery) {
        queryOptions.alpha = 0.7;
        return this.collection.query.hybrid(input.query!, queryOptions);
      }
      queryOptions.sort = this.collection.sort.byProperty('rating_bayesian', false);
      return this.collection.query.fetchObjects(queryOptions);
    };

    // Discovery pool: rating_count < threshold
    const executeDiscovery = async (useDeletedFilter: boolean) => {
      const base = buildBaseFilters(useDeletedFilter);
      base.push(this.collection.filter.byProperty('rating_count').lessThan(RATING_MIN_THRESHOLD));
      const combinedFilters = combineFiltersWithAnd(base);
      const queryOptions: any = { limit: fetchLimit };
      if (combinedFilters) queryOptions.filters = combinedFilters;
      if (hasQuery) {
        queryOptions.alpha = 0.7;
        return this.collection.query.hybrid(input.query!, queryOptions);
      }
      queryOptions.sort = this.collection.sort.byProperty('created_at', false);
      return this.collection.query.fetchObjects(queryOptions);
    };

    const [ratedResults, discoveryResults] = await Promise.all([
      this.retryWithoutDeletedFilter(executeRated),
      this.retryWithoutDeletedFilter(executeDiscovery),
    ]);

    const toDoc = (obj: any) => normalizeDoc({ id: obj.uuid, ...obj.properties });
    const ratedDocs = ratedResults.objects.map(toDoc).filter((d: any) => d.doc_type === 'memory');
    const discoveryDocs = discoveryResults.objects.map(toDoc).filter((d: any) => d.doc_type === 'memory');

    const interleaved = interleaveDiscovery({
      rated: ratedDocs,
      discovery: discoveryDocs,
      ratio: DISCOVERY_RATIO,
      offset,
      limit,
    });

    const memories = interleaved.map((item) => {
      const doc = item.item as Record<string, unknown>;
      return Object.assign({}, doc, { is_discovery: item.is_discovery });
    });

    return {
      memories,
      total: memories.length,
      offset,
      limit,
    };
  }

  // ── By Recommendation (personalized via preference centroid) ───────

  async byRecommendation(input: RecommendationModeRequest): Promise<RecommendationModeResult> {
    const recommendationService = this.options.recommendationService;
    if (!recommendationService) {
      throw new Error('RecommendationService is required for byRecommendation sort mode');
    }

    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    // 1. Get or compute centroid
    const centroidResult = await recommendationService.getOrComputeCentroid(input.userId);

    // 2. Fallback to byDiscovery if insufficient data
    if (centroidResult.insufficientData || !centroidResult.centroid) {
      const discoveryResults = await this.byDiscovery({
        query: input.query,
        limit,
        offset,
        filters: input.filters,
        deleted_filter: input.deleted_filter,
        ghost_context: input.ghost_context,
      });

      return {
        memories: discoveryResults.memories.map((m) => ({
          ...m,
          similarity_pct: 0,
        })),
        profileSize: 0,
        insufficientData: true,
        fallback_sort_mode: 'byDiscovery',
        total: discoveryResults.total,
        offset: discoveryResults.offset,
        limit: discoveryResults.limit,
      };
    }

    // 3. Build exclusion filters: already-rated + own memories
    const ratedIds = await recommendationService.getAllUserRatedIds(input.userId);

    const memoryFilters = buildMemoryOnlyFilters(this.collection, input.filters);
    const ghostFilters: any[] = [];
    if (input.ghost_context) {
      ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
    }
    if (!input.ghost_context?.include_ghost_content && !input.filters?.types?.includes('ghost')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
    }
    if (!input.filters?.types?.includes('rem')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
    }

    // Exclude user's own memories
    const authorFilter = this.collection.filter.byProperty('user_id').notEqual(input.userId);

    // 4. Execute nearVector search
    const results = await this.retryWithoutDeletedFilter(async (useDeletedFilter) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;

      const allFilters = [deletedFilter, memoryFilters, authorFilter, ...ghostFilters].filter((f) => f !== null);
      const combinedFilters = combineFiltersWithAnd(allFilters);

      const opts: any = {
        limit: (limit + offset) + ratedIds.length, // fetch extra to account for post-exclusion
        returnMetadata: ['distance'],
      };
      if (combinedFilters) opts.filters = combinedFilters;

      return this.collection.query.nearVector(centroidResult.centroid!.vector, opts);
    });

    // 5. Filter out already-rated memories and apply similarity threshold
    const ratedIdSet = new Set(ratedIds);
    const MIN_SIMILARITY_THRESHOLD = MIN_SIMILARITY * 100;

    const memories: RecommendedMemory[] = [];
    for (const obj of results.objects) {
      if (ratedIdSet.has(obj.uuid)) continue;

      const doc = normalizeDoc({ id: obj.uuid, ...obj.properties });
      if (doc.doc_type !== 'memory') continue;

      const distance = obj.metadata?.distance ?? 1;
      const similarityPct = Math.round((1 - distance) * 100);

      if (similarityPct < MIN_SIMILARITY_THRESHOLD) continue;

      memories.push({
        ...doc,
        similarity_pct: similarityPct,
      });
    }

    // 6. Apply pagination
    const paginated = memories.slice(offset, offset + limit);

    return {
      memories: paginated,
      profileSize: centroidResult.centroid!.profileSize,
      insufficientData: false,
      total: paginated.length,
      offset,
      limit,
    };
  }

  // ── By Property (generic sort by any Weaviate property) ────────────

  async byProperty(input: PropertyModeRequest): Promise<PropertyModeResult> {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const { sort_field, sort_direction } = input;

    // Validate sort_field
    const validFields = new Set<string>(ALL_MEMORY_PROPERTIES);
    if (!validFields.has(sort_field)) {
      throw new Error(`Invalid sort_field "${sort_field}". Must be a valid memory property.`);
    }

    const memoryFilters = buildMemoryOnlyFilters(this.collection, input.filters);
    const ghostFilters: any[] = [];
    if (input.ghost_context) {
      ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
    }
    if (!input.ghost_context?.include_ghost_content && !input.filters?.types?.includes('ghost')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
    }
    if (!input.filters?.types?.includes('rem')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
    }

    const executeQuery = async (useDeletedFilter: boolean) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;

      const combinedFilters = combineFiltersWithAnd(
        [deletedFilter, memoryFilters, ...ghostFilters].filter((f) => f !== null),
      );

      const queryOptions: any = {
        limit: limit + offset,
        sort: this.collection.sort.byProperty(sort_field, sort_direction === 'asc'),
      };

      if (combinedFilters) {
        queryOptions.filters = combinedFilters;
      }

      return this.collection.query.fetchObjects(queryOptions);
    };

    const results = await this.retryWithoutDeletedFilter(executeQuery);
    const paginated = results.objects.slice(offset);

    const memories: Record<string, unknown>[] = [];
    for (const obj of paginated) {
      const doc = normalizeDoc({ id: obj.uuid, ...obj.properties });
      if (doc.doc_type === 'memory') {
        memories.push(doc);
      }
    }

    return {
      memories,
      total: memories.length,
      offset,
      limit,
      sort_field,
      sort_direction,
    };
  }

  // ── By Broad (truncated content for scan-and-drill-in) ─────────────

  async byBroad(input: BroadModeRequest): Promise<BroadModeResult> {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const sortOrder = input.sort_order ?? 'desc';

    const memoryFilters = buildMemoryOnlyFilters(this.collection, input.filters);
    const ghostFilters: any[] = [];
    if (input.ghost_context) {
      ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
    }
    if (!input.ghost_context?.include_ghost_content && !input.filters?.types?.includes('ghost')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
    }
    if (!input.filters?.types?.includes('rem')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
    }

    const executeQuery = async (useDeletedFilter: boolean) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;

      const combinedFilters = combineFiltersWithAnd(
        [deletedFilter, memoryFilters, ...ghostFilters].filter((f) => f !== null),
      );

      const queryOptions: any = {
        limit: limit + offset,
        sort: this.collection.sort.byProperty('created_at', sortOrder === 'asc'),
      };

      if (combinedFilters) {
        queryOptions.filters = combinedFilters;
      }

      return this.collection.query.fetchObjects(queryOptions);
    };

    const results = await this.retryWithoutDeletedFilter(executeQuery);
    const paginated = results.objects.slice(offset);

    const broadResults: BroadSearchResult[] = [];
    for (const obj of paginated) {
      if (obj.properties.doc_type !== 'memory') continue;

      const content = (obj.properties.content as string) ?? '';
      const sliced = sliceContent(content);

      const result: BroadSearchResult = {
        memory_id: obj.uuid,
        content_type: (obj.properties.content_type as string) ?? 'note',
        content_head: sliced.head,
        content_mid: sliced.mid,
        content_tail: sliced.tail,
        created_at: (obj.properties.created_at as string) ?? '',
        tags: (obj.properties.tags as string[]) ?? [],
        weight: (obj.properties.weight as number) ?? 0.5,
      };

      if (obj.properties.title) result.title = obj.properties.title as string;
      if (obj.properties.total_significance != null) result.total_significance = obj.properties.total_significance as number;
      if (obj.properties.feel_significance != null) result.feel_significance = obj.properties.feel_significance as number;
      if (obj.properties.functional_significance != null) result.functional_significance = obj.properties.functional_significance as number;

      broadResults.push(result);
    }

    return {
      results: broadResults,
      total: broadResults.length,
      offset,
      limit,
    };
  }

  // ── By Random (random sampling) ──────────────────────────────────────

  async byRandom(input: RandomModeRequest): Promise<RandomModeResult> {
    const limit = input.limit ?? 10;
    const POOL_FETCH_LIMIT = 1000;

    const memoryFilters = buildMemoryOnlyFilters(this.collection, input.filters);
    const ghostFilters: any[] = [];
    if (input.ghost_context) {
      ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
    }
    if (!input.ghost_context?.include_ghost_content && !input.filters?.types?.includes('ghost')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
    }
    if (!input.filters?.types?.includes('rem')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
    }

    const executeQuery = async (useDeletedFilter: boolean) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;

      const combinedFilters = combineFiltersWithAnd(
        [deletedFilter, memoryFilters, ...ghostFilters].filter((f) => f !== null),
      );

      const queryOptions: any = { limit: POOL_FETCH_LIMIT };
      if (combinedFilters) {
        queryOptions.filters = combinedFilters;
      }

      return this.collection.query.fetchObjects(queryOptions);
    };

    const results = await this.retryWithoutDeletedFilter(executeQuery);

    // Filter to memory docs only
    const pool = results.objects.filter((obj: any) => obj.properties.doc_type === 'memory');
    const totalPoolSize = pool.length;

    if (totalPoolSize === 0) {
      return { results: [], total_pool_size: 0 };
    }

    // Random sampling using Fisher-Yates partial shuffle
    const sampleSize = Math.min(limit, totalPoolSize);
    const indices = Array.from({ length: totalPoolSize }, (_, i) => i);
    for (let i = totalPoolSize - 1; i > totalPoolSize - 1 - sampleSize && i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const selectedIndices = indices.slice(totalPoolSize - sampleSize);
    const memories: Record<string, unknown>[] = selectedIndices.map((idx) => {
      const obj = pool[idx];
      return normalizeDoc({ id: obj.uuid, ...obj.properties });
    });

    return {
      results: memories,
      total_pool_size: totalPoolSize,
    };
  }

  // ── By Curated (composite quality score) ──────────────────────────

  async byCurated(input: CuratedModeRequest): Promise<CuratedModeResult> {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const direction = input.direction ?? 'desc';

    // Build filters
    const memoryFilters = buildMemoryOnlyFilters(this.collection, input.filters);
    const ghostFilters: any[] = [];
    if (input.ghost_context) {
      ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
    }
    if (!input.ghost_context?.include_ghost_content && !input.filters?.types?.includes('ghost')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
    }
    if (!input.filters?.types?.includes('rem')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
    }

    const hasQuery = input.query?.trim();
    const fetchLimit = (limit + offset) * 2; // generous fetch for interleaving

    // Scored pool: curated_score > 0
    const executeScoredQuery = async (useDeletedFilter: boolean) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;
      const scoredFilter = this.collection.filter.byProperty('curated_score').greaterThan(0);
      const combined = combineFiltersWithAnd(
        [deletedFilter, memoryFilters, scoredFilter, ...ghostFilters].filter((f) => f !== null),
      );

      if (hasQuery) {
        const queryOptions: any = {
          limit: fetchLimit,
          alpha: 0.7,
          query: hasQuery,
        };
        if (combined) queryOptions.filters = combined;
        return this.collection.query.hybrid(hasQuery, queryOptions);
      }

      const queryOptions: any = {
        limit: fetchLimit,
        sort: this.collection.sort.byProperty('curated_score', direction === 'asc'),
      };
      if (combined) queryOptions.filters = combined;
      return this.collection.query.fetchObjects(queryOptions);
    };

    // Unscored pool: curated_score is 0 or null (for interleaving)
    const executeUnscoredQuery = async (useDeletedFilter: boolean) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;

      const unscoredFilters: any[] = [];
      // Weaviate doesn't have isNull for numbers, so we look for curated_score = 0 or
      // fetch all and filter client-side. Use greaterThan(0) negation via separate query.
      const combined = combineFiltersWithAnd(
        [deletedFilter, memoryFilters, ...ghostFilters].filter((f) => f !== null),
      );

      const queryOptions: any = {
        limit: Math.ceil(fetchLimit / 4),
        sort: this.collection.sort.byProperty('created_at', false), // newest first
      };
      if (combined) queryOptions.filters = combined;
      return this.collection.query.fetchObjects(queryOptions);
    };

    const scoredResults = await this.retryWithoutDeletedFilter(executeScoredQuery);
    const unscoredResults = await this.retryWithoutDeletedFilter(executeUnscoredQuery);

    // Normalize results
    const scored: Record<string, unknown>[] = [];
    for (const obj of scoredResults.objects) {
      const doc = normalizeDoc({ id: obj.uuid, ...obj.properties });
      if (doc.doc_type === 'memory' && (doc.curated_score as number) > 0) {
        scored.push(doc);
      }
    }

    // If search mode, re-rank scored by curated_score
    if (hasQuery) {
      scored.sort((a, b) => {
        const aScore = (a.curated_score as number) ?? 0;
        const bScore = (b.curated_score as number) ?? 0;
        return direction === 'asc' ? aScore - bScore : bScore - aScore;
      });
    }

    const unscored: Record<string, unknown>[] = [];
    for (const obj of unscoredResults.objects) {
      const doc = normalizeDoc({ id: obj.uuid, ...obj.properties });
      if (doc.doc_type === 'memory' && !(doc.curated_score as number)) {
        unscored.push(doc);
      }
    }

    // Interleave at 4:1 ratio (same as byDiscovery)
    const interleaved = interleaveDiscovery<Record<string, unknown>>({
      rated: scored,
      discovery: unscored,
      offset,
      limit,
    });

    const memories = interleaved.map((item) => ({
      ...item.item,
      ...(item.is_discovery ? { is_discovery: true } : {}),
    }));

    return {
      memories,
      total: memories.length,
      offset,
      limit,
    };
  }

  // ── Find Similar (vector) ──────────────────────────────────────────

  async findSimilar(input: FindSimilarInput): Promise<FindSimilarResult> {
    if (!input.memory_id && !input.text) throw new Error('Either memory_id or text must be provided');
    if (input.memory_id && input.text) throw new Error('Provide either memory_id or text, not both');

    const limit = input.limit ?? 10;
    const minSimilarity = input.min_similarity ?? 0.7;

    // Ghost/trust filtering
    const ghostFilters: any[] = [];
    if (input.ghost_context) {
      ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
    }
    if (!input.ghost_context?.include_ghost_content) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
    }
    ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
    ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('comment'));

    let memoryObj: any = null;
    if (input.memory_id) {
      memoryObj = await this.collection.query.fetchObjectById(input.memory_id, {
        returnProperties: ['user_id', 'doc_type', 'content'],
      });
      if (!memoryObj) throw new Error(`Memory not found: ${input.memory_id}`);
      if (memoryObj.properties.user_id !== this.userId) throw new Error('Unauthorized');
      if (memoryObj.properties.doc_type !== 'memory') throw new Error('Can only find similar for memory documents');
    }

    const results: any = await this.retryWithoutDeletedFilter(async (useDeletedFilter) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;
      const combinedFilter = combineFiltersWithAnd(
        [deletedFilter, ...ghostFilters].filter((f) => f !== null),
      );

      if (input.memory_id) {
        const opts: any = { limit: limit + 1, distance: 1 - minSimilarity, returnMetadata: ['distance'] };
        if (combinedFilter) opts.filters = combinedFilter;
        const res = await this.collection.query.nearObject(input.memory_id, opts);
        res.objects = res.objects.filter((o: any) => o.uuid !== input.memory_id);
        return res;
      } else {
        const opts: any = { limit, distance: 1 - minSimilarity, returnMetadata: ['distance'] };
        if (combinedFilter) opts.filters = combinedFilter;
        return this.collection.query.nearText(input.text!, opts);
      }
    });

    if (!input.include_relationships) {
      results.objects = results.objects.filter((o: any) => o.properties.doc_type === 'memory');
    }

    const items: SimilarMemoryItem[] = results.objects
      .map((obj: any) => normalizeDoc({
        id: obj.uuid,
        ...obj.properties,
        similarity: Math.max(0, Math.min(1, 1 - (obj.metadata?.distance ?? 0))),
      }) as SimilarMemoryItem)
      .sort((a: SimilarMemoryItem, b: SimilarMemoryItem) => b.similarity - a.similarity)
      .slice(0, limit);

    return { similar_memories: items, total: items.length };
  }

  // ── Query (semantic / nearText) ────────────────────────────────────

  async query(input: QueryMemoryInput): Promise<QueryMemoryResult> {
    if (!input.query?.trim()) throw new Error('Query cannot be empty');

    const limit = input.limit ?? 5;
    const minRelevance = input.min_relevance ?? 0.6;

    const searchFilters = buildCombinedSearchFilters(this.collection, input.filters);

    // Ghost/trust filtering
    const ghostFilters: any[] = [];
    if (input.ghost_context) {
      ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
    }
    if (!input.ghost_context?.include_ghost_content && !input.filters?.types?.includes('ghost')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
    }
    if (!input.filters?.types?.includes('rem')) {
      ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
    }

    const results = await this.retryWithoutDeletedFilter(async (useDeletedFilter) => {
      const deletedFilter = useDeletedFilter
        ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
        : null;

      const combinedFilters = combineFiltersWithAnd(
        [deletedFilter, searchFilters, ...ghostFilters].filter((f) => f !== null),
      );

      const opts: any = { limit, distance: 1 - minRelevance, returnMetadata: ['distance'] };
      if (combinedFilters) opts.filters = combinedFilters;

      return this.collection.query.nearText(input.query, opts);
    });

    const items: RelevantMemoryItem[] = results.objects
      .map((obj: any) => normalizeDoc({
        id: obj.uuid,
        ...obj.properties,
        relevance: Math.max(0, Math.min(1, 1 - (obj.metadata?.distance ?? 0))),
      }) as RelevantMemoryItem)
      .sort((a: RelevantMemoryItem, b: RelevantMemoryItem) => b.relevance - a.relevance);

    return { memories: items, total: items.length };
  }

  // ── Update ─────────────────────────────────────────────────────────

  async update(input: UpdateMemoryInput): Promise<UpdateMemoryResult> {
    const existing = await fetchMemoryWithAllProperties(this.collection, input.memory_id);
    if (!existing?.properties) throw new Error(`Memory not found: ${input.memory_id}`);
    if (existing.properties.user_id !== this.userId) throw new Error('Unauthorized');
    if (existing.properties.doc_type !== 'memory') throw new Error('Cannot update relationships with this method');
    if (existing.properties.deleted_at) throw new Error(`Cannot update deleted memory: ${input.memory_id}`);

    const updates: Record<string, unknown> = {};
    const updatedFields: string[] = [];

    if (input.content !== undefined) { updates.content = input.content; updatedFields.push('content'); }
    if (input.title !== undefined) { updates.title = input.title; updates.summary = input.title; updatedFields.push('title'); }
    if (input.type !== undefined) {
      if (!isValidContentType(input.type)) throw new Error(`Invalid content type: ${input.type}`);
      updates.content_type = input.type; updatedFields.push('content_type');
    }
    if (input.weight !== undefined) {
      if (input.weight < 0 || input.weight > 1) throw new Error('Weight must be between 0 and 1');
      updates.weight = input.weight; updates.base_weight = input.weight; updates.computed_weight = input.weight;
      updatedFields.push('weight');
    }
    if (input.trust !== undefined) {
      if (!isValidTrustLevel(input.trust)) throw new Error('Trust must be an integer between 1 and 5');
      updates.trust_score = input.trust; updatedFields.push('trust_score');
    }
    if (input.tags !== undefined) { updates.tags = input.tags; updatedFields.push('tags'); }
    if (input.references !== undefined) { updates.references = input.references; updatedFields.push('references'); }
    if (input.parent_id !== undefined) { updates.parent_id = input.parent_id; updatedFields.push('parent_id'); }
    if (input.thread_root_id !== undefined) { updates.thread_root_id = input.thread_root_id; updatedFields.push('thread_root_id'); }
    if (input.moderation_flags !== undefined) { updates.moderation_flags = input.moderation_flags; updatedFields.push('moderation_flags'); }
    if (input.is_user_organized !== undefined) { updates.is_user_organized = input.is_user_organized; updatedFields.push('is_user_organized'); }

    if (updatedFields.length === 0) throw new Error('No fields provided for update');

    const now = new Date().toISOString();
    updates.updated_at = now;
    updates.version = (existing.properties.version as number) + 1;

    // Use replace() instead of update() (Weaviate bug with non-vectorized fields)
    await this.collection.data.replace({
      id: input.memory_id,
      properties: { ...existing.properties, ...updates },
    });

    this.logger.info('Memory updated', {
      memoryId: input.memory_id,
      version: updates.version,
      updatedFields,
    });

    return {
      memory_id: input.memory_id,
      updated_at: now,
      version: updates.version as number,
      updated_fields: updatedFields,
    };
  }

  // ── Delete (soft) ──────────────────────────────────────────────────

  async delete(input: DeleteMemoryInput): Promise<DeleteMemoryResult> {
    const existing = await fetchMemoryWithAllProperties(this.collection, input.memory_id);
    if (!existing?.properties) throw new Error(`Memory not found: ${input.memory_id}`);
    if (existing.properties.user_id !== this.userId) throw new Error('Unauthorized');
    if (existing.properties.doc_type !== 'memory') throw new Error('Cannot delete relationships with this method');
    if (existing.properties.deleted_at) throw new Error(`Memory already deleted: ${input.memory_id}`);

    // Find orphaned relationships
    const relResults = await this.collection.query.fetchObjects({
      filters: Filters.and(
        this.collection.filter.byProperty('doc_type').equal('relationship'),
        this.collection.filter.byProperty('related_memory_ids').containsAny([input.memory_id]),
      ),
      limit: 100,
    });
    const orphanedIds = relResults.objects.map((r: any) => r.uuid);

    // Soft delete — set deleted_at, deleted_by, deletion_reason
    const now = new Date().toISOString();
    await this.collection.data.replace({
      id: input.memory_id,
      properties: {
        ...existing.properties,
        deleted_at: now,
        deleted_by: this.userId,
        deletion_reason: input.reason || null,
        updated_at: now,
      },
    });

    this.logger.info('Memory soft-deleted', {
      memoryId: input.memory_id,
      orphanedRelationships: orphanedIds.length,
    });

    return {
      memory_id: input.memory_id,
      deleted_at: now,
      orphaned_relationship_ids: orphanedIds,
    };
  }

  // ── Engagement Counters ───────────────────────────────────────────

  async incrementClick(memoryId: string): Promise<void> {
    await this.incrementCounter(memoryId, 'click_count');
  }

  async incrementShare(memoryId: string): Promise<void> {
    await this.incrementCounter(memoryId, 'share_count');
  }

  async incrementComment(memoryId: string): Promise<void> {
    await this.incrementCounter(memoryId, 'comment_count');
  }

  private async incrementCounter(memoryId: string, field: string): Promise<void> {
    const existing = await this.collection.query.fetchObjectById(memoryId, {
      returnProperties: [field],
    });
    if (!existing) throw new Error(`Memory not found: ${memoryId}`);
    const current = (existing.properties?.[field] as number) ?? 0;
    await this.collection.data.update({
      id: memoryId,
      properties: { [field]: current + 1 },
    });
  }
}
