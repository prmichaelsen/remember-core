// src/clients/svc/v1/trust.ts
// TrustResource — 1:1 mirror of /api/svc/v1/trust routes

import type { HttpClient } from '../../http.js';
import type { SdkResponse } from '../../response.js';
import type { components } from './types.generated.js';

type GhostConfigResult = components['schemas']['GhostConfigResult'];
type UpdateGhostConfigInput = components['schemas']['UpdateGhostConfigInput'];
type TrustResult = components['schemas']['TrustResult'];

export interface SetUserTrustInput {
  target_user_id: string;
  trust_level: number;
}

export interface TargetUserInput {
  target_user_id: string;
}

export interface CheckAccessInput {
  memory_id: string;
  accessor_user_id: string;
}

export interface CheckAccessResult {
  accessible: boolean;
  trust_tier: 'full_access' | 'partial_access' | 'summary_only' | 'metadata_only' | 'existence_only';
  reason?: string;
}

export interface TrustResource {
  getGhostConfig(userId: string): Promise<SdkResponse<GhostConfigResult>>;
  updateGhostConfig(userId: string, input: UpdateGhostConfigInput): Promise<SdkResponse<GhostConfigResult>>;
  setUserTrust(userId: string, input: SetUserTrustInput): Promise<SdkResponse<TrustResult>>;
  removeUserTrust(userId: string, input: TargetUserInput): Promise<SdkResponse<TrustResult>>;
  blockUser(userId: string, input: TargetUserInput): Promise<SdkResponse<TrustResult>>;
  unblockUser(userId: string, input: TargetUserInput): Promise<SdkResponse<TrustResult>>;
  checkAccess(userId: string, input: CheckAccessInput): Promise<SdkResponse<CheckAccessResult>>;
}

export function createTrustResource(http: HttpClient): TrustResource {
  return {
    getGhostConfig(userId) {
      return http.request<GhostConfigResult>('GET', '/api/svc/v1/trust/ghost-config', { userId });
    },
    updateGhostConfig(userId, input) {
      return http.request<GhostConfigResult>('PATCH', '/api/svc/v1/trust/ghost-config', { userId, body: input });
    },
    setUserTrust(userId, input) {
      return http.request<TrustResult>('POST', '/api/svc/v1/trust/set-user-trust', { userId, body: input });
    },
    removeUserTrust(userId, input) {
      return http.request<TrustResult>('POST', '/api/svc/v1/trust/remove-user-trust', { userId, body: input });
    },
    blockUser(userId, input) {
      return http.request<TrustResult>('POST', '/api/svc/v1/trust/block-user', { userId, body: input });
    },
    unblockUser(userId, input) {
      return http.request<TrustResult>('POST', '/api/svc/v1/trust/unblock-user', { userId, body: input });
    },
    checkAccess(userId, input) {
      return http.request<CheckAccessResult>('POST', '/api/svc/v1/trust/check-access', { userId, body: input });
    },
  };
}
