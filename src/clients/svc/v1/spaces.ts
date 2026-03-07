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
  byDiscovery(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  byRecommendation(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  byTime(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  byRating(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  byProperty(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  byBroad(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  byRandom(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  byCurated(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
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
    byDiscovery(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/by-discovery', { userId, body: input });
    },
    byRecommendation(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/by-recommendation', { userId, body: input });
    },
    byTime(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/by-time', { userId, body: input });
    },
    byRating(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/by-rating', { userId, body: input });
    },
    byProperty(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/by-property', { userId, body: input });
    },
    byBroad(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/by-broad', { userId, body: input });
    },
    byRandom(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/by-random', { userId, body: input });
    },
    byCurated(userId, input) {
      return http.request('POST', '/api/svc/v1/spaces/by-curated', { userId, body: input });
    },
  };
}
