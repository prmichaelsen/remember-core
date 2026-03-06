# Task 130: Trust Live Tests

**Milestone**: [M24 - Live E2E Test Coverage](../../milestones/milestone-24-live-e2e-test-coverage.md)
**Estimated Time**: 1 hour
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add `06-trust.live.ts` test suite covering trust/ghost config operations via the SVC client against the deployed e1 REST service.

---

## Context

The SVC client `trust` resource has: `getConfig`, `updateConfig`, `setUserTrust`, `removeUserTrust`, `blockUser`, `unblockUser`, `checkAccess`. Live tests should verify basic config get/update and trust level operations.

---

## Steps

### 1. Create test/live/suites/06-trust.live.ts

Test cases:
- Get ghost config for test user (may return defaults or 500 for new user)
- Set trust level for a target user
- Remove trust for the target user
- Clean up in afterAll if needed

### 2. Run and verify

```bash
npm run test:live
```

---

## Verification

- [ ] 06-trust.live.ts exists with 2+ test cases
- [ ] All tests pass against e1
- [ ] Trust operations properly clean up (remove test trust entries)
