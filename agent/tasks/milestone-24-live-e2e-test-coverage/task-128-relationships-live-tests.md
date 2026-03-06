# Task 128: Relationships Live Tests

**Milestone**: [M24 - Live E2E Test Coverage](../../milestones/milestone-24-live-e2e-test-coverage.md)
**Estimated Time**: 1 hour
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add `04-relationships.live.ts` test suite covering RelationshipService operations via the SVC client against the deployed e1 REST service.

---

## Context

The SVC client `relationships` resource has 4 methods: `create`, `search`, `update`, `delete`. These need live tests to verify the SDK correctly interacts with the real REST API and Weaviate backend.

---

## Steps

### 1. Create test/live/suites/04-relationships.live.ts

Test cases:
- Create two memories, then create a relationship between them
- Search relationships for the test user
- Delete the relationship
- Clean up memories in afterAll

### 2. Run and verify

```bash
npm run test:live
```

---

## Verification

- [ ] 04-relationships.live.ts exists with 3+ test cases
- [ ] All tests pass against e1
- [ ] Test data cleaned up in afterAll
- [ ] No regressions in existing live tests
