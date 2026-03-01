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
import { CollectionType, getCollectionName } from '../collections/dot-notation.js';
import { generateCompositeId, compositeIdToUuid } from '../collections/composite-ids.js';
import { getSpaceConfig } from './space-config.service.js';
import { canModerate, canModerateAny } from '../utils/auth-helpers.js';

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
  constructor(
    private weaviateClient: any,
    private userCollection: any,
    private userId: string,
    private confirmationTokenService: ConfirmationTokenService,
    private logger: Logger,
  ) {}

  // ── Publish (phase 1: generate confirmation token) ──────────────────

  async publish(input: PublishInput): Promise<PublishResult> {
    const spaces = input.spaces || [];
    const groups = input.groups || [];

    if (spaces.length === 0 && groups.length === 0) {
      throw new Error('Must specify at least one space or group to publish to');
    }

    // Validate space IDs
    if (spaces.length > 0) {
      const invalidSpaces = spaces.filter((s) => !isValidSpaceId(s));
      if (invalidSpaces.length > 0) {
        throw new Error(`Invalid space IDs: ${invalidSpaces.join(', ')}`);
      }
    }

    // Validate group IDs (no dots, not empty)
    if (groups.length > 0) {
      const invalidGroups = groups.filter((g) => !g || g.includes('.') || g.trim() === '');
      if (invalidGroups.length > 0) {
        throw new Error('Group IDs cannot be empty or contain dots');
      }
    }

    // Verify memory exists, belongs to user, is a memory
    const memory = await fetchMemoryWithAllProperties(this.userCollection, input.memory_id);
    if (!memory) throw new Error(`Memory not found: ${input.memory_id}`);
    if (memory.properties.user_id !== this.userId) throw new Error('Permission denied: not memory owner');
    if (memory.properties.doc_type !== 'memory') throw new Error('Only memories can be published');

    // Generate confirmation token
    const { token } = await this.confirmationTokenService.createRequest(
      this.userId,
      'publish_memory',
      {
        memory_id: input.memory_id,
        spaces,
        groups,
        additional_tags: input.additional_tags || [],
      },
    );

    this.logger.info('Publish confirmation created', {
      userId: this.userId,
      memoryId: input.memory_id,
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
      throw new Error('Must specify at least one space or group to retract from');
    }

    // Validate group IDs
    if (groups.length > 0) {
      const invalidGroups = groups.filter((g) => g.includes('.'));
      if (invalidGroups.length > 0) {
        throw new Error(`Group IDs cannot contain dots: ${invalidGroups.join(', ')}`);
      }
    }

    // Verify memory exists and belongs to user
    const memory = await fetchMemoryWithAllProperties(this.userCollection, input.memory_id);
    if (!memory) throw new Error(`Memory not found: ${input.memory_id}`);
    if (memory.properties.user_id !== this.userId) throw new Error('Permission denied: not memory owner');

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
      throw new Error(
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
        memory_id: input.memory_id,
        spaces,
        groups,
        current_space_ids: currentSpaceIds,
        current_group_ids: currentGroupIds,
      },
    );

    this.logger.info('Retract confirmation created', {
      userId: this.userId,
      memoryId: input.memory_id,
      spaces,
      groups,
    });

    return { token };
  }

  // ── Revise (phase 1: generate confirmation token) ───────────────────

  async revise(input: ReviseInput): Promise<ReviseResult> {
    const memory = await fetchMemoryWithAllProperties(this.userCollection, input.memory_id);
    if (!memory) throw new Error(`Memory not found: ${input.memory_id}`);
    if (memory.properties.user_id !== this.userId) throw new Error('Permission denied: not memory owner');

    const spaceIds: string[] = Array.isArray(memory.properties.space_ids)
      ? memory.properties.space_ids
      : [];
    const groupIds: string[] = Array.isArray(memory.properties.group_ids)
      ? memory.properties.group_ids
      : [];

    if (spaceIds.length === 0 && groupIds.length === 0) {
      throw new Error('Memory has no published copies to revise. Publish first with publish().');
    }

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
      throw new Error('Invalid or expired confirmation token');
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

    throw new Error(`Unknown action type: ${request.action}`);
  }

  // ── Deny ────────────────────────────────────────────────────────────

  async deny(input: DenyInput): Promise<DenyResult> {
    const success = await this.confirmationTokenService.denyRequest(this.userId, input.token);
    if (!success) {
      throw new Error('Token not found or already used');
    }
    return { success: true };
  }

  // ── Moderate ────────────────────────────────────────────────────────

  async moderate(input: ModerateInput, authContext?: AuthContext): Promise<ModerateResult> {
    if (!input.space_id && !input.group_id) {
      throw new Error('Must specify either space_id or group_id');
    }

    if (!ACTION_TO_STATUS[input.action]) {
      throw new Error(`Invalid action: ${input.action}. Must be approve, reject, or remove`);
    }

    // Permission check
    if (input.group_id) {
      if (!canModerate(authContext, input.group_id)) {
        throw new Error(`Moderator access required for group ${input.group_id}`);
      }
    } else if (input.space_id) {
      if (!canModerateAny(authContext)) {
        throw new Error('Moderator access required to moderate memories in spaces');
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
      const location = input.group_id ? `group ${input.group_id}` : `space ${input.space_id}`;
      throw new Error(`Published memory ${input.memory_id} not found in ${location}`);
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
        throw new Error(`Invalid space IDs: ${invalidSpaces.join(', ')}`);
      }
    }

    // Validate group IDs
    if (groups.length > 0) {
      const invalidGroups = groups.filter((g) => !g || g.includes('.') || g.trim() === '');
      if (invalidGroups.length > 0) {
        throw new Error('Group IDs cannot be empty or contain dots');
      }
    }

    // Permission check for non-approved moderation filters
    const moderationFilter = input.moderation_filter || 'approved';
    if (moderationFilter !== 'approved') {
      for (const groupId of groups) {
        if (!canModerate(authContext, groupId)) {
          throw new Error(`Moderator access required to view ${moderationFilter} memories in group ${groupId}`);
        }
      }
      if ((spaces.length > 0 || groups.length === 0) && !canModerateAny(authContext)) {
        throw new Error(`Moderator access required to view ${moderationFilter} memories in spaces`);
      }
    }

    const fetchLimit = (limit + offset) * Math.max(1, groups.length + (spaces.length > 0 || groups.length === 0 ? 1 : 0));
    const allObjects: any[] = [];

    // Search spaces collection (when spaces specified or neither spaces nor groups)
    if (spaces.length > 0 || groups.length === 0) {
      const spacesCollectionName = getCollectionName(CollectionType.SPACES);
      const spacesCollection = this.weaviateClient.collections.get(spacesCollectionName);
      const filterList = this.buildBaseFilters(spacesCollection, input);

      if (spaces.length > 0) {
        filterList.push(spacesCollection.filter.byProperty('space_ids').containsAny(spaces));
      }

      const combinedFilters = filterList.length > 0 ? Filters.and(...filterList) : undefined;
      const spaceObjects = await this.executeSearch(spacesCollection, input.query, searchType, combinedFilters, fetchLimit);
      allObjects.push(...spaceObjects);
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
      allObjects.push(...groupObjects);
    }

    // Deduplicate by UUID
    const seen = new Set<string>();
    const deduplicated = allObjects.filter((obj) => {
      if (seen.has(obj.uuid)) return false;
      seen.add(obj.uuid);
      return true;
    });

    // Sort by relevance score
    deduplicated.sort((a, b) => {
      const scoreA = a.metadata?.score ?? 0;
      const scoreB = b.metadata?.score ?? 0;
      return scoreB - scoreA;
    });

    // Paginate
    const paginated = deduplicated.slice(offset, offset + limit);
    const memories = paginated.map((obj: any) => ({
      id: obj.uuid,
      ...obj.properties,
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
    if (!input.question?.trim()) throw new Error('Question cannot be empty');

    // Validate space IDs
    if (input.spaces.length === 0) throw new Error('Must specify at least one space to query');
    const invalidSpaces = input.spaces.filter((s) => !isValidSpaceId(s));
    if (invalidSpaces.length > 0) {
      throw new Error(`Invalid space IDs: ${invalidSpaces.join(', ')}`);
    }

    // Permission check for non-approved moderation filters
    const moderationFilterValue = input.moderation_filter || 'approved';
    if (moderationFilterValue !== 'approved' && !canModerateAny(authContext)) {
      throw new Error(`Moderator access required to view ${moderationFilterValue} memories in spaces`);
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

  // ── Private: Execute Publish ────────────────────────────────────────

  private async executePublish(
    request: ConfirmationRequest & { request_id: string },
  ): Promise<ConfirmResult> {
    const spaces: string[] = request.payload.spaces || [];
    const groups: string[] = request.payload.groups || [];

    if (spaces.length === 0 && groups.length === 0) {
      throw new Error('No destinations in publish request');
    }

    // Fetch the memory fresh
    const originalMemory = await fetchMemoryWithAllProperties(
      this.userCollection,
      request.payload.memory_id,
    );
    if (!originalMemory) throw new Error(`Memory ${request.payload.memory_id} no longer exists`);
    if (originalMemory.properties.user_id !== this.userId) throw new Error('Permission denied');

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
        };
        delete publishedMemory._additional;

        if (existingSpaceMemory) {
          await publicCollection.data.update({ id: weaviateId, properties: publishedMemory });
        } else {
          await publicCollection.data.insert({ id: weaviateId, properties: publishedMemory });
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
        const groupCollection = this.weaviateClient.collections.get(groupCollectionName);
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
        };
        delete groupMemory._additional;

        if (existingGroupMemory) {
          await groupCollection.data.update({ id: weaviateId, properties: groupMemory });
        } else {
          await groupCollection.data.insert({ id: weaviateId, properties: groupMemory });
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
    if (!sourceMemory) throw new Error(`Source memory ${request.payload.memory_id} no longer exists`);

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
    if (!sourceMemory) throw new Error(`Source memory ${memory_id} no longer exists`);
    if (sourceMemory.properties.user_id !== this.userId) throw new Error('Permission denied');

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

  // ── Private: Build Base Filters ─────────────────────────────────────

  private buildBaseFilters(collection: any, input: SearchSpaceInput): any[] {
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
}
