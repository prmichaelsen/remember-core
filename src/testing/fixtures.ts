// src/testing/fixtures.ts
// Pattern: Test Fixtures (core-sdk.testing-fixtures.md)
//
// Pre-built User fixtures with stable IDs and deterministic field values.
// Import these in tests instead of creating ad-hoc objects to ensure
// assertions are reproducible and readable.
//
// All IDs, emails, and timestamps are static strings — never random.
// This means fixture snapshots will always match.

import type { User } from '../types/shared.types.js';
import { toUserId, toEmailAddress, toTimestamp } from '../types/shared.types.js';

// ─── Stable User Fixtures ──────────────────────────────────────────────────

/**
 * Admin user fixture.
 * Use when you need an existing user with admin role.
 */
export const adminUser: User = {
  id:        toUserId('usr_admin_001'),
  email:     toEmailAddress('admin@example.com'),
  name:      'Admin User',
  role:      'admin',
  createdAt: toTimestamp('2024-01-01T00:00:00.000Z'),
  updatedAt: toTimestamp('2024-01-01T00:00:00.000Z'),
};

/**
 * Member user fixture.
 * Use when you need an existing user with the default (member) role.
 */
export const memberUser: User = {
  id:        toUserId('usr_member_001'),
  email:     toEmailAddress('member@example.com'),
  name:      'Member User',
  role:      'member',
  createdAt: toTimestamp('2024-01-02T00:00:00.000Z'),
  updatedAt: toTimestamp('2024-01-02T00:00:00.000Z'),
};

/**
 * Viewer user fixture.
 * Use when you need an existing user with viewer role.
 */
export const viewerUser: User = {
  id:        toUserId('usr_viewer_001'),
  email:     toEmailAddress('viewer@example.com'),
  name:      'Viewer User',
  role:      'viewer',
  createdAt: toTimestamp('2024-01-03T00:00:00.000Z'),
  updatedAt: toTimestamp('2024-01-03T00:00:00.000Z'),
};

/**
 * All fixtures as an array.
 * Use with repo.seed() in a loop:
 *
 * @example
 * allUsers.forEach(u => repo.seed(u));
 */
export const allUsers: User[] = [adminUser, memberUser, viewerUser];

// ─── Input Fixtures ────────────────────────────────────────────────────────

/**
 * Valid CreateUserInput for a new admin.
 * Use in create-path tests where the user does not already exist.
 */
export const newAdminInput = {
  email: 'new.admin@example.com',
  name:  'New Admin',
  role:  'admin' as const,
};

/**
 * Valid CreateUserInput for a new member.
 */
export const newMemberInput = {
  email: 'new.member@example.com',
  name:  'New Member',
  role:  'member' as const,
};

/**
 * Invalid CreateUserInput — email lacks '@'.
 * Use in validation error tests.
 */
export const invalidEmailInput = {
  email: 'notanemail',
  name:  'Some Name',
};

/**
 * Invalid CreateUserInput — name is too short (< 2 chars after trimming).
 * Use in validation error tests.
 */
export const invalidNameInput = {
  email: 'valid@example.com',
  name:  'X',
};

/**
 * CreateUserInput that will conflict with adminUser (same email).
 * Seed adminUser first, then attempt to create this to trigger ConflictError.
 */
export const conflictingAdminInput = {
  email: adminUser.email,
  name:  'Duplicate Admin',
};
