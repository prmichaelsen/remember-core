// src/app/comments.ts
// CommentsResource — compound comment operations

import type { HttpClient } from '../clients/http.js';
import type { SdkResponse } from '../clients/response.js';

export interface CreateCommentInput {
  content: string;
  parent_id: string;
  thread_root_id?: string;
  spaces?: string[];
  groups?: string[];
  tags?: string[];
}

export interface CreateCommentResult {
  memory_id: string;
  created_at: string;
  composite_id?: string;
  published_to: string[];
}

export interface CommentsResource {
  createAndPublish(userId: string, input: CreateCommentInput): Promise<SdkResponse<CreateCommentResult>>;
}

export function createCommentsResource(http: HttpClient): CommentsResource {
  return {
    createAndPublish(userId, input) {
      return http.request('POST', '/api/app/v1/spaces/comments', { userId, body: input });
    },
  };
}
