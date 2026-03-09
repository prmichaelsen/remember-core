/**
 * SpaceService — publish/retract/revise/confirm/deny/moderate/search/query.
 *
 * Extracted from 8 remember-mcp tool handlers:
 *   publish.ts, retract.ts, revise.ts, confirm.ts,
 *   deny.ts, moderate.ts, search-space.ts, query-space.ts
 *
 * Design: accepts Weaviate client + user collection + ConfirmationTokenService + Logger via constructor.
 * No MCP-specific code.
 */

import { Filters } from 'weaviate-client';
import type { Logger } from '../utils/logger.js';
import type { AuthContext } from '../types/auth.types.js';
import type { ConfirmationTokenService, ConfirmationRequest } from './confirmation-token.service.js';
import { fetchMemoryWithAllProperties } from '../database/weaviate/client.js';
import { ensurePublicCollection, isValidSpaceId } from '../database/weaviate/space-schema.js';
import { SPACE_CONTENT_TYPE_RESTRICTIONS, type SpaceId } from '../types/space.types.js';
import { ensureGroupCollection } from '../database/weaviate/v2-collections.js';
import { CollectionType, getCollectionName } from '../collections/dot-notation.js';
import { generateCompositeId, compositeIdToUuid, parseCompositeId } from '../collections/composite-ids.js';
import { getSpaceConfig } from './space-config.service.js';
import { canModerate, canModerateAny } from '../utils/auth-helpers.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../errors/app-errors.js';
import type { ModerationClient } from './moderation.service.js';
import type { MemoryIndexService } from './memory-index.service.js';
import { tagWithSource, dedupeBySourceId, type DedupeOptions } from '../utils/dedupe.js';
import { interleaveDiscovery, DISCOVERY_RATIO, DISCOVERY_THRESHOLD } from './discovery.js';
import type { RecommendationService } from './recommendation.service.js';
import { MIN_SIMILARITY } from './recommendation.service.js';
import { sliceContent, type BroadSearchResult } from './memory.service.js';
import { ALL_MEMORY_PROPERTIES } from '../database/weaviate/client.js';
import type { EventBus } from '../webhooks/events.js';

// ─── Shared Types ───────────────────────────────────────────────────────

export type ModerationAction = 'approve' | 'reject' | 'remove';
export type ModerationFilter = 'approved' | 'pending' | 'rejected' | 'removed' | 'all';

const ACTION_TO_STATUS: Record<ModerationAction, string> = {
  approve: 'approved',
  reject: 'rejected',
  remove: 'removed',
};

// ─── Revision History Helpers ───────────────────────────────────────────

const MAX_REVISION_HISTORY = 10;

export interface RevisionEntry {
  content: string;
  revised_at: string;
}

export interface RevisionResult {
  location: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

export function parseRevisionHistory(raw: unknown): RevisionEntry[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RevisionEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof e.content === 'string' &&
        typeof e.revised_at === 'string',
    );
  } catch {
    return [];
  }
}

export function buildRevisionHistory(
  existing: RevisionEntry[],
  oldContent: string,
  revisedAt: string,
): RevisionEntry[] {
  const updated = [{ content: oldContent, revised_at: revisedAt }, ...existing];
  return updated.slice(0, MAX_REVISION_HISTORY);
}

// ─── Filter Helpers ─────────────────────────────────────────────────────

export function buildModerationFilter(
  collection: any,
  moderationFilter: ModerationFilter = 'approved',
): any | null {
  if (moderationFilter === 'all') return null;

  if (moderationFilter === 'approved') {
    return Filters.or(
      collection.filter.byProperty('moderation_status').equal('approved'),
      collection.filter.byProperty('moderation_status').isNull(true),
    );
  }

  return collection.filter.byProperty('moderation_status').equal(moderationFilter);
}

// ─── Input/Output Types ─────────────────────────────────────────────────

export interface PublishInput {
  memory_id: string;
  spaces?: string[];
  groups?: string[];
  additional_tags?: string[];
}

export interface PublishResult {
  token: string;
}

export interface RetractInput {
  memory_id: string;
  spaces?: string[];
  groups?: string[];
}

export interface RetractResult {
  token: string;
}

export interface ReviseInput {
  memory_id: string;
}

export interface ReviseResult {
  token: string;
}

export interface ConfirmInput {
  token: string;
}

export interface ConfirmResult {
  action: string;
  success: boolean;
  composite_id?: string;
  published_to?: string[];
  retracted_from?: string[];
  revised_at?: string;
  space_ids?: string[];
  group_ids?: string[];
  failed?: string[];
  results?: RevisionResult[];
  memory_id?: string;
}

export interface DenyInput {
  token: string;
}

export interface DenyResult {
  success: boolean;
}

export interface ModerateInput {
  memory_id: string;
  space_id?: string;
  group_id?: string;
  action: ModerationAction;
  reason?: string;
}

export interface ModerateResult {
  memory_id: string;
  action: ModerationAction;
  moderation_status: string;
  moderated_by: string;
  moderated_at: string;
  location: string;
}

export interface SearchSpaceInput {
  query: string;
  spaces?: string[];
  groups?: string[];
  search_type?: 'hybrid' | 'bm25' | 'semantic';
  content_type?: string;
  tags?: string[];
  min_weight?: number;
  max_weight?: number;
  date_from?: string;
  date_to?: string;
  moderation_filter?: ModerationFilter;
  include_comments?: boolean;
  limit?: number;
  offset?: number;
  /** Content-hash deduplication options */
  dedupe?: DedupeOptions;
}

export interface SearchSpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

export interface QuerySpaceInput {
  question: string;
  spaces: string[];
  content_type?: string;
  tags?: string[];
  min_weight?: number;
  date_from?: string;
  date_to?: string;
  moderation_filter?: ModerationFilter;
  include_comments?: boolean;
  limit?: number;
}

export interface QuerySpaceResult {
  question: string;
  spaces_queried: string[];
  memories: Record<string, unknown>[];
  total: number;
}

export interface DiscoverySpaceInput {
  query?: string;
  spaces?: string[];
  groups?: string[];
  content_type?: string;
  tags?: string[];
  min_weight?: number;
  max_weight?: number;
  date_from?: string;
  date_to?: string;
  moderation_filter?: ModerationFilter;
  include_comments?: boolean;
  limit?: number;
  offset?: number;
  dedupe?: DedupeOptions;
}

export interface DiscoverySpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  memories: (Record<string, unknown> & { is_discovery: boolean })[];
  total: number;
  offset: number;
  limit: number;
}

export interface RecommendationSpaceInput {
  userId: string;
  query?: string;
  spaces?: string[];
  groups?: string[];
  content_type?: string;
  tags?: string[];
  min_weight?: number;
  max_weight?: number;
  date_from?: string;
  date_to?: string;
  moderation_filter?: ModerationFilter;
  include_comments?: boolean;
  limit?: number;
  offset?: number;
  dedupe?: DedupeOptions;
}

export interface RecommendedSpaceMemory {
  similarity_pct: number;
  [key: string]: unknown;
}

export interface RecommendationSpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  memories: RecommendedSpaceMemory[];
  profileSize: number;
  insufficientData: boolean;
  fallback_sort_mode?: 'byDiscovery';
  total: number;
  offset: number;
  limit: number;
}

// ─── Space Sort Mode Base ────────────────────────────────────────────────

export interface SpaceSortBaseInput {
  spaces?: string[];
  groups?: string[];
  content_type?: string;
  tags?: string[];
  min_weight?: number;
  max_weight?: number;
  date_from?: string;
  date_to?: string;
  moderation_filter?: ModerationFilter;
  include_comments?: boolean;
  limit?: number;
  offset?: number;
  dedupe?: DedupeOptions;
}

// ── byTime ──

export interface TimeSpaceInput extends SpaceSortBaseInput {
  direction?: 'asc' | 'desc';
}

export interface TimeSpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

// ── byRating ──

export interface RatingSpaceInput extends SpaceSortBaseInput {
  direction?: 'asc' | 'desc';
}

export interface RatingSpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

// ── byProperty ──

export interface PropertySpaceInput extends SpaceSortBaseInput {
  sort_field: string;
  sort_direction: 'asc' | 'desc';
}

export interface PropertySpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
  sort_field: string;
  sort_direction: 'asc' | 'desc';
}

// ── byBroad ──

export interface BroadSpaceInput extends SpaceSortBaseInput {
  query?: string;
  sort_order?: 'asc' | 'desc';
}

export interface BroadSpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  results: BroadSearchResult[];
  total: number;
  offset: number;
  limit: number;
}

// ── byRandom ──

export interface RandomSpaceInput extends SpaceSortBaseInput {
  // limit only, no offset (random has no pagination)
}

export interface RandomSpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  results: Record<string, unknown>[];
  total_pool_size: number;
}

// ── byCurated ──

export interface CuratedSpaceInput extends SpaceSortBaseInput {
  query?: string;
  direction?: 'asc' | 'desc';
}

export interface CuratedSpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

// ─── Service ────────────────────────────────────────────────────────────

/**
 * SpaceService provides transport-agnostic space operations.
 *
 * @param weaviateClient - Weaviate client instance (for multi-collection access)
 * @param userCollection - User's personal Weaviate collection
 * @param userId - The owner user ID
 * @param confirmationTokenService - ConfirmationTokenService instance
 * @param logger - Logger instance
 */
export class SpaceService {
  private moderationClient?: ModerationClient;
  private memoryIndex: MemoryIndexService;
  private recommendationService?: RecommendationService;
  private eventBus?: EventBus;

  constructor(
    private weaviateClient: any,
    private userCollection: any,
    private userId: string,
    private confirmationTokenService: ConfirmationTokenService,
    private logger: Logger,
    private memoryIndexService: MemoryIndexService,
    options?: { moderationClient?: ModerationClient; recommendationService?: RecommendationService; eventBus?: EventBus },
  ) {
    this.moderationClient = options?.moderationClient;
    this.recommendationService = options?.recommendationService;
    this.eventBus = options?.eventBus;
    this.memoryIndex = memoryIndexService;
  }

  // ── Content moderation helper ────────────────────────────────────────

  private async checkModeration(content: string): Promise<void> {
    if (!this.moderationClient) return;
    const result = await this.moderationClient.moderate(content);
    if (!result.pass) {
      throw new ValidationError(result.reason, {
        moderation: ['blocked'],
        ...(result.category ? { category: [result.category] } : {}),
      });
    }
  }

  // ── Resolve composite UUID to original memory ──────────────────────

  /**
   * Looks up a memory in the user's collection. If not found, checks whether
   * the ID is a composite UUID from a published copy and resolves to the
   * original memory via composite_id or original_memory_id.
   */
  private async resolveToOriginalMemory(memoryId: string): Promise<{ resolvedId: string; memory: any }> {
    let memory = await fetchMemoryWithAllProperties(this.userCollection, memoryId);
    if (memory) {
      if (memory.properties.user_id !== this.userId) throw new ForbiddenError('Permission denied: not memory owner');
      return { resolvedId: memoryId, memory };
    }

    // Try resolving from published copy
    const collectionName = await this.memoryIndex.lookup(memoryId);
    if (collectionName && collectionName !== this.userCollection.name) {
      const publishedCollection = this.weaviateClient.collections.get(collectionName);
      const published = await fetchMemoryWithAllProperties(publishedCollection, memoryId);
      if (published) {
        let originalId: string | undefined;

        // Prefer original_memory_id if set
        if (published.properties.original_memory_id) {
          originalId = published.properties.original_memory_id as string;
        }
        // Fall back to parsing composite_id (userId.memoryId)
        else if (published.properties.composite_id) {
          try {
            const parsed = parseCompositeId(published.properties.composite_id as string);
            originalId = parsed.memoryId;
          } catch {
            // Invalid composite_id format — skip
          }
        }

        if (originalId) {
          memory = await fetchMemoryWithAllProperties(this.userCollection, originalId);
          if (memory) {
            if (memory.properties.user_id !== this.userId) throw new ForbiddenError('Permission denied: not memory owner');
            return { resolvedId: originalId, memory };
          }
        }
      }
    }

    throw new NotFoundError('Memory', memoryId);
  }

  // ── Publish (phase 1: generate confirmation token) ──────────────────

  async publish(input: PublishInput): Promise<PublishResult> {
    const spaces = input.spaces || [];
    const groups = input.groups || [];

    if (spaces.length === 0 && groups.length === 0) {
      throw new ValidationError('Must specify at least one space or group to publish to');
    }

    // Validate space IDs
    if (spaces.length > 0) {
      const invalidSpaces = spaces.filter((s) => !isValidSpaceId(s));
      if (invalidSpaces.length > 0) {
        throw new ValidationError(`Invalid space IDs: ${invalidSpaces.join(', ')}`, { spaces: invalidSpaces });
      }
    }

    // Validate group IDs (no dots, not empty)
    if (groups.length > 0) {
      const invalidGroups = groups.filter((g) => !g || g.includes('.') || g.trim() === '');
      if (invalidGroups.length > 0) {
        throw new ValidationError('Group IDs cannot be empty or contain dots');
      }
    }

    // Verify memory exists, belongs to user, is a memory.
    // If the ID is a composite UUID (published copy), resolve to the original memory.
    const { resolvedId: resolvedMemoryId, memory } = await this.resolveToOriginalMemory(input.memory_id);
    if (memory.properties.doc_type !== 'memory') throw new ValidationError('Only memories can be published');

    // Validate content_type restrictions for restricted spaces
    const memoryContentType = memory.properties.content_type as string | undefined;
    for (const spaceId of spaces) {
      const requiredType = SPACE_CONTENT_TYPE_RESTRICTIONS[spaceId as SpaceId];
      if (requiredType && memoryContentType !== requiredType) {
        throw new ValidationError(
          `Space '${spaceId}' only accepts content_type '${requiredType}', got '${memoryContentType ?? 'undefined'}'`,
        );
      }
    }

    // Content moderation check (blocks hateful/extremist content)
    await this.checkModeration(memory.properties.content as string);

    // Generate confirmation token
    const { token } = await this.confirmationTokenService.createRequest(
      this.userId,
      'publish_memory',
      {
        memory_id: resolvedMemoryId,
        spaces,
        groups,
        additional_tags: input.additional_tags || [],
      },
    );

    this.logger.info('Publish confirmation created', {
      userId: this.userId,
      memoryId: resolvedMemoryId,
      spaces,
      groups,
    });

    return { token };
  }

  // ── Retract (phase 1: generate confirmation token) ──────────────────

  async retract(input: RetractInput): Promise<RetractResult> {
    const spaces = input.spaces || [];
    const groups = input.groups || [];

    if (spaces.length === 0 && groups.length === 0) {
      throw new ValidationError('Must specify at least one space or group to retract from');
    }

    // Validate group IDs
    if (groups.length > 0) {
      const invalidGroups = groups.filter((g) => g.includes('.'));
      if (invalidGroups.length > 0) {
        throw new ValidationError(`Group IDs cannot contain dots: ${invalidGroups.join(', ')}`);
      }
    }

    // Verify memory exists and belongs to user.
    // If the ID is a composite UUID (published copy), resolve to the original memory.
    const { resolvedId: resolvedMemoryId, memory } = await this.resolveToOriginalMemory(input.memory_id);

    // Check current publication status
    const currentSpaceIds: string[] = Array.isArray(memory.properties.space_ids)
      ? memory.properties.space_ids
      : [];
    const currentGroupIds: string[] = Array.isArray(memory.properties.group_ids)
      ? memory.properties.group_ids
      : [];

    const notPublishedSpaces = spaces.filter((s) => !currentSpaceIds.includes(s));
    const notPublishedGroups = groups.filter((g) => !currentGroupIds.includes(g));

    if (notPublishedSpaces.length > 0 || notPublishedGroups.length > 0) {
      throw new ValidationError(
        `Memory is not published to some destinations. ` +
          `Not in spaces: [${notPublishedSpaces.join(', ')}], ` +
          `Not in groups: [${notPublishedGroups.join(', ')}]`,
      );
    }

    // Generate confirmation token
    const { token } = await this.confirmationTokenService.createRequest(
      this.userId,
      'retract_memory',
      {
        memory_id: resolvedMemoryId,
        spaces,
        groups,
        current_space_ids: currentSpaceIds,
        current_group_ids: currentGroupIds,
      },
    );

    this.logger.info('Retract confirmation created', {
      userId: this.userId,
      memoryId: resolvedMemoryId,
      spaces,
      groups,
    });

    return { token };
  }

  // ── Revise (phase 1: generate confirmation token) ───────────────────

  async revise(input: ReviseInput): Promise<ReviseResult> {
    const memory = await fetchMemoryWithAllProperties(this.userCollection, input.memory_id);
    if (!memory) throw new NotFoundError('Memory', input.memory_id);
    if (memory.properties.user_id !== this.userId) throw new ForbiddenError('Permission denied: not memory owner');

    const spaceIds: string[] = Array.isArray(memory.properties.space_ids)
      ? memory.properties.space_ids
      : [];
    const groupIds: string[] = Array.isArray(memory.properties.group_ids)
      ? memory.properties.group_ids
      : [];

    if (spaceIds.length === 0 && groupIds.length === 0) {
      throw new ValidationError('Memory has no published copies to revise. Publish first with publish().');
    }

    // Content moderation check (blocks hateful/extremist content)
    await this.checkModeration(memory.properties.content as string);

    const { token } = await this.confirmationTokenService.createRequest(
      this.userId,
      'revise_memory',
      {
        memory_id: input.memory_id,
        space_ids: spaceIds,
        group_ids: groupIds,
      },
    );

    this.logger.info('Revise confirmation created', {
      userId: this.userId,
      memoryId: input.memory_id,
      spaceIds,
      groupIds,
    });

    return { token };
  }

  // ── Confirm (phase 2: execute pending action) ───────────────────────

  async confirm(input: ConfirmInput): Promise<ConfirmResult> {
    const request = await this.confirmationTokenService.confirmRequest(this.userId, input.token);
    if (!request) {
      throw new ValidationError('Invalid or expired confirmation token');
    }

    if (request.action === 'publish_memory') {
      return this.executePublish(request);
    }
    if (request.action === 'retract_memory') {
      return this.executeRetract(request);
    }
    if (request.action === 'revise_memory') {
      return this.executeRevise(request);
    }

    throw new ValidationError(`Unknown action type: ${request.action}`);
  }

  // ── Deny ────────────────────────────────────────────────────────────

  async deny(input: DenyInput): Promise<DenyResult> {
    const success = await this.confirmationTokenService.denyRequest(this.userId, input.token);
    if (!success) {
      throw new NotFoundError('Token', input.token);
    }
    return { success: true };
  }

  // ── Moderate ────────────────────────────────────────────────────────

  async moderate(input: ModerateInput, authContext?: AuthContext): Promise<ModerateResult> {
    if (!input.space_id && !input.group_id) {
      throw new ValidationError('Must specify either space_id or group_id');
    }

    if (!ACTION_TO_STATUS[input.action]) {
      throw new ValidationError(`Invalid action: ${input.action}. Must be approve, reject, or remove`);
    }

    // Permission check
    if (input.group_id) {
      if (!canModerate(authContext, input.group_id)) {
        throw new ForbiddenError(`Moderator access required for group ${input.group_id}`);
      }
    } else if (input.space_id) {
      if (!canModerateAny(authContext)) {
        throw new ForbiddenError('Moderator access required to moderate memories in spaces');
      }
    }

    // Get the collection
    let collection: any;
    if (input.group_id) {
      const collectionName = getCollectionName(CollectionType.GROUPS, input.group_id);
      collection = this.weaviateClient.collections.get(collectionName);
    } else {
      collection = await ensurePublicCollection(this.weaviateClient);
    }

    // Fetch the memory
    const memory = await fetchMemoryWithAllProperties(collection, input.memory_id);
    if (!memory) {
      throw new NotFoundError('Published memory', input.memory_id);
    }

    // Update moderation fields
    const newStatus = ACTION_TO_STATUS[input.action];
    const now = new Date().toISOString();

    await collection.data.update({
      id: input.memory_id,
      properties: {
        moderation_status: newStatus,
        moderated_by: this.userId,
        moderated_at: now,
      },
    });

    const location = input.group_id ? `group:${input.group_id}` : `space:${input.space_id}`;

    this.logger.info('Memory moderated', {
      userId: this.userId,
      memoryId: input.memory_id,
      action: input.action,
      newStatus,
      location,
    });

    return {
      memory_id: input.memory_id,
      action: input.action,
      moderation_status: newStatus,
      moderated_by: this.userId,
      moderated_at: now,
      location,
    };
  }

  // ── Search Space ────────────────────────────────────────────────────

  async search(input: SearchSpaceInput, authContext?: AuthContext): Promise<SearchSpaceResult> {
    const spaces = input.spaces || [];
    const groups = input.groups || [];
    const searchType = input.search_type || 'hybrid';
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;

    // Validate space IDs
    if (spaces.length > 0) {
      const invalidSpaces = spaces.filter((s) => !isValidSpaceId(s));
      if (invalidSpaces.length > 0) {
        throw new ValidationError(`Invalid space IDs: ${invalidSpaces.join(', ')}`, { spaces: invalidSpaces });
      }
    }

    // Validate group IDs
    if (groups.length > 0) {
      const invalidGroups = groups.filter((g) => !g || g.includes('.') || g.trim() === '');
      if (invalidGroups.length > 0) {
        throw new ValidationError('Group IDs cannot be empty or contain dots');
      }
    }

    // Permission check for non-approved moderation filters
    const moderationFilter = input.moderation_filter || 'approved';
    if (moderationFilter !== 'approved') {
      for (const groupId of groups) {
        if (!canModerate(authContext, groupId)) {
          throw new ForbiddenError(`Moderator access required to view ${moderationFilter} memories in group ${groupId}`);
        }
      }
      if ((spaces.length > 0 || groups.length === 0) && !canModerateAny(authContext)) {
        throw new ForbiddenError(`Moderator access required to view ${moderationFilter} memories in spaces`);
      }
    }

    const fetchLimit = (limit + offset) * Math.max(1, groups.length + (spaces.length > 0 || groups.length === 0 ? 1 : 0));
    const allObjects: any[] = [];

    // Search spaces collection (when spaces specified or neither spaces nor groups)
    if (spaces.length > 0 || groups.length === 0) {
      await ensurePublicCollection(this.weaviateClient);
      const spacesCollectionName = getCollectionName(CollectionType.SPACES);
      const spacesCollection = this.weaviateClient.collections.get(spacesCollectionName);
      const filterList = this.buildBaseFilters(spacesCollection, input);

      if (spaces.length > 0) {
        filterList.push(spacesCollection.filter.byProperty('space_ids').containsAny(spaces));
      }

      const combinedFilters = filterList.length > 0 ? Filters.and(...filterList) : undefined;
      const spaceObjects = await this.executeSearch(spacesCollection, input.query, searchType, combinedFilters, fetchLimit);
      allObjects.push(...tagWithSource(spaceObjects, spacesCollectionName));
    }

    // Search group collections
    for (const groupId of groups) {
      const groupCollectionName = getCollectionName(CollectionType.GROUPS, groupId);
      const exists = await this.weaviateClient.collections.exists(groupCollectionName);
      if (!exists) continue;

      const groupCollection = this.weaviateClient.collections.get(groupCollectionName);
      const filterList = this.buildBaseFilters(groupCollection, input);
      const combinedFilters = filterList.length > 0 ? Filters.and(...filterList) : undefined;
      const groupObjects = await this.executeSearch(groupCollection, input.query, searchType, combinedFilters, fetchLimit);
      allObjects.push(...tagWithSource(groupObjects, groupCollectionName));
    }

    // Deduplicate by UUID first
    const seen = new Set<string>();
    const uuidDeduped = allObjects.filter((obj) => {
      if (seen.has(obj.uuid)) return false;
      seen.add(obj.uuid);
      return true;
    });

    // Source-ID deduplication with precedence (space > group > personal)
    const contentDeduped = dedupeBySourceId(uuidDeduped, input.dedupe);

    // Sort by relevance score
    contentDeduped.sort((a, b) => {
      const scoreA = a.metadata?.score ?? 0;
      const scoreB = b.metadata?.score ?? 0;
      return scoreB - scoreA;
    });

    // Paginate
    const paginated = contentDeduped.slice(offset, offset + limit);
    const memories = paginated.map((obj: any) => ({
      id: obj.uuid,
      ...obj.properties,
      ...(obj._also_in?.length ? { also_in: obj._also_in } : {}),
    }));

    const isAllPublic = spaces.length === 0 && groups.length === 0;

    return {
      spaces_searched: isAllPublic ? 'all_public' : spaces,
      groups_searched: groups,
      memories,
      total: memories.length,
      offset,
      limit,
    };
  }

  // ── Query Space ─────────────────────────────────────────────────────

  async query(input: QuerySpaceInput, authContext?: AuthContext): Promise<QuerySpaceResult> {
    if (!input.question?.trim()) throw new ValidationError('Question cannot be empty');

    // Validate space IDs
    if (input.spaces.length === 0) throw new ValidationError('Must specify at least one space to query');
    const invalidSpaces = input.spaces.filter((s) => !isValidSpaceId(s));
    if (invalidSpaces.length > 0) {
      throw new ValidationError(`Invalid space IDs: ${invalidSpaces.join(', ')}`, { spaces: invalidSpaces });
    }

    // Permission check for non-approved moderation filters
    const moderationFilterValue = input.moderation_filter || 'approved';
    if (moderationFilterValue !== 'approved' && !canModerateAny(authContext)) {
      throw new ForbiddenError(`Moderator access required to view ${moderationFilterValue} memories in spaces`);
    }

    const publicCollection = await ensurePublicCollection(this.weaviateClient);
    const filterList: any[] = [];

    // Filter by spaces
    filterList.push(publicCollection.filter.byProperty('spaces').containsAny(input.spaces));

    // Filter by doc_type
    filterList.push(publicCollection.filter.byProperty('doc_type').equal('memory'));

    // Moderation filter
    const moderationFilter = buildModerationFilter(publicCollection, input.moderation_filter);
    if (moderationFilter) filterList.push(moderationFilter);

    // Content type filter
    if (input.content_type) {
      filterList.push(publicCollection.filter.byProperty('content_type').equal(input.content_type));
    }

    // Exclude comments by default
    if (!input.include_comments && !input.content_type) {
      filterList.push(publicCollection.filter.byProperty('content_type').notEqual('comment'));
    }

    // Tags filter (AND semantics)
    if (input.tags?.length) {
      input.tags.forEach((tag) => {
        filterList.push(publicCollection.filter.byProperty('tags').containsAny([tag]));
      });
    }

    // Weight filter
    if (input.min_weight !== undefined) {
      filterList.push(publicCollection.filter.byProperty('weight').greaterOrEqual(input.min_weight));
    }

    // Date filters
    if (input.date_from) {
      filterList.push(publicCollection.filter.byProperty('created_at').greaterOrEqual(new Date(input.date_from)));
    }
    if (input.date_to) {
      filterList.push(publicCollection.filter.byProperty('created_at').lessOrEqual(new Date(input.date_to)));
    }

    const combinedFilters = filterList.length > 0 ? Filters.and(...filterList) : undefined;
    const opts: any = { limit: input.limit ?? 10 };
    if (combinedFilters) opts.filters = combinedFilters;

    const results = await publicCollection.query.nearText(input.question, opts);

    const memories = results.objects.map((obj: any) => ({
      id: obj.uuid,
      ...obj.properties,
      _distance: obj.metadata?.distance,
    }));

    return {
      question: input.question,
      spaces_queried: input.spaces,
      memories,
      total: memories.length,
    };
  }

  // ── Private: Dedupe Check ──────────────────────────────────────────

  /**
   * Check that the given original_memory_id is not already published to the
   * target collection by a different user.  If the same user re-publishes
   * (same weaviateId) this is fine — the caller handles update vs insert.
   */
  private async checkOriginalMemoryNotPublished(
    collection: any,
    originalMemoryId: string,
    expectedWeaviateId: string,
  ): Promise<void> {
    const filter = collection.filter.byProperty('original_memory_id').equal(originalMemoryId);
    const result = await collection.query.fetchObjects({ filters: filter, limit: 1 });

    if (result.objects.length > 0) {
      const existing = result.objects[0];
      // Allow if same weaviateId (same user re-publishing)
      if (existing.uuid === expectedWeaviateId) return;
      throw new ValidationError(
        `This memory is already published by another user`,
      );
    }
  }

  // ── Private: Execute Publish ────────────────────────────────────────

  private async executePublish(
    request: ConfirmationRequest & { request_id: string },
  ): Promise<ConfirmResult> {
    const spaces: string[] = request.payload.spaces || [];
    const groups: string[] = request.payload.groups || [];

    if (spaces.length === 0 && groups.length === 0) {
      throw new ValidationError('No destinations in publish request');
    }

    // Fetch the memory fresh
    const originalMemory = await fetchMemoryWithAllProperties(
      this.userCollection,
      request.payload.memory_id,
    );
    if (!originalMemory) throw new NotFoundError('Memory', request.payload.memory_id);
    if (originalMemory.properties.user_id !== this.userId) throw new ForbiddenError('Permission denied');

    const compositeId = generateCompositeId(this.userId, request.payload.memory_id);
    const weaviateId = compositeIdToUuid(compositeId);

    // Existing tracking arrays
    const existingSpaceIds: string[] = Array.isArray(originalMemory.properties.space_ids)
      ? originalMemory.properties.space_ids
      : [];
    const existingGroupIds: string[] = Array.isArray(originalMemory.properties.group_ids)
      ? originalMemory.properties.group_ids
      : [];

    // Merge tags
    const originalTags = Array.isArray(originalMemory.properties.tags)
      ? originalMemory.properties.tags
      : [];
    const additionalTags = Array.isArray(request.payload.additional_tags)
      ? request.payload.additional_tags
      : [];
    const mergedTags = [...originalTags, ...additionalTags];

    const successfulPublications: string[] = [];
    const failedPublications: string[] = [];

    // Publish to spaces (Memory_spaces_public)
    if (spaces.length > 0) {
      try {
        const publicCollection = await ensurePublicCollection(this.weaviateClient);

        // Dedupe: check if this original_memory_id is already published by another user
        await this.checkOriginalMemoryNotPublished(publicCollection, request.payload.memory_id, weaviateId);

        let existingSpaceMemory = null;
        try {
          existingSpaceMemory = await fetchMemoryWithAllProperties(publicCollection, weaviateId);
        } catch { /* doesn't exist */ }

        const newSpaceIds = [...new Set([...existingSpaceIds, ...spaces])];

        // Determine moderation status
        let spaceModerationStatus = 'approved';
        for (const spaceId of spaces) {
          const spaceConfig = await getSpaceConfig(spaceId, 'space');
          if (spaceConfig.require_moderation) {
            spaceModerationStatus = 'pending';
            break;
          }
        }

        const publishedMemory: Record<string, any> = {
          ...originalMemory.properties,
          composite_id: compositeId,
          space_ids: newSpaceIds,
          group_ids: existingGroupIds,
          spaces,
          author_id: this.userId,
          published_at: new Date().toISOString(),
          discovery_count: 0,
          attribution: 'user',
          moderation_status: spaceModerationStatus,
          tags: mergedTags,
          original_memory_id: request.payload.memory_id,
        };
        delete publishedMemory._additional;

        if (existingSpaceMemory) {
          await publicCollection.data.update({ id: weaviateId, properties: publishedMemory });
        } else {
          await publicCollection.data.insert({ id: weaviateId, properties: publishedMemory });
        }

        // Index published memory UUID → collection name
        try {
          await this.memoryIndex.index(weaviateId, 'Memory_spaces_public');
        } catch (err) {
          this.logger.warn?.(`[SpaceService] Index write failed for ${weaviateId}: ${err}`);
        }

        successfulPublications.push(`spaces: ${spaces.join(', ')}`);
      } catch (err) {
        failedPublications.push(`spaces: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Publish to groups
    for (const groupId of groups) {
      const groupCollectionName = getCollectionName(CollectionType.GROUPS, groupId);
      try {
        await ensureGroupCollection(this.weaviateClient, groupId);
        const groupCollection = this.weaviateClient.collections.get(groupCollectionName);

        // Dedupe: check if this original_memory_id is already published by another user
        await this.checkOriginalMemoryNotPublished(groupCollection, request.payload.memory_id, weaviateId);

        let existingGroupMemory = null;
        try {
          existingGroupMemory = await fetchMemoryWithAllProperties(groupCollection, weaviateId);
        } catch { /* doesn't exist */ }

        const newGroupIds = [...new Set([...existingGroupIds, groupId])];
        const groupConfig = await getSpaceConfig(groupId, 'group');
        const groupModerationStatus = groupConfig.require_moderation ? 'pending' : 'approved';

        const groupMemory: Record<string, any> = {
          ...originalMemory.properties,
          composite_id: compositeId,
          space_ids: existingSpaceIds,
          group_ids: newGroupIds,
          author_id: this.userId,
          published_at: new Date().toISOString(),
          discovery_count: 0,
          attribution: 'user',
          moderation_status: groupModerationStatus,
          tags: mergedTags,
          original_memory_id: request.payload.memory_id,
        };
        delete groupMemory._additional;

        if (existingGroupMemory) {
          await groupCollection.data.update({ id: weaviateId, properties: groupMemory });
        } else {
          await groupCollection.data.insert({ id: weaviateId, properties: groupMemory });
        }

        // Index published memory UUID → group collection name
        try {
          await this.memoryIndex.index(weaviateId, groupCollectionName);
        } catch (err) {
          this.logger.warn?.(`[SpaceService] Index write failed for ${weaviateId} in ${groupCollectionName}: ${err}`);
        }

        successfulPublications.push(`group: ${groupId}`);
      } catch (err) {
        failedPublications.push(`group ${groupId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Update source memory tracking arrays
    const finalSpaceIds = successfulPublications.some((p) => p.startsWith('spaces:'))
      ? [...new Set([...existingSpaceIds, ...spaces])]
      : existingSpaceIds;
    const successfulGroups = groups.filter((g) =>
      successfulPublications.some((p) => p === `group: ${g}`),
    );
    const finalGroupIds = [...new Set([...existingGroupIds, ...successfulGroups])];

    if (finalSpaceIds.length > existingSpaceIds.length || finalGroupIds.length > existingGroupIds.length) {
      try {
        await this.userCollection.data.update({
          id: request.payload.memory_id,
          properties: { space_ids: finalSpaceIds, group_ids: finalGroupIds },
        });
      } catch {
        this.logger.warn('Failed to update source memory tracking arrays');
      }
    }

    if (successfulPublications.length === 0) {
      throw new Error(`Publication failed: ${failedPublications.join('; ')}`);
    }

    this.logger.info('Memory published', {
      compositeId,
      published: successfulPublications,
      failed: failedPublications,
    });

    // Emit webhook events for successful publications
    if (this.eventBus) {
      const title = String(originalMemory.properties.title ?? '');
      const actor = { type: 'user' as const, id: this.userId };
      const isComment = originalMemory.properties.content_type === 'comment';

      if (isComment) {
        const parentId = String(originalMemory.properties.parent_id ?? '');
        const threadRootId = String(originalMemory.properties.thread_root_id ?? parentId);
        const contentPreview = String(originalMemory.properties.content ?? '').slice(0, 200);

        // Resolve the parent memory's author so consumers know who to notify.
        // parentId is the user-scoped memory ID; the published copy uses a composite UUID.
        let parentOwnerId = '';
        try {
          // First, read the parent from the commenter's collection to get its author/origin info
          const parentMemory = await fetchMemoryWithAllProperties(this.userCollection, parentId);
          if (parentMemory) {
            // If the parent has a user_id that differs from the commenter, that's the owner
            const parentUserId = String(parentMemory.properties.user_id ?? '');
            if (parentUserId && parentUserId !== this.userId) {
              parentOwnerId = parentUserId;
            } else if (parentUserId === this.userId) {
              // Commenter owns the parent — no notification needed, but set it for completeness
              parentOwnerId = this.userId;
            }
          }

          // Fallback: look up the published copy in the public collection
          if (!parentOwnerId) {
            const publicCollection = await ensurePublicCollection(this.weaviateClient);

            // Try direct fetch by UUID — parentId may be the published copy's own ID
            const directHit = await fetchMemoryWithAllProperties(publicCollection, parentId);
            if (directHit) {
              parentOwnerId = String(directHit.properties.author_id ?? directHit.properties.user_id ?? '');
            }

            // Fallback: try by original_memory_id filter (parentId might be the original user-scoped ID)
            if (!parentOwnerId) {
              const filter = publicCollection.filter.byProperty('original_memory_id').equal(parentId);
              const result = await publicCollection.query.fetchObjects({ filters: filter, limit: 1 });
              if (result.objects.length > 0) {
                parentOwnerId = String(result.objects[0].properties.author_id ?? '');
              }
            }
          }

          // Fallback: try group collections
          if (!parentOwnerId) {
            for (const groupId of groups) {
              try {
                const groupCollectionName = getCollectionName(CollectionType.GROUPS, groupId);
                const groupCollection = this.weaviateClient.collections.get(groupCollectionName);

                // Try direct fetch by UUID first
                const gDirect = await fetchMemoryWithAllProperties(groupCollection, parentId);
                if (gDirect) {
                  parentOwnerId = String(gDirect.properties.author_id ?? gDirect.properties.user_id ?? '');
                  break;
                }

                // Fallback: try by original_memory_id filter
                const gFilter = groupCollection.filter.byProperty('original_memory_id').equal(parentId);
                const gResult = await groupCollection.query.fetchObjects({ filters: gFilter, limit: 1 });
                if (gResult.objects.length > 0) {
                  parentOwnerId = String(gResult.objects[0].properties.author_id ?? '');
                  break;
                }
              } catch { /* group collection may not exist */ }
            }
          }
        } catch (err) {
          this.logger.warn('Failed to resolve parent owner for comment event', { parentId, err });
        }

        if (!parentOwnerId) {
          this.logger.warn('Skipping comment webhook — could not resolve parent_owner_id', { parentId, memoryId: request.payload.memory_id });
        } else {
          if (successfulPublications.some((p) => p.startsWith('spaces:'))) {
            for (const spaceId of spaces) {
              this.eventBus.emit(
                { type: 'comment.published_to_space', memory_id: request.payload.memory_id, parent_id: parentId, thread_root_id: threadRootId, content_preview: contentPreview, space_id: spaceId, owner_id: this.userId, parent_owner_id: parentOwnerId },
                actor,
              );
            }
          }

          const publishedGroups = groups.filter((g) => successfulPublications.some((p) => p === `group: ${g}`));
          for (const groupId of publishedGroups) {
            this.eventBus.emit(
              { type: 'comment.published_to_group', memory_id: request.payload.memory_id, parent_id: parentId, thread_root_id: threadRootId, content_preview: contentPreview, group_id: groupId, owner_id: this.userId, parent_owner_id: parentOwnerId },
              actor,
            );
          }
        }
      } else {
        if (successfulPublications.some((p) => p.startsWith('spaces:'))) {
          for (const spaceId of spaces) {
            this.eventBus.emit(
              { type: 'memory.published_to_space', memory_id: request.payload.memory_id, title, space_id: spaceId, owner_id: this.userId },
              actor,
            );
          }
        }

        const publishedGroups = groups.filter((g) => successfulPublications.some((p) => p === `group: ${g}`));
        for (const groupId of publishedGroups) {
          this.eventBus.emit(
            { type: 'memory.published_to_group', memory_id: request.payload.memory_id, title, group_id: groupId, owner_id: this.userId },
            actor,
          );
        }
      }
    }

    return {
      action: 'publish_memory',
      success: true,
      composite_id: compositeId,
      published_to: successfulPublications,
      failed: failedPublications.length > 0 ? failedPublications : undefined,
      space_ids: finalSpaceIds,
      group_ids: finalGroupIds,
    };
  }

  // ── Private: Execute Retract ────────────────────────────────────────

  private async executeRetract(
    request: ConfirmationRequest & { request_id: string },
  ): Promise<ConfirmResult> {
    const spaces: string[] = request.payload.spaces || [];
    const groups: string[] = request.payload.groups || [];

    const sourceMemory = await fetchMemoryWithAllProperties(
      this.userCollection,
      request.payload.memory_id,
    );
    if (!sourceMemory) throw new NotFoundError('Memory', request.payload.memory_id);

    const currentSpaceIds: string[] = Array.isArray(sourceMemory.properties.space_ids)
      ? sourceMemory.properties.space_ids
      : [];
    const currentGroupIds: string[] = Array.isArray(sourceMemory.properties.group_ids)
      ? sourceMemory.properties.group_ids
      : [];

    const compositeId = generateCompositeId(this.userId, request.payload.memory_id);
    const weaviateId = compositeIdToUuid(compositeId);
    const successfulRetractions: string[] = [];
    const failedRetractions: string[] = [];

    // Retract from spaces (orphan: remove from space_ids but keep the document)
    if (spaces.length > 0) {
      try {
        const spacesCollectionName = getCollectionName(CollectionType.SPACES);
        const publicCollection = this.weaviateClient.collections.get(spacesCollectionName);
        const publishedMemory = await fetchMemoryWithAllProperties(publicCollection, weaviateId);

        if (publishedMemory) {
          const newSpaceIds = currentSpaceIds.filter((id) => !spaces.includes(id));
          await publicCollection.data.update({
            id: weaviateId,
            properties: { space_ids: newSpaceIds, retracted_at: new Date().toISOString() },
          });
          successfulRetractions.push(`spaces: ${spaces.join(', ')}`);
        } else {
          failedRetractions.push('spaces: Memory not found in spaces collection');
        }
      } catch (err) {
        failedRetractions.push(`spaces: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Retract from groups (orphan: remove from group_ids but keep the document)
    for (const groupId of groups) {
      const groupCollectionName = getCollectionName(CollectionType.GROUPS, groupId);
      try {
        const groupCollection = this.weaviateClient.collections.get(groupCollectionName);
        const groupMemory = await fetchMemoryWithAllProperties(groupCollection, weaviateId);

        if (groupMemory) {
          const groupMemoryGroupIds: string[] = Array.isArray(groupMemory.properties.group_ids)
            ? groupMemory.properties.group_ids
            : [];
          const newGroupIds = groupMemoryGroupIds.filter((id) => id !== groupId);
          await groupCollection.data.update({
            id: weaviateId,
            properties: { group_ids: newGroupIds, retracted_at: new Date().toISOString() },
          });
          successfulRetractions.push(`group: ${groupId}`);
        } else {
          failedRetractions.push(`group ${groupId}: Memory not found in group`);
        }
      } catch (err) {
        failedRetractions.push(`group ${groupId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Update source memory tracking arrays
    const finalSpaceIds = successfulRetractions.some((r) => r.startsWith('spaces:'))
      ? currentSpaceIds.filter((id) => !spaces.includes(id))
      : currentSpaceIds;
    const successfulGroupRetractions = groups.filter((g) =>
      successfulRetractions.some((r) => r === `group: ${g}`),
    );
    const finalGroupIds = currentGroupIds.filter((id) => !successfulGroupRetractions.includes(id));

    try {
      await this.userCollection.data.update({
        id: request.payload.memory_id,
        properties: { space_ids: finalSpaceIds, group_ids: finalGroupIds },
      });
    } catch {
      this.logger.warn('Failed to update source memory tracking arrays after retraction');
    }

    if (successfulRetractions.length === 0) {
      throw new Error(`Retraction failed: ${failedRetractions.join('; ')}`);
    }

    this.logger.info('Memory retracted', {
      compositeId,
      retracted: successfulRetractions,
      failed: failedRetractions,
    });

    // Emit webhook event for successful retractions
    if (this.eventBus && successfulRetractions.length > 0) {
      const targets: Array<{ kind: 'space' | 'group'; id: string }> = [];
      if (successfulRetractions.some((r) => r.startsWith('spaces:'))) {
        for (const spaceId of spaces) {
          targets.push({ kind: 'space', id: spaceId });
        }
      }
      const retractedGroups = groups.filter((g) => successfulRetractions.some((r) => r === `group: ${g}`));
      for (const groupId of retractedGroups) {
        targets.push({ kind: 'group', id: groupId });
      }
      if (targets.length > 0) {
        this.eventBus.emit(
          { type: 'memory.retracted', memory_id: request.payload.memory_id, owner_id: this.userId, targets },
          { type: 'user', id: this.userId },
        );
      }
    }

    return {
      action: 'retract_memory',
      success: true,
      composite_id: compositeId,
      retracted_from: successfulRetractions,
      failed: failedRetractions.length > 0 ? failedRetractions : undefined,
      space_ids: finalSpaceIds,
      group_ids: finalGroupIds,
    };
  }

  // ── Private: Execute Revise ─────────────────────────────────────────

  private async executeRevise(
    request: ConfirmationRequest & { request_id: string },
  ): Promise<ConfirmResult> {
    const { memory_id, space_ids = [], group_ids = [] } = request.payload;

    const sourceMemory = await fetchMemoryWithAllProperties(this.userCollection, memory_id);
    if (!sourceMemory) throw new NotFoundError('Memory', memory_id);
    if (sourceMemory.properties.user_id !== this.userId) throw new ForbiddenError('Permission denied');

    const newContent = String(sourceMemory.properties.content ?? '');
    const revisedAt = new Date().toISOString();
    const compositeId = generateCompositeId(this.userId, memory_id);
    const weaviateId = compositeIdToUuid(compositeId);
    const results: RevisionResult[] = [];

    const reviseInCollection = async (collectionName: string, locationLabel: string) => {
      try {
        const collection = this.weaviateClient.collections.get(collectionName);
        const publishedMemory = await fetchMemoryWithAllProperties(collection, weaviateId);

        if (!publishedMemory) {
          results.push({ location: locationLabel, status: 'skipped', error: 'Published copy not found' });
          return;
        }

        const oldContent = String(publishedMemory.properties.content ?? '');
        let revisionHistory = parseRevisionHistory(publishedMemory.properties.revision_history);
        if (oldContent !== newContent) {
          revisionHistory = buildRevisionHistory(revisionHistory, oldContent, revisedAt);
        }

        const currentRevisionCount =
          typeof publishedMemory.properties.revision_count === 'number'
            ? publishedMemory.properties.revision_count
            : 0;

        await collection.data.update({
          id: weaviateId,
          properties: {
            content: newContent,
            revised_at: revisedAt,
            revision_count: currentRevisionCount + 1,
            revision_history: JSON.stringify(revisionHistory),
          },
        });

        results.push({ location: locationLabel, status: 'success' });
      } catch (err) {
        results.push({
          location: locationLabel,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    // Revise in spaces collection
    if (space_ids.length > 0) {
      await reviseInCollection(getCollectionName(CollectionType.SPACES), 'Memory_spaces_public');
    }

    // Revise in each group collection
    for (const groupId of group_ids) {
      await reviseInCollection(
        getCollectionName(CollectionType.GROUPS, groupId),
        `Memory_groups_${groupId}`,
      );
    }

    const successCount = results.filter((r) => r.status === 'success').length;

    this.logger.info('Memory revised', {
      compositeId,
      success: successCount,
      total: results.length,
    });

    return {
      action: 'revise_memory',
      success: successCount > 0,
      composite_id: compositeId,
      revised_at: revisedAt,
      results,
    };
  }

  // ── By Discovery (interleaved rated + unrated for spaces/groups) ────

  async byDiscovery(input: DiscoverySpaceInput, authContext?: AuthContext): Promise<DiscoverySpaceResult> {
    const spaces = input.spaces || [];
    const groups = input.groups || [];
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;

    // Validate space IDs
    if (spaces.length > 0) {
      const invalidSpaces = spaces.filter((s) => !isValidSpaceId(s));
      if (invalidSpaces.length > 0) {
        throw new ValidationError(`Invalid space IDs: ${invalidSpaces.join(', ')}`, { spaces: invalidSpaces });
      }
    }

    // Validate group IDs
    if (groups.length > 0) {
      const invalidGroups = groups.filter((g) => !g || g.includes('.') || g.trim() === '');
      if (invalidGroups.length > 0) {
        throw new ValidationError('Group IDs cannot be empty or contain dots');
      }
    }

    // Permission check for non-approved moderation filters
    const moderationFilter = input.moderation_filter || 'approved';
    if (moderationFilter !== 'approved') {
      for (const groupId of groups) {
        if (!canModerate(authContext, groupId)) {
          throw new ForbiddenError(`Moderator access required to view ${moderationFilter} memories in group ${groupId}`);
        }
      }
      if ((spaces.length > 0 || groups.length === 0) && !canModerateAny(authContext)) {
        throw new ForbiddenError(`Moderator access required to view ${moderationFilter} memories in spaces`);
      }
    }

    // Generous fetch for both pools
    const fetchLimit = (limit + offset) * 2;
    const hasQuery = input.query?.trim();

    const fetchPool = async (collection: any, baseFilters: any[], ratingFilter: any, sortProp: string) => {
      const allFilters = [...baseFilters, ratingFilter];
      const combined = allFilters.length > 0 ? Filters.and(...allFilters) : undefined;
      const queryOptions: any = { limit: fetchLimit };
      if (combined) queryOptions.filters = combined;
      if (hasQuery) {
        queryOptions.alpha = 0.7;
        return (await collection.query.hybrid(input.query!, queryOptions)).objects;
      }
      queryOptions.sort = collection.sort.byProperty(sortProp, false);
      return (await collection.query.fetchObjects(queryOptions)).objects;
    };

    // Build filters using the same SearchSpaceInput shape (cast for buildBaseFilters)
    const searchInput: SearchSpaceInput = {
      query: '', // not used for filter building
      spaces: input.spaces,
      groups: input.groups,
      content_type: input.content_type,
      tags: input.tags,
      min_weight: input.min_weight,
      max_weight: input.max_weight,
      date_from: input.date_from,
      date_to: input.date_to,
      moderation_filter: input.moderation_filter,
      include_comments: input.include_comments,
    };

    const allRated: any[] = [];
    const allDiscovery: any[] = [];

    // Search spaces collection
    if (spaces.length > 0 || groups.length === 0) {
      await ensurePublicCollection(this.weaviateClient);
      const spacesCollectionName = getCollectionName(CollectionType.SPACES);
      const spacesCollection = this.weaviateClient.collections.get(spacesCollectionName);
      const baseFilters = this.buildBaseFilters(spacesCollection, searchInput);

      if (spaces.length > 0) {
        baseFilters.push(spacesCollection.filter.byProperty('space_ids').containsAny(spaces));
      }

      const ratedFilter = spacesCollection.filter.byProperty('rating_count').greaterOrEqual(DISCOVERY_THRESHOLD);
      const discoveryFilter = spacesCollection.filter.byProperty('rating_count').lessThan(DISCOVERY_THRESHOLD);

      const [rated, discovery] = await Promise.all([
        fetchPool(spacesCollection, baseFilters, ratedFilter, 'rating_bayesian'),
        fetchPool(spacesCollection, baseFilters, discoveryFilter, 'created_at'),
      ]);

      allRated.push(...tagWithSource(rated, spacesCollectionName));
      allDiscovery.push(...tagWithSource(discovery, spacesCollectionName));
    }

    // Search group collections
    for (const groupId of groups) {
      const groupCollectionName = getCollectionName(CollectionType.GROUPS, groupId);
      const exists = await this.weaviateClient.collections.exists(groupCollectionName);
      if (!exists) continue;

      const groupCollection = this.weaviateClient.collections.get(groupCollectionName);
      const baseFilters = this.buildBaseFilters(groupCollection, searchInput);

      const ratedFilter = groupCollection.filter.byProperty('rating_count').greaterOrEqual(DISCOVERY_THRESHOLD);
      const discoveryFilter = groupCollection.filter.byProperty('rating_count').lessThan(DISCOVERY_THRESHOLD);

      const [rated, discovery] = await Promise.all([
        fetchPool(groupCollection, baseFilters, ratedFilter, 'rating_bayesian'),
        fetchPool(groupCollection, baseFilters, discoveryFilter, 'created_at'),
      ]);

      allRated.push(...tagWithSource(rated, groupCollectionName));
      allDiscovery.push(...tagWithSource(discovery, groupCollectionName));
    }

    // Deduplicate each pool by UUID
    const dedupePool = (pool: any[]) => {
      const seen = new Set<string>();
      return pool.filter((obj) => {
        if (seen.has(obj.uuid)) return false;
        seen.add(obj.uuid);
        return true;
      });
    };

    const ratedDeduped = dedupeBySourceId(dedupePool(allRated), input.dedupe);
    const discoveryDeduped = dedupeBySourceId(dedupePool(allDiscovery), input.dedupe);

    const toDoc = (obj: any) => ({
      id: obj.uuid,
      ...obj.properties,
      ...(obj._also_in?.length ? { also_in: obj._also_in } : {}),
    });

    const ratedDocs = ratedDeduped.map(toDoc);
    const discoveryDocs = discoveryDeduped.map(toDoc);

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

    const isAllPublic = spaces.length === 0 && groups.length === 0;

    return {
      spaces_searched: isAllPublic ? 'all_public' : spaces,
      groups_searched: groups,
      memories,
      total: memories.length,
      offset,
      limit,
    };
  }

  // ── By Recommendation (personalized via preference centroid for spaces/groups) ────

  async byRecommendation(input: RecommendationSpaceInput, authContext?: AuthContext): Promise<RecommendationSpaceResult> {
    if (!this.recommendationService) {
      throw new Error('RecommendationService is required for byRecommendation sort mode');
    }

    const spaces = input.spaces || [];
    const groups = input.groups || [];
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    // Validate space IDs
    if (spaces.length > 0) {
      const invalidSpaces = spaces.filter((s) => !isValidSpaceId(s));
      if (invalidSpaces.length > 0) {
        throw new ValidationError(`Invalid space IDs: ${invalidSpaces.join(', ')}`, { spaces: invalidSpaces });
      }
    }

    // Validate group IDs
    if (groups.length > 0) {
      const invalidGroups = groups.filter((g) => !g || g.includes('.') || g.trim() === '');
      if (invalidGroups.length > 0) {
        throw new ValidationError('Group IDs cannot be empty or contain dots');
      }
    }

    // Permission check for non-approved moderation filters
    const moderationFilter = input.moderation_filter || 'approved';
    if (moderationFilter !== 'approved') {
      for (const groupId of groups) {
        if (!canModerate(authContext, groupId)) {
          throw new ForbiddenError(`Moderator access required to view ${moderationFilter} memories in group ${groupId}`);
        }
      }
      if ((spaces.length > 0 || groups.length === 0) && !canModerateAny(authContext)) {
        throw new ForbiddenError(`Moderator access required to view ${moderationFilter} memories in spaces`);
      }
    }

    // 1. Get or compute centroid
    const centroidResult = await this.recommendationService.getOrComputeCentroid(input.userId);

    // 2. Fallback to byDiscovery if insufficient data
    if (centroidResult.insufficientData || !centroidResult.centroid) {
      const discoveryResults = await this.byDiscovery({
        query: input.query,
        spaces: input.spaces,
        groups: input.groups,
        content_type: input.content_type,
        tags: input.tags,
        min_weight: input.min_weight,
        max_weight: input.max_weight,
        date_from: input.date_from,
        date_to: input.date_to,
        moderation_filter: input.moderation_filter,
        include_comments: input.include_comments,
        limit,
        offset,
        dedupe: input.dedupe,
      });

      return {
        spaces_searched: discoveryResults.spaces_searched,
        groups_searched: discoveryResults.groups_searched,
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

    // 3. Build exclusion list: already-rated memory IDs
    const ratedIds = await this.recommendationService.getAllUserRatedIds(input.userId);
    const ratedIdSet = new Set(ratedIds);

    // 4. Search each collection with nearVector
    const searchInput: SearchSpaceInput = {
      query: '',
      spaces: input.spaces,
      groups: input.groups,
      content_type: input.content_type,
      tags: input.tags,
      min_weight: input.min_weight,
      max_weight: input.max_weight,
      date_from: input.date_from,
      date_to: input.date_to,
      moderation_filter: input.moderation_filter,
      include_comments: input.include_comments,
    };

    const fetchLimit = (limit + offset) + ratedIds.length;
    const allResults: any[] = [];

    const searchCollection = async (collection: any, baseFilters: any[]) => {
      const combined = baseFilters.length > 0 ? Filters.and(...baseFilters) : undefined;
      const opts: any = {
        limit: fetchLimit,
        returnMetadata: ['distance'],
      };
      if (combined) opts.filters = combined;

      const result = await collection.query.nearVector(centroidResult.centroid!.vector, opts);
      return result.objects;
    };

    // Search spaces collection
    if (spaces.length > 0 || groups.length === 0) {
      await ensurePublicCollection(this.weaviateClient);
      const spacesCollectionName = getCollectionName(CollectionType.SPACES);
      const spacesCollection = this.weaviateClient.collections.get(spacesCollectionName);
      const baseFilters = this.buildBaseFilters(spacesCollection, searchInput);

      if (spaces.length > 0) {
        baseFilters.push(spacesCollection.filter.byProperty('space_ids').containsAny(spaces));
      }

      allResults.push(...tagWithSource(await searchCollection(spacesCollection, baseFilters), spacesCollectionName));
    }

    // Search group collections
    for (const groupId of groups) {
      const groupCollectionName = getCollectionName(CollectionType.GROUPS, groupId);
      const exists = await this.weaviateClient.collections.exists(groupCollectionName);
      if (!exists) continue;

      const groupCollection = this.weaviateClient.collections.get(groupCollectionName);
      const baseFilters = this.buildBaseFilters(groupCollection, searchInput);

      allResults.push(...tagWithSource(await searchCollection(groupCollection, baseFilters), groupCollectionName));
    }

    // 5. Deduplicate by source ID (cross-collection dedup), exclude rated, apply similarity threshold
    const deduped = dedupeBySourceId(allResults, input.dedupe);
    const MIN_SIMILARITY_THRESHOLD = MIN_SIMILARITY * 100;
    const memories: RecommendedSpaceMemory[] = [];

    // Sort by distance (ascending = most similar first)
    deduped.sort((a: any, b: any) => (a.metadata?.distance ?? 1) - (b.metadata?.distance ?? 1));

    for (const obj of deduped) {
      if (ratedIdSet.has(obj.uuid)) continue;

      const distance = obj.metadata?.distance ?? 1;
      const similarityPct = Math.round((1 - distance) * 100);
      if (similarityPct < MIN_SIMILARITY_THRESHOLD) continue;

      memories.push({
        id: obj.uuid,
        ...obj.properties,
        ...(obj._also_in?.length ? { also_in: obj._also_in } : {}),
        similarity_pct: similarityPct,
      });
    }

    // 6. Apply pagination
    const paginated = memories.slice(offset, offset + limit);
    const isAllPublic = spaces.length === 0 && groups.length === 0;

    return {
      spaces_searched: isAllPublic ? 'all_public' : spaces,
      groups_searched: groups,
      memories: paginated,
      profileSize: centroidResult.centroid!.profileSize,
      insufficientData: false,
      total: paginated.length,
      offset,
      limit,
    };
  }

  // ── By Time (chronological sort for spaces/groups) ──────────────────

  async byTime(input: TimeSpaceInput, authContext?: AuthContext): Promise<TimeSpaceResult> {
    const spaces = input.spaces || [];
    const groups = input.groups || [];
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const direction = input.direction ?? 'desc';

    this.validateSpaceGroupInput(spaces, groups, input.moderation_filter || 'approved', authContext);

    const fetchLimit = (limit + offset) * 2;
    const { allResults, spacesSearched, groupsSearched } = await this.fetchAcrossCollections(
      input, spaces, groups,
      async (collection, baseFilters) => {
        const combined = baseFilters.length > 0 ? Filters.and(...baseFilters) : undefined;
        const opts: any = {
          limit: fetchLimit,
          sort: collection.sort.byProperty('created_at', direction === 'asc'),
        };
        if (combined) opts.filters = combined;
        return (await collection.query.fetchObjects(opts)).objects;
      },
    );

    const deduped = dedupeBySourceId(allResults, input.dedupe);
    deduped.sort((a: any, b: any) => {
      const aTime = new Date(a.properties?.created_at || 0).getTime();
      const bTime = new Date(b.properties?.created_at || 0).getTime();
      return direction === 'desc' ? bTime - aTime : aTime - bTime;
    });

    const paginated = deduped.slice(offset, offset + limit);
    const memories = paginated
      .filter((obj: any) => obj.properties?.doc_type === 'memory')
      .map((obj: any) => ({ id: obj.uuid, ...obj.properties }));

    return { spaces_searched: spacesSearched, groups_searched: groupsSearched, memories, total: memories.length, offset, limit };
  }

  // ── By Rating (Bayesian average for spaces/groups) ─────────────────

  async byRating(input: RatingSpaceInput, authContext?: AuthContext): Promise<RatingSpaceResult> {
    const spaces = input.spaces || [];
    const groups = input.groups || [];
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const direction = input.direction ?? 'desc';

    this.validateSpaceGroupInput(spaces, groups, input.moderation_filter || 'approved', authContext);

    const fetchLimit = (limit + offset) * 2;
    const { allResults, spacesSearched, groupsSearched } = await this.fetchAcrossCollections(
      input, spaces, groups,
      async (collection, baseFilters) => {
        const combined = baseFilters.length > 0 ? Filters.and(...baseFilters) : undefined;
        const opts: any = {
          limit: fetchLimit,
          sort: collection.sort.byProperty('rating_bayesian', direction === 'asc'),
        };
        if (combined) opts.filters = combined;
        return (await collection.query.fetchObjects(opts)).objects;
      },
    );

    const deduped = dedupeBySourceId(allResults, input.dedupe);
    deduped.sort((a: any, b: any) => {
      const aVal = (a.properties?.rating_bayesian as number) ?? 0;
      const bVal = (b.properties?.rating_bayesian as number) ?? 0;
      return direction === 'desc' ? bVal - aVal : aVal - bVal;
    });

    const paginated = deduped.slice(offset, offset + limit);
    const memories = paginated
      .filter((obj: any) => obj.properties?.doc_type === 'memory')
      .map((obj: any) => ({ id: obj.uuid, ...obj.properties }));

    return { spaces_searched: spacesSearched, groups_searched: groupsSearched, memories, total: memories.length, offset, limit };
  }

  // ── By Property (generic sort by any Weaviate property for spaces/groups) ──

  async byProperty(input: PropertySpaceInput, authContext?: AuthContext): Promise<PropertySpaceResult> {
    const spaces = input.spaces || [];
    const groups = input.groups || [];
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const { sort_field, sort_direction } = input;

    // Validate sort_field
    const validFields = new Set<string>(ALL_MEMORY_PROPERTIES);
    if (!validFields.has(sort_field)) {
      throw new ValidationError(`Invalid sort_field "${sort_field}". Must be a valid memory property.`);
    }

    this.validateSpaceGroupInput(spaces, groups, input.moderation_filter || 'approved', authContext);

    const fetchLimit = (limit + offset) * 2;
    const { allResults, spacesSearched, groupsSearched } = await this.fetchAcrossCollections(
      input, spaces, groups,
      async (collection, baseFilters) => {
        const combined = baseFilters.length > 0 ? Filters.and(...baseFilters) : undefined;
        const opts: any = {
          limit: fetchLimit,
          sort: collection.sort.byProperty(sort_field, sort_direction === 'asc'),
        };
        if (combined) opts.filters = combined;
        return (await collection.query.fetchObjects(opts)).objects;
      },
    );

    const deduped = dedupeBySourceId(allResults, input.dedupe);
    // Re-sort merged results by the sort_field
    deduped.sort((a: any, b: any) => {
      const aVal = a.properties?.[sort_field] ?? 0;
      const bVal = b.properties?.[sort_field] ?? 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sort_direction === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      return sort_direction === 'desc' ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
    });

    const paginated = deduped.slice(offset, offset + limit);
    const memories = paginated
      .filter((obj: any) => obj.properties?.doc_type === 'memory')
      .map((obj: any) => ({ id: obj.uuid, ...obj.properties }));

    return {
      spaces_searched: spacesSearched, groups_searched: groupsSearched,
      memories, total: memories.length, offset, limit,
      sort_field, sort_direction,
    };
  }

  // ── By Broad (truncated content for scan-and-drill-in for spaces/groups) ──

  async byBroad(input: BroadSpaceInput, authContext?: AuthContext): Promise<BroadSpaceResult> {
    const spaces = input.spaces || [];
    const groups = input.groups || [];
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const sortOrder = input.sort_order ?? 'desc';

    this.validateSpaceGroupInput(spaces, groups, input.moderation_filter || 'approved', authContext);

    const fetchLimit = (limit + offset) * 2;
    const { allResults, spacesSearched, groupsSearched } = await this.fetchAcrossCollections(
      input, spaces, groups,
      async (collection, baseFilters) => {
        const combined = baseFilters.length > 0 ? Filters.and(...baseFilters) : undefined;
        const opts: any = {
          limit: fetchLimit,
          sort: collection.sort.byProperty('created_at', sortOrder === 'asc'),
        };
        if (combined) opts.filters = combined;
        return (await collection.query.fetchObjects(opts)).objects;
      },
    );

    const deduped = dedupeBySourceId(allResults, input.dedupe);
    deduped.sort((a: any, b: any) => {
      const aTime = new Date(a.properties?.created_at || 0).getTime();
      const bTime = new Date(b.properties?.created_at || 0).getTime();
      return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
    });

    const paginated = deduped.slice(offset, offset + limit);
    const broadResults: BroadSearchResult[] = [];
    for (const obj of paginated) {
      if (obj.properties?.doc_type !== 'memory') continue;

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

    return { spaces_searched: spacesSearched, groups_searched: groupsSearched, results: broadResults, total: broadResults.length, offset, limit };
  }

  // ── By Random (random sampling for spaces/groups) ─────────────────

  async byRandom(input: RandomSpaceInput, authContext?: AuthContext): Promise<RandomSpaceResult> {
    const spaces = input.spaces || [];
    const groups = input.groups || [];
    const limit = input.limit ?? 10;
    const POOL_FETCH_LIMIT = 1000;

    this.validateSpaceGroupInput(spaces, groups, input.moderation_filter || 'approved', authContext);

    const { allResults, spacesSearched, groupsSearched } = await this.fetchAcrossCollections(
      input, spaces, groups,
      async (collection, baseFilters) => {
        const combined = baseFilters.length > 0 ? Filters.and(...baseFilters) : undefined;
        const opts: any = { limit: POOL_FETCH_LIMIT };
        if (combined) opts.filters = combined;
        return (await collection.query.fetchObjects(opts)).objects;
      },
    );

    const deduped = dedupeBySourceId(allResults, input.dedupe);
    const pool = deduped.filter((obj: any) => obj.properties?.doc_type === 'memory');
    const totalPoolSize = pool.length;

    if (totalPoolSize === 0) {
      return { spaces_searched: spacesSearched, groups_searched: groupsSearched, results: [], total_pool_size: 0 };
    }

    // Fisher-Yates partial shuffle
    const sampleSize = Math.min(limit, totalPoolSize);
    const indices = Array.from({ length: totalPoolSize }, (_, i) => i);
    for (let i = totalPoolSize - 1; i > totalPoolSize - 1 - sampleSize && i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const selectedIndices = indices.slice(totalPoolSize - sampleSize);
    const results = selectedIndices.map((idx) => {
      const obj = pool[idx];
      return { id: obj.uuid, ...obj.properties } as Record<string, unknown>;
    });

    return { spaces_searched: spacesSearched, groups_searched: groupsSearched, results, total_pool_size: totalPoolSize };
  }

  // ── By Curated (composite quality score) ──────────────────────────

  async byCurated(input: CuratedSpaceInput, authContext?: AuthContext): Promise<CuratedSpaceResult> {
    const spaces = input.spaces || [];
    const groups = input.groups || [];
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const direction = input.direction ?? 'desc';

    this.validateSpaceGroupInput(spaces, groups, input.moderation_filter || 'approved', authContext);

    const fetchLimit = (limit + offset) * 2;
    const hasQuery = input.query?.trim();

    const { allResults, spacesSearched, groupsSearched } = await this.fetchAcrossCollections(
      input, spaces, groups,
      async (collection, baseFilters) => {
        const combined = baseFilters.length > 0 ? Filters.and(...baseFilters) : undefined;

        if (hasQuery) {
          const opts: any = { limit: fetchLimit, alpha: 0.7, query: hasQuery };
          if (combined) opts.filters = combined;
          return (await collection.query.hybrid(hasQuery, opts)).objects;
        }

        const opts: any = {
          limit: fetchLimit,
          sort: collection.sort.byProperty('curated_score', direction === 'asc'),
        };
        if (combined) opts.filters = combined;
        return (await collection.query.fetchObjects(opts)).objects;
      },
    );

    const deduped = dedupeBySourceId(allResults, input.dedupe);
    deduped.sort((a: any, b: any) => {
      const aVal = (a.properties?.curated_score as number) ?? 0;
      const bVal = (b.properties?.curated_score as number) ?? 0;
      return direction === 'desc' ? bVal - aVal : aVal - bVal;
    });

    const paginated = deduped.slice(offset, offset + limit);
    const memories = paginated
      .filter((obj: any) => obj.properties?.doc_type === 'memory')
      .map((obj: any) => ({ id: obj.uuid, ...obj.properties }));

    return { spaces_searched: spacesSearched, groups_searched: groupsSearched, memories, total: memories.length, offset, limit };
  }

  // ── Private: Validate Space/Group Input ───────────────────────────

  private validateSpaceGroupInput(
    spaces: string[],
    groups: string[],
    moderationFilter: ModerationFilter,
    authContext?: AuthContext,
  ): void {
    if (spaces.length > 0) {
      const invalid = spaces.filter((s) => !isValidSpaceId(s));
      if (invalid.length > 0) {
        throw new ValidationError(`Invalid space IDs: ${invalid.join(', ')}`, { spaces: invalid });
      }
    }
    if (groups.length > 0) {
      const invalid = groups.filter((g) => !g || g.includes('.') || g.trim() === '');
      if (invalid.length > 0) {
        throw new ValidationError('Group IDs cannot be empty or contain dots');
      }
    }
    if (moderationFilter !== 'approved') {
      for (const groupId of groups) {
        if (!canModerate(authContext, groupId)) {
          throw new ForbiddenError(`Moderator access required to view ${moderationFilter} memories in group ${groupId}`);
        }
      }
      if ((spaces.length > 0 || groups.length === 0) && !canModerateAny(authContext)) {
        throw new ForbiddenError(`Moderator access required to view ${moderationFilter} memories in spaces`);
      }
    }
  }

  // ── Private: Fetch Across Collections ─────────────────────────────

  private async fetchAcrossCollections(
    input: SpaceSortBaseInput,
    spaces: string[],
    groups: string[],
    fetchFn: (collection: any, baseFilters: any[]) => Promise<any[]>,
  ): Promise<{ allResults: any[]; spacesSearched: string[] | 'all_public'; groupsSearched: string[] }> {
    const allResults: any[] = [];

    // Search spaces collection
    if (spaces.length > 0 || groups.length === 0) {
      await ensurePublicCollection(this.weaviateClient);
      const name = getCollectionName(CollectionType.SPACES);
      const collection = this.weaviateClient.collections.get(name);
      const baseFilters = this.buildBaseFilters(collection, input);
      if (spaces.length > 0) {
        baseFilters.push(collection.filter.byProperty('space_ids').containsAny(spaces));
      }
      allResults.push(...tagWithSource(await fetchFn(collection, baseFilters), name));
    }

    // Search group collections
    for (const groupId of groups) {
      const name = getCollectionName(CollectionType.GROUPS, groupId);
      const exists = await this.weaviateClient.collections.exists(name);
      if (!exists) continue;
      const collection = this.weaviateClient.collections.get(name);
      const baseFilters = this.buildBaseFilters(collection, input);
      allResults.push(...tagWithSource(await fetchFn(collection, baseFilters), name));
    }

    return {
      allResults,
      spacesSearched: spaces.length > 0 ? spaces : (groups.length === 0 ? 'all_public' as const : []),
      groupsSearched: groups,
    };
  }

  // ── Private: Build Base Filters ─────────────────────────────────────

  private buildBaseFilters(collection: any, input: SearchSpaceInput | SpaceSortBaseInput): any[] {
    const filterList: any[] = [];

    // Note: space/group memories use the retract model (remove groupId from
    // group_ids) rather than soft-delete (deleted_at). No deleted_at filter here.

    // Only memories
    filterList.push(collection.filter.byProperty('doc_type').equal('memory'));

    // Moderation filter
    const moderationFilter = buildModerationFilter(collection, input.moderation_filter);
    if (moderationFilter) filterList.push(moderationFilter);

    // Content type
    if (input.content_type) {
      filterList.push(collection.filter.byProperty('content_type').equal(input.content_type));
    }

    // Exclude comments by default
    if (!input.include_comments && !input.content_type) {
      filterList.push(collection.filter.byProperty('content_type').notEqual('comment'));
    }

    // Tags (AND semantics)
    if (input.tags?.length) {
      input.tags.forEach((tag) => {
        filterList.push(collection.filter.byProperty('tags').containsAny([tag]));
      });
    }

    // Weight filters
    if (input.min_weight !== undefined) {
      filterList.push(collection.filter.byProperty('weight').greaterOrEqual(input.min_weight));
    }
    if (input.max_weight !== undefined) {
      filterList.push(collection.filter.byProperty('weight').lessOrEqual(input.max_weight));
    }

    // Date filters
    if (input.date_from) {
      filterList.push(collection.filter.byProperty('created_at').greaterOrEqual(new Date(input.date_from)));
    }
    if (input.date_to) {
      filterList.push(collection.filter.byProperty('created_at').lessOrEqual(new Date(input.date_to)));
    }

    return filterList;
  }

  // ── Private: Execute Search ─────────────────────────────────────────

  private async executeSearch(
    collection: any,
    query: string,
    searchType: 'hybrid' | 'bm25' | 'semantic',
    filters: any | undefined,
    limit: number,
  ): Promise<any[]> {
    const opts: any = { limit };
    if (filters) opts.filters = filters;

    // Empty/blank queries can't be vectorized — fall back to fetchObjects (no search, just filter+return)
    const isWildcard = !query.trim() || query === '*';
    if (isWildcard) {
      return (await collection.query.fetchObjects(opts)).objects;
    }

    switch (searchType) {
      case 'bm25':
        return (await collection.query.bm25(query, opts)).objects;
      case 'semantic':
        return (await collection.query.nearText([query], opts)).objects;
      case 'hybrid':
      default:
        return (await collection.query.hybrid(query, opts)).objects;
    }
  }

  // ── Get Published Locations ─────────────────────────────────────────

  /**
   * Look up a published memory's space_ids and group_ids from the public collection.
   * Returns empty arrays if the memory is not found in any space.
   */
  async getPublishedLocations(memoryId: string): Promise<{ space_ids: string[]; group_ids: string[] }> {
    const publicCollection = await ensurePublicCollection(this.weaviateClient);

    // Try by original_memory_id first
    const filter = publicCollection.filter.byProperty('original_memory_id').equal(memoryId);
    const result = await publicCollection.query.fetchObjects({ filters: filter, limit: 1 });

    // Fall back to direct UUID lookup (memoryId may be composite_id)
    let props: Record<string, any> | undefined;
    if (result.objects.length > 0) {
      props = result.objects[0].properties;
    } else {
      try {
        const obj = await publicCollection.query.fetchObjectById(memoryId);
        if (obj) {
          props = obj.properties;
        }
      } catch {
        // Not found by UUID either
      }
    }

    if (!props) {
      return { space_ids: [], group_ids: [] };
    }
    return {
      space_ids: Array.isArray(props.space_ids) ? props.space_ids : [],
      group_ids: Array.isArray(props.group_ids) ? props.group_ids : [],
    };
  }
}
