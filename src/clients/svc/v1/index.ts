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
import { createJobsResource } from './jobs.js';
import { createUsersResource } from './users.js';
import { createReportsResource } from './reports.js';
import type { MemoriesResource } from './memories.js';
import type { RelationshipsResource } from './relationships.js';
import type { SpacesResource } from './spaces.js';
import type { ConfirmationsResource } from './confirmations.js';
import type { PreferencesResource } from './preferences.js';
import type { TrustResource } from './trust.js';
import type { HealthResource } from './health.js';
import type { JobsResource } from './jobs.js';
import type { UsersResource } from './users.js';
import type { ReportsResource } from './reports.js';

export interface SvcClient {
  memories: MemoriesResource;
  relationships: RelationshipsResource;
  spaces: SpacesResource;
  confirmations: ConfirmationsResource;
  preferences: PreferencesResource;
  trust: TrustResource;
  health: HealthResource;
  jobs: JobsResource;
  users: UsersResource;
  reports: ReportsResource;
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
    jobs: createJobsResource(http),
    users: createUsersResource(http),
    reports: createReportsResource(http),
  };
}

// Re-export types
export type { HttpClientConfig } from '../../http.js';
export type { SdkResponse, RememberError } from '../../response.js';
export type { MemoriesResource } from './memories.js';
export type { RelationshipsResource, ReorderOperation, ReorderInput, ReorderResult } from './relationships.js';
export type { SpacesResource } from './spaces.js';
export type { ConfirmationsResource } from './confirmations.js';
export type { PreferencesResource } from './preferences.js';
export type { TrustResource } from './trust.js';
export type { HealthResource } from './health.js';
export type { JobsResource, PollOptions } from './jobs.js';
export type { UsersResource, DeleteUserResponse } from './users.js';
export type { ReportsResource, Report, CreateReportInput, ResolveReportInput, ReportsListResult } from './reports.js';
