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
}

export interface RelationshipMemoriesResponse {
  relationship: RelationshipMetadata;
  memories: unknown[];
  total: number;
  has_more: boolean;
}

export interface RelationshipsResource {
  getMemories(
    userId: string,
    relationshipId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<SdkResponse<RelationshipMemoriesResponse>>;
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
  };
}
