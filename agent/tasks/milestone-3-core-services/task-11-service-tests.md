# Task 11: Service Tests and Validation

**Milestone**: [M3 - Core Services](../../milestones/milestone-3-core-services.md)
**Estimated Time**: 4-6 hours
**Dependencies**: Tasks 8, 9, 10 (all services implemented)
**Status**: Not Started

---

## Objective
Comprehensive unit tests for all core services, plus integration test scaffolding for end-to-end validation.

---

## Context
All services from Tasks 8-10 need thorough testing:
- CollectionUtils (composite-ids, tracking-arrays)
- PreferencesService
- ConfirmationTokenService
- MemoryService (6 operations)
- RelationshipService (4 operations)
- SpaceService (7 operations)

---

## Steps

### 1. Set Up Jest Test Configuration
Extend existing jest.config.js

### 2. Create Test Utilities and Mocks
Create test utilities and mocks in `src/testing/` (already scaffolded)

### 3. Create Weaviate Client Mock
Create mock for Weaviate client interactions

### 4. Create Firestore Mock
Create mock for Firestore database interactions

### 5. Write CollectionUtils Unit Tests
Test composite ID round-trip, tracking array immutability

### 6. Write PreferencesService Tests
Test get defaults, update merge, create

### 7. Write ConfirmationTokenService Tests
Test lifecycle, expiry, invalid tokens

### 8. Write MemoryService Tests
Test CRUD, search, soft delete

### 9. Write RelationshipService Tests
Test CRUD, doc_type discrimination

### 10. Write SpaceService Tests
Test publish flow, retract, revise, confirm/deny

### 11. Create Integration Test Scaffold
Create integration test scaffold (real DB connections, marked as e2e)

### 12. Verify All Tests Pass
Run `npm test` and confirm all tests pass

---

## Verification
- [ ] All unit tests pass
- [ ] Test coverage > 80% on services
- [ ] Mocks properly isolate database calls
- [ ] Integration test scaffold exists (can run with real DBs)
- [ ] `npm test` exits 0

---

## Expected Output

**Key Files Created**:
- `src/testing/weaviate-mock.ts`: Mock for Weaviate client
- `src/testing/firestore-mock.ts`: Mock for Firestore client
- `src/testing/*.test.ts`: Unit test files for all services and collection utilities
- Integration test scaffold marked as e2e

---

## Notes
- All services from Tasks 8-10 need thorough testing
- Test coverage target is > 80% on services
- Integration test scaffold should support real DB connections and be marked as e2e
- Test utilities in `src/testing/` are already scaffolded

---

**Next Task**: [Task 12: NPM Package Setup](../milestone-4-integration-and-packaging/task-12-npm-package-setup.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
