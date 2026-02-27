# Task 14: Integration Tests

**Milestone**: [M4 - Integration & Packaging](../../milestones/milestone-4-integration-and-packaging.md)
**Estimated Time**: 4-5 hours
**Dependencies**: Task 11, Task 12
**Status**: Not Started

---

## Objective
Write end-to-end integration tests validating the full service stack (types -> config -> database -> services) to ensure all layers work together correctly against real infrastructure.

---

## Context
Unit tests from Task 11 use mocks to isolate individual components. Integration tests validate real flows against actual Weaviate and Firestore instances, covering the complete lifecycle of core domain objects: memories, preferences, confirmation tokens, and space publishing. These tests ensure that the extracted business logic in remember-core functions correctly when all layers are connected.

---

## Steps

### 1. Create jest.e2e.config.js
Configure a separate Jest configuration for integration tests:
- Set `testMatch` to `tests/e2e/**/*.e2e.ts`
- Configure longer timeouts (database operations take time)
- Set up environment variables for test infrastructure
- Use ts-jest transform

### 2. Create tests/e2e/ Directory Structure
Set up the directory with:
- `setup.ts` — global setup (initialize database connections, seed data if needed)
- `teardown.ts` — global teardown (clean up test data, close connections)
- `helpers.ts` — shared test utilities (create test user context, generate unique IDs)

### 3. Write Memory Lifecycle Test
`tests/e2e/memory.e2e.ts` — validate the full memory lifecycle:
- Create a memory with metadata
- Search for the memory by content similarity
- Update the memory content
- Verify the update persists
- Delete the memory
- Verify deletion

### 4. Write Preferences Lifecycle Test
`tests/e2e/preferences.e2e.ts` — validate preferences operations:
- Create a user preference
- Retrieve preferences by user
- Update a preference value
- Delete a preference
- Verify all CRUD operations against the database

### 5. Write Confirmation Token Lifecycle Test
`tests/e2e/tokens.e2e.ts` — validate confirmation token flow:
- Generate a confirmation token for an operation
- Retrieve the token by ID
- Validate the token
- Consume/redeem the token
- Verify consumed token cannot be reused

### 6. Write Space Publish Flow Test
`tests/e2e/spaces.e2e.ts` — validate the space publishing workflow:
- Create a space with memories
- Publish the space
- Verify published space is accessible
- Unpublish the space
- Verify unpublished space is no longer accessible

### 7. Add npm run test:e2e Script
Add the script to package.json:
```json
{
  "scripts": {
    "test:e2e": "jest --config jest.e2e.config.js --runInBand"
  }
}
```
Use `--runInBand` to run tests serially (avoids database contention).

### 8. Document How to Run Integration Tests
Create a section in the README or a separate TESTING.md explaining:
- Required infrastructure (Weaviate instance, Firestore emulator or project)
- Environment variables needed
- How to start test infrastructure
- Consider providing a `docker-compose.yml` for local test infrastructure

---

## Verification
- [ ] All integration tests pass against test infrastructure
- [ ] Tests cover happy paths for all four domain areas (memories, preferences, tokens, spaces)
- [ ] Tests are independent and can run in any order
- [ ] Setup and teardown properly clean up test data (no pollution between runs)
- [ ] `npm run test:e2e` script is documented and works
- [ ] Tests handle infrastructure unavailability gracefully (skip with message, not crash)

---

## Expected Output

**Key Files Created**:
- `jest.e2e.config.js`: Jest configuration for integration tests
- `tests/e2e/memory.e2e.ts`: Memory lifecycle integration test
- `tests/e2e/preferences.e2e.ts`: Preferences lifecycle integration test
- `tests/e2e/tokens.e2e.ts`: Confirmation token lifecycle integration test
- `tests/e2e/spaces.e2e.ts`: Space publish flow integration test

---

## Notes
- Integration tests should use unique identifiers (e.g., UUIDs or timestamps) to avoid collisions if run concurrently
- Consider adding a CI pipeline step that spins up test infrastructure before running integration tests
- Tests should be idempotent — running them multiple times should produce the same results
- If docker-compose.yml is added, include Weaviate and Firestore emulator services
- Integration tests will naturally take longer than unit tests; set appropriate Jest timeouts (30s+)

---

**Next Task**: [Task 15: Migration Guide and Consumer Documentation](task-15-migration-guide.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
