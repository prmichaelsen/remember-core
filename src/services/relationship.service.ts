/**
 * RelationshipService — CRUD + search for memory relationships.
 *
 * Extracted from 4 remember-mcp tool handlers:
 *   create-relationship.ts, update-relationship.ts,
 *   search-relationship.ts, delete-relationship.ts
 *
 * Relationships are stored with doc_type='relationship' in the same
 * Weaviate collection as memories (Memory_users_{userId}).
 */

import { Filters } from 'weaviate-client';
import type { Logger } from '../utils/logger.js';
import {
  buildDeletedFilter,
  combineFiltersWithAnd,
  type DeletedFilter,
} from '../utils/filters.js';
import type { RelationshipSource, ReorderOperation } from '../types/memory.types.js';
import {
  applyReorder,
  parseMemberOrder,
  serializeMemberOrder,
  buildDefaultOrder,
  compactOrder,
  sortMemberIdsByOrder,
} from './relationship-reorder.js';

// ─── Input/Output Types ──────────────────────────────────────────────────

export interface CreateRelationshipInput {
  memory_ids: string[];
  relationship_type: string;
  observation: string;
  strength?: number;
  confidence?: number;
  tags?: string[];
  context_summary?: string;
  context_conversation_id?: string;
  source?: 'user' | 'rem' | 'rule';
}

export interface CreateRelationshipResult {
  relationship_id: string;
  memory_ids: string[];
  created_at: string;
}

export interface UpdateRelationshipInput {
  relationship_id: string;
  relationship_type?: string;
  observation?: string;
  strength?: number;
  confidence?: number;
  tags?: string[];
  add_memory_ids?: string[];
  remove_memory_ids?: string[];
}

export interface UpdateRelationshipResult {
  relationship_id: string;
  updated_at: string;
  version: number;
  updated_fields: string[];
}

export interface SearchRelationshipInput {
  query: string;
  relationship_types?: string[];
  strength_min?: number;
  confidence_min?: number;
  tags?: string[];
  limit?: number;
  offset?: number;
  deleted_filter?: DeletedFilter;
  source?: RelationshipSource[];
  sort_by?: 'created_at' | 'updated_at' | 'member_count' | 'relationship_type';
  sort_direction?: 'asc' | 'desc';
}

export interface SearchRelationshipResult {
  relationships: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

export interface FindByMemoryIdsInput {
  memory_ids: string[];
  source_filter?: 'user' | 'rem' | 'rule';
  limit?: number;
}

export interface FindByMemoryIdsResult {
  relationships: Record<string, unknown>[];
  total: number;
}

export type GetRelationshipResult =
  | { found: true; relationship: Record<string, unknown> }
  | { found: false; relationship?: undefined };

export interface ReorderRelationshipInput {
  relationship_id: string;
  operation: ReorderOperation;
  version: number;
}

export interface ReorderRelationshipResult {
  relationship_id: string;
  member_order: Record<string, number>;
  version: number;
  updated_at: string;
}

export interface DeleteRelationshipInput {
  relationship_id: string;
}

export interface DeleteRelationshipResult {
  relationship_id: string;
  memories_updated: number;
}

// ─── Utilities ───────────────────────────────────────────────────────────

/**
 * Compute overlap ratio: |intersection| / |candidate|.
 * Returns 0 if candidate is empty.
 */
export function computeOverlap(existing: string[], candidate: string[]): number {
  if (candidate.length === 0) return 0;
  const existingSet = new Set(existing);
  const intersection = candidate.filter((id) => existingSet.has(id));
  return intersection.length / candidate.length;
}

// ─── Service ─────────────────────────────────────────────────────────────

export class RelationshipService {
  constructor(
    private collection: any,
    private userId: string,
    private logger: Logger,
  ) {}

  // ── Helper Methods ──────────────────────────────────────────────────

  /**
   * Update relationship_count for a memory by a delta (+1 or -1).
   * Ensures count never goes negative.
   */
  private async updateRelationshipCount(
    memoryId: string,
    delta: number,
  ): Promise<void> {
    try {
      const memory = await this.collection.query.fetchObjectById(memoryId, {
        returnProperties: ['relationship_count'],
      });

      if (!memory) {
        this.logger.warn(`Memory ${memoryId} not found, skipping relationship_count update`);
        return;
      }

      const currentCount = (memory.properties.relationship_count as number) || 0;
      const newCount = Math.max(0, currentCount + delta); // Floor at 0

      await this.collection.data.update({
        id: memoryId,
        properties: {
          relationship_count: newCount,
        },
      });

      this.logger.debug(`Updated relationship_count for ${memoryId}: ${currentCount} -> ${newCount}`);
    } catch (error: any) {
      this.logger.error(`Failed to update relationship_count for ${memoryId}:`, { error: error?.message || String(error) });
      // Don't throw - this is a denormalized field, not critical for relationship creation
    }
  }

  /**
   * Validate that memory IDs exist, are memories, and not deleted.
   * Returns validated entries with their current relationship_ids and owner user_id.
   */
  private async validateMemoryIds(
    memoryIds: string[],
  ): Promise<Array<{ memoryId: string; relationships: string[]; ownerId: string }>> {
    const checks = await Promise.all(
      memoryIds.map(async (memoryId) => {
        const memory = await this.collection.query.fetchObjectById(memoryId, {
          returnProperties: ['user_id', 'doc_type', 'relationship_ids', 'deleted_at'],
        });
        if (!memory) return { memoryId, error: 'Memory not found' };
        if (memory.properties.doc_type !== 'memory') return { memoryId, error: 'Not a memory document' };
        if (memory.properties.deleted_at) return { memoryId, error: 'Memory is deleted' };
        return {
          memoryId,
          relationships: (memory.properties.relationship_ids as string[]) || [],
          ownerId: memory.properties.user_id as string,
        };
      }),
    );

    const errors = checks.filter((c): c is typeof c & { error: string } => 'error' in c && !!c.error);
    if (errors.length > 0) {
      throw new Error(`Memory validation failed: ${errors.map((e) => `${e.memoryId}: ${e.error}`).join('; ')}`);
    }

    return checks as Array<{ memoryId: string; relationships: string[]; ownerId: string }>;
  }

  /**
   * Add bidirectional relationship_ids links from memories to a relationship.
   * Only updates memories owned by the current user.
   */
  private async linkMemoriesToRelationship(
    relationshipId: string,
    validated: Array<{ memoryId: string; relationships: string[]; ownerId: string }>,
    now: string,
  ): Promise<void> {
    const owned = validated.filter((c) => c.ownerId === this.userId);
    await Promise.all(
      owned.map(async (c) => {
        try {
          await this.collection.data.update({
            id: c.memoryId,
            properties: {
              relationship_ids: [...c.relationships, relationshipId],
              updated_at: now,
            },
          });
        } catch {
          this.logger.warn(`Failed to update memory ${c.memoryId} with relationship`);
        }
      }),
    );
  }

  // ── Get by ID ────────────────────────────────────────────────────────

  async getById(relationshipId: string): Promise<GetRelationshipResult> {
    const result = await this.collection.query.fetchObjectById(relationshipId, {
      returnProperties: [
        'user_id', 'related_memory_ids', 'relationship_type', 'observation',
        'strength', 'confidence', 'source', 'tags', 'member_count',
        'created_at', 'updated_at', 'version', 'member_order_json',
      ],
    });

    if (!result) {
      return { found: false };
    }

    return {
      found: true,
      relationship: this.hydrateRelationship(relationshipId, result.properties),
    };
  }

  // ── Create ──────────────────────────────────────────────────────────

  async create(input: CreateRelationshipInput): Promise<CreateRelationshipResult> {
    if (input.memory_ids.length < 1) {
      throw new Error('At least 1 memory ID is required to create a relationship');
    }

    const validated = await this.validateMemoryIds(input.memory_ids);

    const now = new Date().toISOString();
    const properties: Record<string, unknown> = {
      user_id: this.userId,
      doc_type: 'relationship',
      related_memory_ids: input.memory_ids,
      relationship_type: input.relationship_type,
      observation: input.observation,
      strength: input.strength ?? 0.5,
      confidence: input.confidence ?? 0.8,
      source: input.source ?? 'user',
      member_count: input.memory_ids.length,
      member_order_json: serializeMemberOrder(buildDefaultOrder(input.memory_ids)),
      created_at: now,
      updated_at: now,
      version: 1,
      tags: input.tags || [],
    };

    const relationshipId = await this.collection.data.insert({ properties });

    // Update relationship_count for owned memories only
    const ownedMemoryIds = validated.filter((c) => c.ownerId === this.userId).map((c) => c.memoryId);
    await Promise.all(
      ownedMemoryIds.map((memoryId) => this.updateRelationshipCount(memoryId, +1)),
    );

    // Update connected memories with bidirectional reference
    await this.linkMemoriesToRelationship(relationshipId, validated, now);

    this.logger.info('Relationship created', { relationshipId, memoryCount: input.memory_ids.length });
    return { relationship_id: relationshipId, memory_ids: input.memory_ids, created_at: now };
  }

  // ── Update ──────────────────────────────────────────────────────────

  async update(input: UpdateRelationshipInput): Promise<UpdateRelationshipResult> {
    const fetchProps = ['user_id', 'doc_type', 'version'];
    const needAddMemoryIds = input.add_memory_ids && input.add_memory_ids.length > 0;
    const needRemoveMemoryIds = input.remove_memory_ids && input.remove_memory_ids.length > 0;
    if (needAddMemoryIds || needRemoveMemoryIds) fetchProps.push('related_memory_ids', 'member_order_json');

    const existing = await this.collection.query.fetchObjectById(input.relationship_id, {
      returnProperties: fetchProps,
    });
    if (!existing) throw new Error(`Relationship not found: ${input.relationship_id}`);
    if (existing.properties.user_id !== this.userId) throw new Error('Unauthorized');
    if (existing.properties.doc_type !== 'relationship') throw new Error('Not a relationship document');

    const updates: Record<string, unknown> = {};
    const updatedFields: string[] = [];

    if (input.relationship_type !== undefined) { updates.relationship_type = input.relationship_type; updatedFields.push('relationship_type'); }
    if (input.observation !== undefined) { updates.observation = input.observation; updatedFields.push('observation'); }
    if (input.strength !== undefined) {
      if (input.strength < 0 || input.strength > 1) throw new Error('Strength must be between 0 and 1');
      updates.strength = input.strength; updatedFields.push('strength');
    }
    if (input.confidence !== undefined) {
      if (input.confidence < 0 || input.confidence > 1) throw new Error('Confidence must be between 0 and 1');
      updates.confidence = input.confidence; updatedFields.push('confidence');
    }
    if (input.tags !== undefined) { updates.tags = input.tags; updatedFields.push('tags'); }

    // Track memory ID changes
    let existingMemoryIds = new Set((existing.properties.related_memory_ids as string[]) || []);
    let newMemoryIds: string[] = [];
    let validated: Array<{ memoryId: string; relationships: string[]; ownerId: string }> = [];
    let removedMemoryIds: string[] = [];

    // Handle add_memory_ids: deduplicate, validate, link
    if (needAddMemoryIds) {
      newMemoryIds = input.add_memory_ids!.filter((id) => !existingMemoryIds.has(id));

      if (newMemoryIds.length > 0) {
        validated = await this.validateMemoryIds(newMemoryIds);
        newMemoryIds.forEach((id) => existingMemoryIds.add(id));
      }
    }

    // Handle remove_memory_ids: filter out from existing
    if (needRemoveMemoryIds) {
      const removeSet = new Set(input.remove_memory_ids!);
      removedMemoryIds = input.remove_memory_ids!.filter((id) => existingMemoryIds.has(id));
      if (removedMemoryIds.length > 0) {
        removedMemoryIds.forEach((id) => existingMemoryIds.delete(id));
      }
    }

    // Update related_memory_ids and member_order_json if changed
    if (newMemoryIds.length > 0 || removedMemoryIds.length > 0) {
      const allMemoryIds = [...existingMemoryIds];
      updates.related_memory_ids = allMemoryIds;
      updates.member_count = allMemoryIds.length;
      updatedFields.push('related_memory_ids', 'member_count');

      // Update member_order_json
      const currentOrder = parseMemberOrder(existing.properties.member_order_json as string | null);
      let order = Object.keys(currentOrder).length > 0
        ? { ...currentOrder }
        : buildDefaultOrder((existing.properties.related_memory_ids as string[]) || []);

      // Append new members at the end
      if (newMemoryIds.length > 0) {
        const maxPos = Math.max(-1, ...Object.values(order));
        for (let i = 0; i < newMemoryIds.length; i++) {
          order[newMemoryIds[i]] = maxPos + 1 + i;
        }
      }

      // Remove members and compact
      if (removedMemoryIds.length > 0) {
        for (const id of removedMemoryIds) {
          delete order[id];
        }
        order = compactOrder(order);
      }

      updates.member_order_json = serializeMemberOrder(order);
      updatedFields.push('member_order');
    }

    if (updatedFields.length === 0) throw new Error('No fields provided for update');

    const now = new Date().toISOString();
    updates.updated_at = now;
    updates.version = (existing.properties.version as number) + 1;

    await this.collection.data.update({ id: input.relationship_id, properties: updates });

    // Link new memories bidirectionally and update their relationship_count (owned only)
    if (newMemoryIds.length > 0) {
      const ownedNewMemoryIds = validated.filter((c) => c.ownerId === this.userId).map((c) => c.memoryId);
      await Promise.all([
        this.linkMemoriesToRelationship(input.relationship_id, validated, now),
        ...ownedNewMemoryIds.map((memoryId) => this.updateRelationshipCount(memoryId, +1)),
      ]);
    }

    // Unlink removed memories and decrement their relationship_count
    if (removedMemoryIds.length > 0) {
      await Promise.all(
        removedMemoryIds.map(async (memoryId) => {
          try {
            const memory = await this.collection.query.fetchObjectById(memoryId, {
              returnProperties: ['relationship_ids', 'doc_type', 'user_id'],
            });
            if (!memory || memory.properties.doc_type !== 'memory') return;
            const current = (memory.properties.relationship_ids as string[]) || [];
            const updated = current.filter((id) => id !== input.relationship_id);
            if (updated.length !== current.length) {
              await this.collection.data.update({
                id: memoryId,
                properties: { relationship_ids: updated, updated_at: now },
              });
            }
            if (memory.properties.user_id === this.userId) {
              await this.updateRelationshipCount(memoryId, -1);
            }
          } catch {
            this.logger.warn(`Failed to unlink memory ${memoryId} from relationship`);
          }
        }),
      );
    }

    this.logger.info('Relationship updated', { relationshipId: input.relationship_id, updatedFields });
    return {
      relationship_id: input.relationship_id,
      updated_at: now,
      version: updates.version as number,
      updated_fields: updatedFields,
    };
  }

  // ── Search ──────────────────────────────────────────────────────────

  async search(input: SearchRelationshipInput): Promise<SearchRelationshipResult> {
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;

    const filterList: any[] = [];

    const deletedFilter = buildDeletedFilter(this.collection, input.deleted_filter || 'exclude');
    if (deletedFilter) filterList.push(deletedFilter);

    filterList.push(this.collection.filter.byProperty('doc_type').equal('relationship'));

    if (input.relationship_types?.length) {
      if (input.relationship_types.length === 1) {
        filterList.push(this.collection.filter.byProperty('relationship_type').equal(input.relationship_types[0]));
      } else {
        filterList.push(Filters.or(
          ...input.relationship_types.map((t) => this.collection.filter.byProperty('relationship_type').equal(t)),
        ));
      }
    }
    if (input.strength_min !== undefined) {
      filterList.push(this.collection.filter.byProperty('strength').greaterOrEqual(input.strength_min));
    }
    if (input.confidence_min !== undefined) {
      filterList.push(this.collection.filter.byProperty('confidence').greaterOrEqual(input.confidence_min));
    }
    if (input.tags?.length) {
      filterList.push(this.collection.filter.byProperty('tags').containsAny(input.tags));
    }
    if (input.source?.length) {
      if (input.source.length === 1) {
        filterList.push(this.collection.filter.byProperty('source').equal(input.source[0]));
      } else {
        filterList.push(Filters.or(
          ...input.source.map((s) => this.collection.filter.byProperty('source').equal(s)),
        ));
      }
    }

    const combinedFilters = combineFiltersWithAnd(filterList);
    const opts: any = { limit: limit + offset };
    if (combinedFilters) opts.filters = combinedFilters;
    if (input.sort_by) {
      opts.sort = this.collection.sort.byProperty(input.sort_by, input.sort_direction === 'asc');
    }

    const isWildcard = !input.query || input.query === '*';
    const results = isWildcard
      ? await this.collection.query.fetchObjects(opts)
      : await this.collection.query.hybrid(input.query, { ...opts, alpha: 1.0 });
    const paginated = results.objects.slice(offset, offset + limit);

    const relationships = paginated.map((obj: any) =>
      this.hydrateRelationship(obj.uuid, obj.properties),
    );

    return { relationships, total: results.objects.length, offset, limit };
  }

  // ── Find by Memory IDs ──────────────────────────────────────────────

  async findByMemoryIds(input: FindByMemoryIdsInput): Promise<FindByMemoryIdsResult> {
    if (input.memory_ids.length === 0) {
      return { relationships: [], total: 0 };
    }

    const limit = input.limit ?? 100;
    const filterList: any[] = [
      this.collection.filter.byProperty('doc_type').equal('relationship'),
      this.collection.filter.byProperty('related_memory_ids').containsAny(input.memory_ids),
    ];

    if (input.source_filter) {
      filterList.push(this.collection.filter.byProperty('source').equal(input.source_filter));
    }

    const combinedFilters = combineFiltersWithAnd(filterList);
    const results = await this.collection.query.fetchObjects({
      filters: combinedFilters,
      limit,
      returnProperties: [
        'user_id', 'doc_type', 'related_memory_ids', 'memory_ids',
        'relationship_type', 'observation', 'strength', 'confidence',
        'source', 'tags', 'member_count', 'created_at', 'updated_at', 'version',
        'member_order_json',
      ],
    });

    const relationships = results.objects.map((obj: any) =>
      this.hydrateRelationship(obj.uuid, obj.properties),
    );

    return { relationships, total: relationships.length };
  }

  // ── Reorder ─────────────────────────────────────────────────────────

  async reorder(input: ReorderRelationshipInput): Promise<ReorderRelationshipResult> {
    const existing = await this.collection.query.fetchObjectById(input.relationship_id, {
      returnProperties: ['user_id', 'doc_type', 'version', 'related_memory_ids', 'member_order_json'],
    });
    if (!existing) throw new Error(`Relationship not found: ${input.relationship_id}`);
    if (existing.properties.user_id !== this.userId) throw new Error('Unauthorized');
    if (existing.properties.doc_type !== 'relationship') throw new Error('Not a relationship document');

    const currentVersion = existing.properties.version as number;
    if (currentVersion !== input.version) {
      throw new Error(`409: Version conflict — expected ${input.version}, found ${currentVersion}`);
    }

    const memberIds = (existing.properties.related_memory_ids as string[]) || [];
    const currentOrder = parseMemberOrder(existing.properties.member_order_json as string | null);
    const newOrder = applyReorder(currentOrder, memberIds, input.operation);

    const now = new Date().toISOString();
    const newVersion = currentVersion + 1;

    await this.collection.data.update({
      id: input.relationship_id,
      properties: {
        member_order_json: serializeMemberOrder(newOrder),
        version: newVersion,
        updated_at: now,
      },
    });

    this.logger.info('Relationship reordered', { relationshipId: input.relationship_id, operation: input.operation.type });
    return {
      relationship_id: input.relationship_id,
      member_order: newOrder,
      version: newVersion,
      updated_at: now,
    };
  }

  // ── Hydration Helper ──────────────────────────────────────────────

  /**
   * Hydrate a raw Weaviate relationship object:
   * - Parse member_order_json → member_order
   * - Lazy backfill: generate default order if missing
   * - Sort related_memory_ids by position
   */
  private hydrateRelationship(id: string, properties: Record<string, unknown>): Record<string, unknown> {
    const memberIds = (properties.related_memory_ids as string[]) || [];
    const rawOrder = properties.member_order_json as string | null | undefined;
    let memberOrder = parseMemberOrder(rawOrder);

    // Lazy backfill: if no order stored, derive from array position
    if (Object.keys(memberOrder).length === 0 && memberIds.length > 0) {
      memberOrder = buildDefaultOrder(memberIds);
    }

    // Sort member IDs by position
    const sortedMemberIds = sortMemberIdsByOrder(memberIds, memberOrder);

    const { member_order_json: _raw, ...rest } = properties;
    return {
      id,
      ...rest,
      related_memory_ids: sortedMemberIds,
      member_order: memberOrder,
    };
  }

  // ── Delete ──────────────────────────────────────────────────────────

  async delete(input: DeleteRelationshipInput): Promise<DeleteRelationshipResult> {
    const existing = await this.collection.query.fetchObjectById(input.relationship_id, {
      returnProperties: ['user_id', 'doc_type', 'related_memory_ids'],
    });
    if (!existing) throw new Error(`Relationship not found: ${input.relationship_id}`);
    if (existing.properties.user_id !== this.userId) throw new Error('Unauthorized');
    if (existing.properties.doc_type !== 'relationship') throw new Error('Not a relationship document');

    const memoryIds = (existing.properties.related_memory_ids as string[]) || [];
    let memoriesUpdated = 0;

    // Remove relationship reference and update count only for owned memories
    await Promise.all(
      memoryIds.map(async (memoryId) => {
        try {
          const memory = await this.collection.query.fetchObjectById(memoryId, {
            returnProperties: ['relationship_ids', 'doc_type', 'user_id'],
          });
          if (!memory || memory.properties.doc_type !== 'memory') return;
          if (memory.properties.user_id !== this.userId) return; // skip foreign memories
          const current = (memory.properties.relationship_ids as string[]) || [];
          const updated = current.filter((id) => id !== input.relationship_id);
          if (updated.length !== current.length) {
            await this.collection.data.update({
              id: memoryId,
              properties: { relationship_ids: updated, updated_at: new Date().toISOString() },
            });
            memoriesUpdated++;
          }
          await this.updateRelationshipCount(memoryId, -1);
        } catch {
          this.logger.warn(`Failed to clean up memory ${memoryId}`);
        }
      }),
    );

    await this.collection.data.deleteById(input.relationship_id);

    this.logger.info('Relationship deleted', { relationshipId: input.relationship_id, memoriesUpdated });
    return { relationship_id: input.relationship_id, memories_updated: memoriesUpdated };
  }
}
