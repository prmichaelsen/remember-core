// src/clients/svc/v1/memories.ts
// MemoriesResource — 1:1 mirror of /api/svc/v1/memories routes

import type { HttpClient } from '../../http.js';
import type { SdkResponse } from '../../response.js';

export interface MemoriesResource {
  create(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  update(userId: string, id: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  delete(userId: string, id: string, input?: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  search(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  similar(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  query(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
}

export function createMemoriesResource(http: HttpClient): MemoriesResource {
  return {
    create(userId, input) {
      return http.request('POST', '/api/svc/v1/memories', { userId, body: input });
    },
    update(userId, id, input) {
      return http.request('PATCH', `/api/svc/v1/memories/${id}`, { userId, body: input });
    },
    delete(userId, id, input) {
      return http.request('DELETE', `/api/svc/v1/memories/${id}`, { userId, ...(input ? { body: input } : {}) });
    },
    search(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/search', { userId, body: input });
    },
    similar(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/similar', { userId, body: input });
    },
    query(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/query', { userId, body: input });
    },
  };
}
