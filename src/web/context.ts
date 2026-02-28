// src/web/context.ts
// WebSDKContext — dependency bundle for all web SDK use-case functions

import type { Logger } from '../utils/logger.js';
import type { MemoryService } from '../services/memory.service.js';
import type { SpaceService } from '../services/space.service.js';
import type { RelationshipService } from '../services/relationship.service.js';
import type { PreferencesDatabaseService } from '../services/preferences.service.js';
import type { ConfirmationTokenService } from '../services/confirmation-token.service.js';
import type { GhostConfigProvider, EscalationStore } from '../services/access-control.service.js';
import { assertServerSide } from './guard.js';

/**
 * Initialized context passed to all web SDK use-case functions.
 * Bundles the authenticated user, initialized services, and infrastructure dependencies.
 */
export interface WebSDKContext {
  /** Authenticated user ID */
  readonly userId: string;
  /** Initialized MemoryService for the user's collection */
  readonly memoryService: MemoryService;
  /** Initialized SpaceService */
  readonly spaceService: SpaceService;
  /** ConfirmationTokenService for space auto-confirmation */
  readonly confirmationTokenService: ConfirmationTokenService;
  /** Ghost config provider (Firestore-backed or stub) */
  readonly ghostConfigProvider: GhostConfigProvider;
  /** Escalation store (Firestore-backed or in-memory) */
  readonly escalationStore: EscalationStore;
  /** Optional RelationshipService (not all use cases need it) */
  readonly relationshipService?: RelationshipService;
  /** Optional PreferencesDatabaseService */
  readonly preferencesService?: PreferencesDatabaseService;
  /** Optional logger */
  readonly logger?: Logger;
}

/**
 * Options for creating a WebSDKContext from raw infrastructure dependencies.
 */
export interface CreateWebSDKContextOptions {
  /** Authenticated user ID */
  userId: string;
  /** Initialized MemoryService */
  memoryService: MemoryService;
  /** Initialized SpaceService */
  spaceService: SpaceService;
  /** ConfirmationTokenService */
  confirmationTokenService: ConfirmationTokenService;
  /** Ghost config provider */
  ghostConfigProvider: GhostConfigProvider;
  /** Escalation store */
  escalationStore: EscalationStore;
  /** Optional RelationshipService */
  relationshipService?: RelationshipService;
  /** Optional PreferencesDatabaseService */
  preferencesService?: PreferencesDatabaseService;
  /** Optional logger */
  logger?: Logger;
}

/**
 * Create a WebSDKContext from initialized service dependencies.
 * Calls assertServerSide() to prevent browser usage.
 */
export function createWebSDKContext(options: CreateWebSDKContextOptions): WebSDKContext {
  assertServerSide();

  return {
    userId: options.userId,
    memoryService: options.memoryService,
    spaceService: options.spaceService,
    confirmationTokenService: options.confirmationTokenService,
    ghostConfigProvider: options.ghostConfigProvider,
    escalationStore: options.escalationStore,
    relationshipService: options.relationshipService,
    preferencesService: options.preferencesService,
    logger: options.logger,
  };
}
