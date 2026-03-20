// src/clients/svc/v1/confirmations.ts
// ConfirmationsResource — 1:1 mirror of /api/svc/v1/confirmations routes

import type { HttpClient } from '../../http.js';
import type { SdkResponse } from '../../response.js';

export interface ConfirmationsResource {
  confirm(userId: string, token: string, options?: { secret_token?: string }): Promise<SdkResponse<unknown>>;
  deny(userId: string, token: string, options?: { secret_token?: string }): Promise<SdkResponse<unknown>>;
}

export function createConfirmationsResource(http: HttpClient): ConfirmationsResource {
  return {
    confirm(userId, token, options) {
      return http.request('POST', `/api/svc/v1/confirmations/${token}/confirm`, {
        userId,
        ...(options?.secret_token ? { body: { secret_token: options.secret_token } } : {}),
      });
    },
    deny(userId, token, options) {
      return http.request('POST', `/api/svc/v1/confirmations/${token}/deny`, {
        userId,
        ...(options?.secret_token ? { body: { secret_token: options.secret_token } } : {}),
      });
    },
  };
}
