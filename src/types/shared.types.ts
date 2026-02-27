// src/types/shared.types.ts
// Pattern: Shared Types (core-sdk.types-shared.md)

// ─── Branded Primitives ────────────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

/**
 * A user's unique identifier.
 * Prevents mixing raw strings with user IDs at compile time.
 */
export type UserId = Brand<string, 'UserId'>;

/**
 * An email address (validated format).
 */
export type EmailAddress = Brand<string, 'EmailAddress'>;

/**
 * An ISO 8601 timestamp string.
 */
export type Timestamp = Brand<string, 'Timestamp'>;

/**
 * Cast a raw string to UserId.
 * Validates the string is non-empty; throws otherwise.
 */
export function toUserId(value: string): UserId {
  if (!value || value.trim().length === 0) {
    throw new Error('UserId must be a non-empty string');
  }
  return value as UserId;
}

/**
 * Cast a raw string to EmailAddress.
 * Validates basic email format; throws otherwise.
 */
export function toEmailAddress(value: string): EmailAddress {
  if (!value.includes('@')) {
    throw new Error(`Invalid email address: ${value}`);
  }
  return value as EmailAddress;
}

/**
 * Cast a raw string to Timestamp.
 * Validates it is a parseable date; throws otherwise.
 */
export function toTimestamp(value: string): Timestamp {
  if (isNaN(Date.parse(value))) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return value as Timestamp;
}

// ─── Domain Entity ─────────────────────────────────────────────────────────

/**
 * Internal User entity (as stored in the database).
 * Never expose this directly in API responses — use UserDTO instead.
 */
export interface User {
  id: UserId;
  email: EmailAddress;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Input Types ───────────────────────────────────────────────────────────

/**
 * Input for creating a new user.
 */
export interface CreateUserInput {
  email: string;
  name: string;
  role?: 'admin' | 'member' | 'viewer';
}

/**
 * Input for listing users with optional filtering.
 */
export interface ListUsersInput {
  role?: 'admin' | 'member' | 'viewer';
  cursor?: string;
  limit?: number;
}

// ─── DTO (API Response Shape) ──────────────────────────────────────────────

/**
 * User data as returned in API responses.
 * Omits sensitive fields; adds computed display fields.
 */
export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

/**
 * Transform an internal User entity to a UserDTO for API responses.
 * Co-located with the type so the transformation is always in sync.
 */
export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
}

// ─── Pagination ────────────────────────────────────────────────────────────

/**
 * A paginated list of items with cursor-based navigation.
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Create a PaginatedResult from a list of items.
 */
export function createPaginatedResult<T>(
  items: T[],
  total: number,
  cursor: string | null
): PaginatedResult<T> {
  return {
    items,
    total,
    cursor,
    hasMore: cursor !== null,
  };
}
