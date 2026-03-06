# Task 131: Sort Modes and Ratings Live Tests

**Milestone**: [M24 - Live E2E Test Coverage](../../milestones/milestone-24-live-e2e-test-coverage.md)
**Estimated Time**: 1-2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add `07-sort-modes.live.ts` and `08-ratings.live.ts` test suites covering sort mode queries and rating operations via the SVC client against the deployed e1 REST service.

---

## Context

Sort modes: `byTime`, `byDensity`, `byRating` are POST endpoints on the memories resource. Ratings: `rate`, `retractRating`, `getMyRating` operate on individual memories. These endpoints need live validation to confirm they work against real Weaviate data.

---

## Steps

### 1. Create test/live/suites/07-sort-modes.live.ts

Test cases:
- Create a memory, then query byTime (should return results)
- Query byDensity (should return results or empty)
- Query byRating (should return results or empty)
- Clean up memory in afterAll

### 2. Create test/live/suites/08-ratings.live.ts

Test cases:
- Create a memory, rate it (PUT rating)
- Get my rating (GET rating)
- Retract rating (DELETE rating)
- Clean up memory in afterAll

### 3. Run and verify

```bash
npm run test:live
```

---

## Verification

- [ ] 07-sort-modes.live.ts exists with 3+ test cases
- [ ] 08-ratings.live.ts exists with 3+ test cases
- [ ] All tests pass against e1
- [ ] Test data cleaned up in afterAll
