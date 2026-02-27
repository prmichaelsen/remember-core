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
