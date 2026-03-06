# Milestone 24: Live E2E Test Coverage

**Goal**: Expand live e2e test suite to cover all SVC client resources against the deployed e1 REST service
**Duration**: 1 week
**Dependencies**: M23 (GCP Extraction Clients — for live test infrastructure already in place)
**Status**: Not Started

---

## Overview

The live e2e test infrastructure was added in v0.34.0 with 3 initial test suites (health, memories, preferences). This milestone expands coverage to all SVC client resources: relationships, spaces, trust, sort modes, ratings, and import jobs. These tests run against the deployed remember-rest-service-e1 Cloud Run instance and gate npm publish in CI.

---

## Deliverables

### 1. Test Suites
- Relationships CRUD (create, search, delete)
- Spaces (publish, search, retract)
- Trust/Ghost (get config, set trust)
- Sort modes (byTime, byDensity, byRating)
- Ratings (rate, get, retract)
- Import + Jobs (async import, job polling)

### 2. Test Helpers
- Shared cleanup utilities for test isolation
- Test data factories if needed

---

## Success Criteria

- [ ] All SVC client resource groups have at least one live test
- [ ] All live tests pass against e1
- [ ] Tests clean up after themselves (no leftover test data)
- [ ] CI publish workflow passes with expanded test suite

---

## Tasks

1. [Task 128: Relationships Live Tests](../tasks/milestone-24-live-e2e-test-coverage/task-128-relationships-live-tests.md) - CRUD operations for relationships
2. [Task 129: Spaces Live Tests](../tasks/milestone-24-live-e2e-test-coverage/task-129-spaces-live-tests.md) - Publish, search, retract flows
3. [Task 130: Trust Live Tests](../tasks/milestone-24-live-e2e-test-coverage/task-130-trust-live-tests.md) - Ghost config and trust operations
4. [Task 131: Sort Modes and Ratings Live Tests](../tasks/milestone-24-live-e2e-test-coverage/task-131-sort-ratings-live-tests.md) - byTime, byDensity, byRating, rate/retract

---

## Testing Requirements

- [ ] Each suite cleans up test data in afterAll
- [ ] Tests use unique per-run user IDs (already via TEST_USER_ID)
- [ ] Tests tolerate e1 service quirks (new user 500s, empty results)
- [ ] All tests run serially (maxWorkers: 1)

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| E1 service down during CI | High | Low | Health check in globalSetup fails fast with clear error |
| Test data pollution | Medium | Low | Unique RUN_ID per invocation, afterAll cleanup |
| Flaky tests from network latency | Medium | Medium | 30s timeout, tolerate expected server errors |

---

**Next Milestone**: TBD
**Blockers**: None
**Notes**: Tests exercise the SVC client SDK against real infrastructure — doubles as SDK integration testing
