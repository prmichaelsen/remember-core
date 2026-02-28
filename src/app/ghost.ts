// src/app/ghost.ts
// GhostResource — compound ghost operations

import type { HttpClient } from '../clients/http.js';
import type { SdkResponse } from '../clients/response.js';

export interface GhostResource {
  searchAsGhost(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
}

export function createGhostResource(http: HttpClient): GhostResource {
  return {
    searchAsGhost(userId, input) {
      return http.request('POST', '/api/app/v1/trust/search-as-ghost', { userId, body: input });
    },
  };
}
