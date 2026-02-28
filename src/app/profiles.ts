// src/app/profiles.ts
// ProfilesResource — use-case-oriented compound profile operations

import type { HttpClient } from '../clients/http.js';
import type { SdkResponse } from '../clients/response.js';

export interface ProfilesResource {
  createAndPublish(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  search(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  retract(userId: string, memoryId: string): Promise<SdkResponse<unknown>>;
  updateAndRepublish(userId: string, memoryId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
}

export function createProfilesResource(http: HttpClient): ProfilesResource {
  return {
    createAndPublish(userId, input) {
      return http.request('POST', '/api/app/v1/profiles', { userId, body: input });
    },
    search(userId, input) {
      return http.request('POST', '/api/app/v1/profiles/search', { userId, body: input });
    },
    retract(userId, memoryId) {
      return http.request('DELETE', `/api/app/v1/profiles/${memoryId}`, { userId });
    },
    updateAndRepublish(userId, memoryId, input) {
      return http.request('PATCH', `/api/app/v1/profiles/${memoryId}`, { userId, body: input });
    },
  };
}
