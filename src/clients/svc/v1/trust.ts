// src/clients/svc/v1/trust.ts
// TrustResource — 1:1 mirror of /api/svc/v1/trust routes

import type { HttpClient } from '../../http.js';
import type { SdkResponse } from '../../response.js';

export interface TrustResource {
  getGhostConfig(userId: string): Promise<SdkResponse<unknown>>;
  updateGhostConfig(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  setUserTrust(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  removeUserTrust(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  blockUser(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  unblockUser(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  checkAccess(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
}

export function createTrustResource(http: HttpClient): TrustResource {
  return {
    getGhostConfig(userId) {
      return http.request('GET', '/api/svc/v1/trust/ghost-config', { userId });
    },
    updateGhostConfig(userId, input) {
      return http.request('PATCH', '/api/svc/v1/trust/ghost-config', { userId, body: input });
    },
    setUserTrust(userId, input) {
      return http.request('POST', '/api/svc/v1/trust/set-user-trust', { userId, body: input });
    },
    removeUserTrust(userId, input) {
      return http.request('POST', '/api/svc/v1/trust/remove-user-trust', { userId, body: input });
    },
    blockUser(userId, input) {
      return http.request('POST', '/api/svc/v1/trust/block-user', { userId, body: input });
    },
    unblockUser(userId, input) {
      return http.request('POST', '/api/svc/v1/trust/unblock-user', { userId, body: input });
    },
    checkAccess(userId, input) {
      return http.request('POST', '/api/svc/v1/trust/check-access', { userId, body: input });
    },
  };
}
