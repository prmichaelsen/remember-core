// src/app/index.ts
// createAppClient factory — composes profile and ghost resources

import { HttpClient } from '../clients/http.js';
import type { HttpClientConfig } from '../clients/http.js';
import { assertServerSide } from '../clients/guard.js';
import { createProfilesResource } from './profiles.js';
import { createGhostResource } from './ghost.js';
import { createMemoriesResource } from './memories.js';
import { createRelationshipsResource } from './relationships.js';
import { createCommentsResource } from './comments.js';
import type { ProfilesResource } from './profiles.js';
import type { GhostResource } from './ghost.js';
import type { MemoriesResource } from './memories.js';
import type { RelationshipsResource } from './relationships.js';
import type { CommentsResource } from './comments.js';

export interface AppClient {
  profiles: ProfilesResource;
  ghost: GhostResource;
  memories: MemoriesResource;
  relationships: RelationshipsResource;
  comments: CommentsResource;
}

/**
 * Create a typed app client for use-case-oriented compound operations.
 * Server-side only — throws in browser environments.
 */
export function createAppClient(config: HttpClientConfig): AppClient {
  assertServerSide();

  const http = new HttpClient(config);

  return {
    profiles: createProfilesResource(http),
    ghost: createGhostResource(http),
    memories: createMemoriesResource(http),
    relationships: createRelationshipsResource(http),
    comments: createCommentsResource(http),
  };
}

// Re-export types
export type { HttpClientConfig } from '../clients/http.js';
export type { SdkResponse, RememberError } from '../clients/response.js';
export type { ProfilesResource } from './profiles.js';
export type { GhostResource } from './ghost.js';
export type { MemoriesResource, MemoryWithRelationships, RelationshipWithPreviews, MemoryPreview } from './memories.js';
export type {
  RelationshipsResource,
  RelationshipMemoriesResponse,
  RelationshipMetadata,
  OrderedContentMemory,
  OrderedContentResponse,
  InsertMemoryAtInput,
  InsertMemoryAtResult,
} from './relationships.js';
export type { CommentsResource, CreateCommentInput, CreateCommentResult } from './comments.js';
