// src/app/index.ts
// createAppClient factory — composes profile and ghost resources

import { HttpClient } from '../clients/http.js';
import type { HttpClientConfig } from '../clients/http.js';
import { assertServerSide } from '../clients/guard.js';
import { createProfilesResource } from './profiles.js';
import { createGhostResource } from './ghost.js';
import type { ProfilesResource } from './profiles.js';
import type { GhostResource } from './ghost.js';

export interface AppClient {
  profiles: ProfilesResource;
  ghost: GhostResource;
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
  };
}

// Re-export types
export type { HttpClientConfig } from '../clients/http.js';
export type { SdkResponse, RememberError } from '../clients/response.js';
export type { ProfilesResource } from './profiles.js';
export type { GhostResource } from './ghost.js';
