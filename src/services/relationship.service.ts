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
}

export interface SearchRelationshipResult {
  relationships: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

export interface DeleteRelationshipInput {
  relationship_id: string;
}

export interface DeleteRelationshipResult {
  relationship_id: string;
  memories_updated: number;
}

// ─── Service ─────────────────────────────────────────────────────────────

export class RelationshipService {
  constructor(
    private collection: any,
    private userId: string,
    private logger: Logger,
  ) {}

  // ── Create ──────────────────────────────────────────────────────────

  async create(input: CreateRelationshipInput): Promise<CreateRelationshipResult> {
    if (input.memory_ids.length < 2) {
      throw new Error('At least 2 memory IDs are required to create a relationship');
    }

    // Validate all memories exist, belong to user, are memories, not deleted
    const checks = await Promise.all(
      input.memory_ids.map(async (memoryId) => {
        const memory = await this.collection.query.fetchObjectById(memoryId, {
          returnProperties: ['user_id', 'doc_type', 'relationship_ids', 'deleted_at'],
        });
        if (!memory) return { memoryId, error: 'Memory not found' };
        if (memory.properties.user_id !== this.userId) return { memoryId, error: 'Unauthorized' };
        if (memory.properties.doc_type !== 'memory') return { memoryId, error: 'Not a memory document' };
        if (memory.properties.deleted_at) return { memoryId, error: 'Memory is deleted' };
        return { memoryId, memory, relationships: (memory.properties.relationship_ids as string[]) || [] };
      }),
    );

    const errors = checks.filter((c) => c.error);
    if (errors.length > 0) {
      throw new Error(`Memory validation failed: ${errors.map((e) => `${e.memoryId}: ${e.error}`).join('; ')}`);
    }

    const now = new Date().toISOString();
    const properties: Record<string, unknown> = {
      user_id: this.userId,
      doc_type: 'relationship',
      related_memory_ids: input.memory_ids,
      relationship_type: input.relationship_type,
      observation: input.observation,
      strength: input.strength ?? 0.5,
      confidence: input.confidence ?? 0.8,
      created_at: now,
      updated_at: now,
      version: 1,
      tags: input.tags || [],
    };

    const relationshipId = await this.collection.data.insert({ properties });

    // Update connected memories with bidirectional reference
    await Promise.all(
      checks
        .filter((c) => !c.error && c.memory)
        .map(async (c) => {
          try {
            await this.collection.data.update({
              id: c.memoryId,
              properties: {
                relationship_ids: [...(c.relationships || []), relationshipId],
                updated_at: now,
              },
            });
          } catch {
            this.logger.warn(`Failed to update memory ${c.memoryId} with relationship`);
          }
        }),
    );

    this.logger.info('Relationship created', { relationshipId, memoryCount: input.memory_ids.length });
    return { relationship_id: relationshipId, memory_ids: input.memory_ids, created_at: now };
  }

  // ── Update ──────────────────────────────────────────────────────────

  async update(input: UpdateRelationshipInput): Promise<UpdateRelationshipResult> {
    const existing = await this.collection.query.fetchObjectById(input.relationship_id, {
      returnProperties: ['user_id', 'doc_type', 'version'],
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

    if (updatedFields.length === 0) throw new Error('No fields provided for update');

    const now = new Date().toISOString();
    updates.updated_at = now;
    updates.version = (existing.properties.version as number) + 1;

    await this.collection.data.update({ id: input.relationship_id, properties: updates });

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

    const combinedFilters = combineFiltersWithAnd(filterList);
    const opts: any = { alpha: 1.0, limit: limit + offset };
    if (combinedFilters) opts.filters = combinedFilters;

    const results = await this.collection.query.hybrid(input.query, opts);
    const paginated = results.objects.slice(offset, offset + limit);

    const relationships = paginated.map((obj: any) => ({
      id: obj.uuid,
      ...obj.properties,
    }));

    return { relationships, total: results.objects.length, offset, limit };
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

    // Remove relationship reference from connected memories
    await Promise.all(
      memoryIds.map(async (memoryId) => {
        try {
          const memory = await this.collection.query.fetchObjectById(memoryId, {
            returnProperties: ['relationship_ids', 'doc_type'],
          });
          if (!memory || memory.properties.doc_type !== 'memory') return;
          const current = (memory.properties.relationship_ids as string[]) || [];
          const updated = current.filter((id) => id !== input.relationship_id);
          if (updated.length !== current.length) {
            await this.collection.data.update({
              id: memoryId,
              properties: { relationship_ids: updated, updated_at: new Date().toISOString() },
            });
            memoriesUpdated++;
          }
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
