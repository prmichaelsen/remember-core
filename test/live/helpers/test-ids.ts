// Fixed test user IDs so E2E runs reuse the same Weaviate collections
// instead of creating new orphaned collections on every run.
// Individual test suites clean up their own memories in afterAll hooks.

export const TEST_USER_ID = 'live_test_ci';

// Second user for operations that can't be self-applied (e.g. rating own memory)
export const TEST_USER_ID_2 = 'live_test_ci_b';
