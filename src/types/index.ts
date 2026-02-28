// src/types/index.ts

// Result type
export type { Result, Ok, Err } from './result.types.js';
export {
  ok,
  err,
  isOk,
  isErr,
  mapOk,
  mapErr,
  andThen,
  getOrElse,
  tryCatch,
  tryCatchAsync,
} from './result.types.js';

// Generic utilities
export type {
  DeepPartial,
  Nullable,
  Optional,
  Maybe,
  Awaited,
  AsyncReturnType,
  RequireFields,
  OptionalFields,
  Values,
  Constructor,
  Immutable,
} from './utils.types.js';

// Shared domain types
export type {
  UserId,
  EmailAddress,
  Timestamp,
  User,
  CreateUserInput,
  ListUsersInput,
  UserDTO,
  PaginatedResult,
} from './shared.types.js';

export {
  toUserId,
  toEmailAddress,
  toTimestamp,
  toUserDTO,
  createPaginatedResult,
} from './shared.types.js';

// Context & location types (ported from remember-mcp)
export type {
  GPSCoordinates,
  Address,
  Location,
  Participant,
  Source,
  Environment,
  MemoryContext,
} from './context.types.js';

// Core memory types (ported from remember-mcp)
export type {
  ContentType,
  Memory,
  Relationship,
  MemoryDocument,
  MemoryUpdate,
  RelationshipUpdate,
} from './memory.types.js';

// Search types (ported from remember-mcp)
export type {
  SearchFilters,
  DeletedFilter,
  SearchOptions,
  SearchResult,
  GhostSearchContext,
} from './search.types.js';

// Auth types (ported from remember-mcp)
export type {
  GroupPermissions,
  GroupMembership,
  UserCredentials,
  GhostModeContext,
  AuthContext,
  WriteMode,
  CredentialsProvider,
} from './auth.types.js';

// Ghost config types (ported from remember-mcp v3.11.0+)
export type {
  TrustEnforcementMode,
  GhostConfig,
} from './ghost-config.types.js';

export {
  DEFAULT_GHOST_CONFIG,
} from './ghost-config.types.js';

// Access result types (ported from remember-mcp v3.11.0+)
export type {
  AccessGranted,
  AccessInsufficientTrust,
  AccessBlocked,
  AccessNoPermission,
  AccessNotFound,
  AccessDeleted,
  AccessResult,
  AccessResultStatus,
} from './access-result.types.js';

// Preference types (ported from remember-mcp)
export type {
  TemplatePreferences,
  SearchPreferences,
  LocationPreferences,
  PrivacyPreferences,
  NotificationPreferences,
  DisplayPreferences,
  UserPreferences,
  PreferenceCategory,
} from './preferences.types.js';

export {
  DEFAULT_PREFERENCES,
  PREFERENCE_CATEGORIES,
  PREFERENCE_DESCRIPTIONS,
  getPreferenceDescription,
  getPreferencesSchema,
} from './preferences.types.js';

// Space types (ported from remember-mcp)
export type {
  SpaceMemory,
  SpaceSearchOptions,
  SpaceSearchResult,
  SpaceId,
} from './space.types.js';

export {
  SPACE_DISPLAY_NAMES,
  SUPPORTED_SPACES,
} from './space.types.js';
