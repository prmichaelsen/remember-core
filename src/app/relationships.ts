// src/app/relationships.ts
// RelationshipsResource — relationship view page compound operations

import type { HttpClient } from '../clients/http.js';
import type { SdkResponse } from '../clients/response.js';

export interface RelationshipMetadata {
  id: string;
  relationship_type: string;
  observation: string;
  strength: number;
  confidence: number;
  source: 'user' | 'rem' | 'rule';
  memory_count: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  version: number;
  member_order?: Record<string, number>;
}

export interface RelationshipMemoriesResponse {
  relationship: RelationshipMetadata;
  memories: unknown[];
  total: number;
  has_more: boolean;
}

/** Full memory object with _position calculated property added. */
export interface OrderedContentMemory extends Record<string, unknown> {
  _position: number;
}

export interface OrderedContentResponse {
  relationship: RelationshipMetadata;
  items: OrderedContentMemory[];
  total: number;
  has_more: boolean;
}

export interface InsertMemoryAtInput {
  relationship_id: string;
  content: string;
  position: number;
  tags?: string[];
  context_summary?: string;
  version: number;
}

export interface InsertMemoryAtResult {
  memory_id: string;
  relationship: RelationshipMetadata;
}

export interface RelationshipsResource {
  getMemories(
    userId: string,
    relationshipId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<SdkResponse<RelationshipMemoriesResponse>>;

  /**
   * Compound: create memory → add to relationship → reorder to position.
   * 3 sequential svc REST calls under the hood.
   */
  insertMemoryAt(
    userId: string,
    input: InsertMemoryAtInput,
  ): Promise<SdkResponse<InsertMemoryAtResult>>;

  /**
   * Get relationship content in position order with pagination.
   */
  getOrderedContent(
    userId: string,
    relationshipId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<SdkResponse<OrderedContentResponse>>;
}

export function createRelationshipsResource(http: HttpClient): RelationshipsResource {
  return {
    getMemories(userId, relationshipId, options) {
      const params: Record<string, string> = {};
      if (options?.limit != null) params.limit = String(options.limit);
      if (options?.offset != null) params.offset = String(options.offset);

      return http.request('GET', `/api/app/v1/relationships/${relationshipId}/memories`, {
        userId,
        params,
      });
    },

    async insertMemoryAt(userId, input) {
      // Step 1: Create the memory
      const createResult = await http.request<{ memory_id: string }>('POST', '/api/svc/v1/memories', {
        userId,
        body: {
          content: input.content,
          tags: input.tags || [],
          context_summary: input.context_summary,
        },
      });

      if (createResult.error) {
        return createResult as unknown as SdkResponse<InsertMemoryAtResult>;
      }

      const memoryId = createResult.data!.memory_id;

      // Step 2: Add memory to relationship
      const addResult = await http.request<{ relationship_id: string; version: number }>(
        'PATCH',
        `/api/svc/v1/relationships/${input.relationship_id}`,
        {
          userId,
          body: { add_memory_ids: [memoryId] },
        },
      );

      if (addResult.error) {
        // Return error but include memory_id so caller knows it exists
        return {
          data: null,
          error: {
            ...addResult.error,
            context: { ...(addResult.error as any).context, memory_id: memoryId },
          },
          throwOnError() { throw addResult.error; },
        } as unknown as SdkResponse<InsertMemoryAtResult>;
      }

      // Step 3: Reorder to requested position
      const newVersion = addResult.data!.version;
      const reorderResult = await http.request<{
        relationship_id: string;
        member_order: Record<string, number>;
        version: number;
        updated_at: string;
      }>('POST', `/api/svc/v1/relationships/${input.relationship_id}/reorder`, {
        userId,
        body: {
          operation: { type: 'move_to_index', memory_id: memoryId, index: input.position },
          version: newVersion,
        },
      });

      if (reorderResult.error) {
        return {
          data: null,
          error: {
            ...reorderResult.error,
            context: { ...(reorderResult.error as any).context, memory_id: memoryId },
          },
          throwOnError() { throw reorderResult.error; },
        } as unknown as SdkResponse<InsertMemoryAtResult>;
      }

      // Fetch final relationship state for metadata
      const getResult = await http.request<RelationshipMetadata>(
        'GET',
        `/api/app/v1/relationships/${input.relationship_id}/ordered-content`,
        { userId, params: { limit: '0' } },
      );

      const relationship: RelationshipMetadata = getResult.data
        ? (getResult.data as any).relationship ?? ({} as RelationshipMetadata)
        : {} as RelationshipMetadata;

      return {
        data: { memory_id: memoryId, relationship },
        error: null,
        throwOnError() { return this; },
      } as unknown as SdkResponse<InsertMemoryAtResult>;
    },

    getOrderedContent(userId, relationshipId, options) {
      const params: Record<string, string> = {};
      if (options?.limit != null) params.limit = String(options.limit);
      if (options?.offset != null) params.offset = String(options.offset);

      return http.request('GET', `/api/app/v1/relationships/${relationshipId}/ordered-content`, {
        userId,
        params,
      });
    },
  };
}
