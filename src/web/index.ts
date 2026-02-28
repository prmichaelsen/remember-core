// src/web/index.ts
// @prmichaelsen/remember-core/web — barrel export
// Server-side only: assertServerSide() runs at import time.

import { assertServerSide } from './guard.js';
assertServerSide();

// ─── Foundation ───────────────────────────────────────────────────────

export type { Result } from './result.js';
export { ok, err, isOk, mapOk, tryCatch } from './result.js';

export type { WebSDKError, ErrorKind } from './errors.js';
export { createError, notFound, validation, unauthorized, forbidden, conflict, internal } from './errors.js';

export { assertServerSide } from './guard.js';

// ─── Context ──────────────────────────────────────────────────────────

export type { WebSDKContext, CreateWebSDKContextOptions } from './context.js';
export { createWebSDKContext } from './context.js';

// ─── Shared Types ─────────────────────────────────────────────────────

export type {
  PaginatedResult,
  MemorySearchResult,
  SimilarMemory,
  RelevantMemory,
  RelationshipSearchResult,
  SpaceSearchResult,
  ProfileSearchResult,
  RedactedMemory,
} from './types.js';
export { paginated } from './types.js';

// ─── Use Cases: Memories ──────────────────────────────────────────────

export {
  createMemory,
  searchMemories,
  findSimilarMemories,
  queryMemories,
  updateMemory,
  deleteMemory,
} from './memories.js';

// ─── Use Cases: Relationships ─────────────────────────────────────────

export {
  createRelationship,
  searchRelationships,
  updateRelationship,
  deleteRelationship,
} from './relationships.js';

// ─── Use Cases: Spaces ────────────────────────────────────────────────

export {
  publishToSpace,
  retractFromSpace,
  reviseInSpace,
  moderateSpace,
  searchSpace,
  querySpace,
} from './spaces.js';

// ─── Use Cases: Ghost/Trust ───────────────────────────────────────────

export {
  getGhostConfig,
  updateGhostConfig,
  setUserTrust,
  removeUserTrust,
  blockUser,
  unblockUser,
  checkAccess,
  searchAsGhost,
} from './ghost.js';

// ─── Use Cases: Profiles ──────────────────────────────────────────────

export {
  createAndPublishProfile,
  searchProfiles,
  retractProfile,
  updateAndRepublishProfile,
} from './profiles.js';

// ─── Use Cases: Preferences ──────────────────────────────────────────

export {
  getPreferences,
  updatePreferences,
} from './preferences.js';
