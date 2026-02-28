// src/clients/svc/v1/health.ts
// HealthResource — 1:1 mirror of /health and /version routes

import type { HttpClient } from '../../http.js';
import type { SdkResponse } from '../../response.js';

export interface HealthResource {
  check(): Promise<SdkResponse<unknown>>;
  version(): Promise<SdkResponse<unknown>>;
}

export function createHealthResource(http: HttpClient): HealthResource {
  return {
    check() {
      return http.request('GET', '/health');
    },
    version() {
      return http.request('GET', '/version');
    },
  };
}
