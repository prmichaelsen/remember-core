// src/types/index.ts

// Result type
export type { Result, Ok, Err } from './result.types';
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
} from './result.types';

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
} from './utils.types';

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
} from './shared.types';

export {
  toUserId,
  toEmailAddress,
  toTimestamp,
  toUserDTO,
  createPaginatedResult,
} from './shared.types';

// Context & location types (ported from remember-mcp)
export type {
  GPSCoordinates,
  Address,
  Location,
  Participant,
  Source,
  Environment,
  MemoryContext,
} from './context.types';

// Core memory types (ported from remember-mcp)
export type {
  ContentType,
  Memory,
  Relationship,
  MemoryDocument,
  MemoryUpdate,
  RelationshipUpdate,
} from './memory.types';

// Search types (ported from remember-mcp)
export type {
  SearchFilters,
  DeletedFilter,
  SearchOptions,
  SearchResult,
} from './search.types';

// Auth types (ported from remember-mcp)
export type {
  GroupPermissions,
  GroupMembership,
  UserCredentials,
  AuthContext,
  WriteMode,
  CredentialsProvider,
} from './auth.types';

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
} from './preferences.types';

export {
  DEFAULT_PREFERENCES,
  PREFERENCE_CATEGORIES,
  PREFERENCE_DESCRIPTIONS,
  getPreferenceDescription,
  getPreferencesSchema,
} from './preferences.types';

// Space types (ported from remember-mcp)
export type {
  SpaceMemory,
  SpaceSearchOptions,
  SpaceSearchResult,
  SpaceId,
} from './space.types';

export {
  SPACE_DISPLAY_NAMES,
  SUPPORTED_SPACES,
} from './space.types';
