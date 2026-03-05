// src/app/memories.ts
// MemoriesResource — memory view page compound operations

import type { HttpClient } from '../clients/http.js';
import type { SdkResponse } from '../clients/response.js';

export interface MemoryPreview {
  memory_id: string;
  title: string;
  author_id: string;
  space_ids: string[];
  group_ids: string[];
}

export interface RelationshipWithPreviews {
  id: string;
  relationship_type: string;
  observation: string;
  strength: number;
  confidence: number;
  source: 'user' | 'rem' | 'rule';
  memory_count: number;
  memory_previews: MemoryPreview[];
}

export interface MemoryWithRelationships {
  memory: unknown;
  relationships?: RelationshipWithPreviews[];
  similar_memories?: unknown[];
}

export interface MemoriesResource {
  get(
    userId: string,
    memoryId: string,
    options?: {
      includeRelationships?: boolean;
      relationshipMemoryLimit?: number;
      includeSimilar?: boolean;
      similarLimit?: number;
    },
  ): Promise<SdkResponse<MemoryWithRelationships>>;
}

export function createMemoriesResource(http: HttpClient): MemoriesResource {
  return {
    get(userId, memoryId, options) {
      const params: Record<string, string> = {};
      if (options?.includeRelationships) params.includeRelationships = 'true';
      if (options?.relationshipMemoryLimit != null) {
        params.relationshipMemoryLimit = String(options.relationshipMemoryLimit);
      }
      if (options?.includeSimilar) params.includeSimilar = 'true';
      if (options?.similarLimit != null) params.similarLimit = String(options.similarLimit);

      return http.request('GET', `/api/app/v1/memories/${memoryId}`, {
        userId,
        params,
      });
    },
  };
}
