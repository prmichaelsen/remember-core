// src/clients/svc/v1/preferences.ts
// PreferencesResource — 1:1 mirror of /api/svc/v1/preferences routes

import type { HttpClient } from '../../http.js';
import type { SdkResponse } from '../../response.js';

export interface PreferencesResource {
  get(userId: string): Promise<SdkResponse<unknown>>;
  update(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
}

export function createPreferencesResource(http: HttpClient): PreferencesResource {
  return {
    get(userId) {
      return http.request('GET', '/api/svc/v1/preferences', { userId });
    },
    update(userId, input) {
      return http.request('PATCH', '/api/svc/v1/preferences', { userId, body: input });
    },
  };
}
