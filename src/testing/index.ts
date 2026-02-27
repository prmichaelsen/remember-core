// src/testing/index.ts
// Barrel re-export for all test utilities.
// Import from here in test files:
//
//   import { adminUser, makeTestService, makeTestApp } from '../../src/testing';
//
// NOTE: This module is intended for use in test files only.
//       Do not import it in production code.

// Fixtures
export {
  adminUser,
  memberUser,
  viewerUser,
  allUsers,
  newAdminInput,
  newMemberInput,
  invalidEmailInput,
  invalidNameInput,
  conflictingAdminInput,
} from './fixtures.js';

// Helpers
export {
  mockLogger,
  makeTestService,
  makeTestApp,
  makeTestProgram,
  createCliCapture,
} from './helpers.js';

// Re-export MockUserRepository for consumers who need it directly
export { MockUserRepository } from '../../examples/test/user.repository.mock.js';

// Types
export type {
  TestServiceResult,
  TestAppResult,
  TestProgramResult,
  CliCapture,
} from './helpers.js';
