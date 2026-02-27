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
import type { SearchFilters } from '../types/search.types.js';
import type { ContentType } from '../types/index.js';
import { isValidContentType, DEFAULT_CONTENT_TYPE } from '../constants/content-types.js';
import { fetchMemoryWithAllProperties } from '../database/weaviate/client.js';
import {
  buildCombinedSearchFilters,
  buildMemoryOnlyFilters,
  buildDeletedFilter,
  combineFiltersWithAnd,
  type DeletedFilter,
} from '../utils/filters.js';

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

export interface DeleteMemoryResult {
  memory_id: string;
  deleted_at: string;
  orphaned_relationship_ids: string[];
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
  ) {}

  // ── Create ──────────────────────────────────────────────────────────

  async create(input: CreateMemoryInput): Promise<CreateMemoryResult> {
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
      trust_score: input.trust ?? 0.25,
      confidence: 1.0,
      context_summary: input.context_summary || 'Memory created',
      context_conversation_id: input.context_conversation_id,
      relationship_ids: [],
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
      space_ids: [],
      group_ids: [],
    };

    const memoryId = await this.collection.data.insert({ properties });
    this.logger.info('Memory created', { memoryId, userId: this.userId });

    return { memory_id: memoryId, created_at: now };
  }

  // ── Search (hybrid) ─────────────────────────────────────────────────

  async search(input: SearchMemoryInput): Promise<SearchMemoryResult> {
    if (!input.query?.trim()) throw new Error('Query cannot be empty');

    const includeRelationships = input.include_relationships !== false;
    const alpha = input.alpha ?? 0.7;
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;

    const deletedFilter = buildDeletedFilter(this.collection, input.deleted_filter || 'exclude');
    const searchFilters = includeRelationships
      ? buildCombinedSearchFilters(this.collection, input.filters)
      : buildMemoryOnlyFilters(this.collection, input.filters);
    const combinedFilters = combineFiltersWithAnd(
      [deletedFilter, searchFilters].filter((f) => f !== null),
    );

    const searchOptions: any = { alpha, limit: limit + offset };
    if (combinedFilters) searchOptions.filters = combinedFilters;

    const results = await this.collection.query.hybrid(input.query, searchOptions);
    const paginated = results.objects.slice(offset);

    const memories: Record<string, unknown>[] = [];
    const relationships: Record<string, unknown>[] = [];

    for (const obj of paginated) {
      const doc = { id: obj.uuid, ...obj.properties };
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

  // ── Find Similar (vector) ──────────────────────────────────────────

  async findSimilar(input: FindSimilarInput): Promise<FindSimilarResult> {
    if (!input.memory_id && !input.text) throw new Error('Either memory_id or text must be provided');
    if (input.memory_id && input.text) throw new Error('Provide either memory_id or text, not both');

    const limit = input.limit ?? 10;
    const minSimilarity = input.min_similarity ?? 0.7;
    const deletedFilter = buildDeletedFilter(this.collection, input.deleted_filter || 'exclude');

    let results: any;

    if (input.memory_id) {
      const memory = await this.collection.query.fetchObjectById(input.memory_id, {
        returnProperties: ['user_id', 'doc_type', 'content'],
      });
      if (!memory) throw new Error(`Memory not found: ${input.memory_id}`);
      if (memory.properties.user_id !== this.userId) throw new Error('Unauthorized');
      if (memory.properties.doc_type !== 'memory') throw new Error('Can only find similar for memory documents');

      const opts: any = { limit: limit + 1, distance: 1 - minSimilarity, returnMetadata: ['distance'] };
      if (deletedFilter) opts.filters = deletedFilter;
      results = await this.collection.query.nearObject(input.memory_id, opts);
      results.objects = results.objects.filter((o: any) => o.uuid !== input.memory_id);
    } else {
      const opts: any = { limit, distance: 1 - minSimilarity, returnMetadata: ['distance'] };
      if (deletedFilter) opts.filters = deletedFilter;
      results = await this.collection.query.nearText(input.text!, opts);
    }

    if (!input.include_relationships) {
      results.objects = results.objects.filter((o: any) => o.properties.doc_type === 'memory');
    }

    const items: SimilarMemoryItem[] = results.objects
      .map((obj: any) => ({
        id: obj.uuid,
        ...obj.properties,
        similarity: Math.max(0, Math.min(1, 1 - (obj.metadata?.distance ?? 0))),
      }))
      .sort((a: SimilarMemoryItem, b: SimilarMemoryItem) => b.similarity - a.similarity)
      .slice(0, limit);

    return { similar_memories: items, total: items.length };
  }

  // ── Query (semantic / nearText) ────────────────────────────────────

  async query(input: QueryMemoryInput): Promise<QueryMemoryResult> {
    if (!input.query?.trim()) throw new Error('Query cannot be empty');

    const limit = input.limit ?? 5;
    const minRelevance = input.min_relevance ?? 0.6;

    const deletedFilter = buildDeletedFilter(this.collection, input.deleted_filter || 'exclude');
    const searchFilters = buildCombinedSearchFilters(this.collection, input.filters);
    const combinedFilters = combineFiltersWithAnd(
      [deletedFilter, searchFilters].filter((f) => f !== null),
    );

    const opts: any = { limit, distance: 1 - minRelevance, returnMetadata: ['distance'] };
    if (combinedFilters) opts.filters = combinedFilters;

    const results = await this.collection.query.nearText(input.query, opts);

    const items: RelevantMemoryItem[] = results.objects
      .map((obj: any) => ({
        id: obj.uuid,
        ...obj.properties,
        relevance: Math.max(0, Math.min(1, 1 - (obj.metadata?.distance ?? 0))),
      }))
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
      if (input.trust < 0 || input.trust > 1) throw new Error('Trust must be between 0 and 1');
      updates.trust_score = input.trust; updatedFields.push('trust_score');
    }
    if (input.tags !== undefined) { updates.tags = input.tags; updatedFields.push('tags'); }
    if (input.references !== undefined) { updates.references = input.references; updatedFields.push('references'); }
    if (input.parent_id !== undefined) { updates.parent_id = input.parent_id; updatedFields.push('parent_id'); }
    if (input.thread_root_id !== undefined) { updates.thread_root_id = input.thread_root_id; updatedFields.push('thread_root_id'); }
    if (input.moderation_flags !== undefined) { updates.moderation_flags = input.moderation_flags; updatedFields.push('moderation_flags'); }

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
}
