// src/clients/svc/v1/index.ts
// createSvcClient factory — composes all resource groups

import { HttpClient } from '../../http.js';
import type { HttpClientConfig } from '../../http.js';
import { assertServerSide } from '../../guard.js';
import { createMemoriesResource } from './memories.js';
import { createRelationshipsResource } from './relationships.js';
import { createSpacesResource } from './spaces.js';
import { createConfirmationsResource } from './confirmations.js';
import { createPreferencesResource } from './preferences.js';
import { createTrustResource } from './trust.js';
import { createHealthResource } from './health.js';
import type { MemoriesResource } from './memories.js';
import type { RelationshipsResource } from './relationships.js';
import type { SpacesResource } from './spaces.js';
import type { ConfirmationsResource } from './confirmations.js';
import type { PreferencesResource } from './preferences.js';
import type { TrustResource } from './trust.js';
import type { HealthResource } from './health.js';

export interface SvcClient {
  memories: MemoriesResource;
  relationships: RelationshipsResource;
  spaces: SpacesResource;
  confirmations: ConfirmationsResource;
  preferences: PreferencesResource;
  trust: TrustResource;
  health: HealthResource;
}

/**
 * Create a typed svc client for the remember-rest-service /api/svc/v1/ routes.
 * Server-side only — throws in browser environments.
 */
export function createSvcClient(config: HttpClientConfig): SvcClient {
  assertServerSide();

  const http = new HttpClient(config);

  return {
    memories: createMemoriesResource(http),
    relationships: createRelationshipsResource(http),
    spaces: createSpacesResource(http),
    confirmations: createConfirmationsResource(http),
    preferences: createPreferencesResource(http),
    trust: createTrustResource(http),
    health: createHealthResource(http),
  };
}

// Re-export types
export type { HttpClientConfig } from '../../http.js';
export type { SdkResponse, RememberError } from '../../response.js';
export type { MemoriesResource } from './memories.js';
export type { RelationshipsResource } from './relationships.js';
export type { SpacesResource } from './spaces.js';
export type { ConfirmationsResource } from './confirmations.js';
export type { PreferencesResource } from './preferences.js';
export type { TrustResource } from './trust.js';
export type { HealthResource } from './health.js';
