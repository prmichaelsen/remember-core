// src/clients/svc/v1/spaces.ts
// SpacesResource — 1:1 mirror of /api/svc/v1/spaces routes

import type { HttpClient } from '../../http.js';
import type { SdkResponse } from '../../response.js';

export interface SpacesResource {
  publish(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  retract(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  revise(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  moderate(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  search(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  query(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
}

export function createSpacesResource(http: HttpClient): SpacesResource {
  return {
    publish(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/publish', { userId, body: input });
    },
    retract(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/retract', { userId, body: input });
    },
    revise(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/revise', { userId, body: input });
    },
    moderate(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/moderate', { userId, body: input });
    },
    search(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/search', { userId, body: input });
    },
    query(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/query', { userId, body: input });
    },
  };
}
