# Task 129: Spaces Live Tests

**Milestone**: [M24 - Live E2E Test Coverage](../../milestones/milestone-24-live-e2e-test-coverage.md)
**Estimated Time**: 1-2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add `05-spaces.live.ts` test suite covering SpaceService operations (publish, search, retract) via the SVC client against the deployed e1 REST service.

---

## Context

Spaces involve a two-phase confirmation flow: publish returns a confirmation token, then the client must confirm. The SVC client `spaces` resource has: `publish`, `search`, `query`, `retract`, `revise`, `moderate`. The `confirmations` resource has: `confirm`, `deny`. Live tests need to exercise the full publish-confirm-search-retract flow.

---

## Steps

### 1. Create test/live/suites/05-spaces.live.ts

Test cases:
- Create a memory, publish to space (get confirmation token)
- Confirm the publish via confirmations resource
- Search the space for the published memory
- Retract the published memory (confirm retraction)
- Clean up in afterAll

### 2. Run and verify

```bash
npm run test:live
```

---

## Verification

- [ ] 05-spaces.live.ts exists with 4+ test cases
- [ ] Full publish-confirm-search-retract flow tested
- [ ] All tests pass against e1
- [ ] Test data cleaned up in afterAll
