// src/clients/svc/v1/relationships.ts
// RelationshipsResource — 1:1 mirror of /api/svc/v1/relationships routes

import type { HttpClient } from '../../http.js';
import type { SdkResponse } from '../../response.js';

export interface RelationshipsResource {
  create(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  update(userId: string, id: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  delete(userId: string, id: string): Promise<SdkResponse<unknown>>;
  search(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
}

export function createRelationshipsResource(http: HttpClient): RelationshipsResource {
  return {
    create(userId, input) {
      return http.request('POST', '/api/svc/v1/relationships', { userId, body: input });
    },
    update(userId, id, input) {
      return http.request('PATCH', `/api/svc/v1/relationships/${id}`, { userId, body: input });
    },
    delete(userId, id) {
      return http.request('DELETE', `/api/svc/v1/relationships/${id}`, { userId });
    },
    search(userId, input) {
      return http.request('POST', '/api/svc/v1/relationships/search', { userId, body: input });
    },
  };
}
