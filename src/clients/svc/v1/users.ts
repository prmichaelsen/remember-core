// src/clients/svc/v1/users.ts
// UsersResource — 1:1 mirror of /api/svc/v1/users routes

import type { HttpClient } from '../../http.js';
import type { SdkResponse } from '../../response.js';

export interface DeleteUserResponse {
  job_id: string;
  status: 'pending';
}

export interface UsersResource {
  delete(userId: string): Promise<SdkResponse<DeleteUserResponse>>;
}

export function createUsersResource(http: HttpClient): UsersResource {
  return {
    delete(userId) {
      return http.request('DELETE', `/api/svc/v1/users/${userId}`);
    },
  };
}
