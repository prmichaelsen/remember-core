# Task 191: byMyRatings Live E2E Tests

**Milestone**: [M39 - Live E2E Test Expansion](../milestones/milestone-39-live-e2e-test-expansion.md)
**Design Reference**: [byMyRatings Sort Mode](../design/local.by-my-ratings-sort-mode.md)
**Estimated Time**: 2 hours
**Dependencies**: M37 (byMyRatings implementation), byMyRatings deployed to e1
**Status**: Not Started

---

## Objective

Add live e2e tests for the `POST /api/svc/v1/memories/by-my-ratings` endpoint against the deployed e1 REST service. Tests validate browse mode, search mode, star filtering, sort options, and the `{ memory, metadata }` response envelope.

---

## Context

The byMyRatings endpoint was added in M37 but has no live e2e test coverage. Existing live tests in `test/live/suites/08-ratings.live.ts` cover rate/getMyRating/retractRating but not the byMyRatings browse/search endpoint. The endpoint returns a `{ memory, metadata }` envelope (not flat `memories[]`), which is new and needs validation against the real service.

---

## Steps

### 1. Create Test File

Create `test/live/suites/11-by-my-ratings.live.ts` following the pattern of existing live tests.

### 2. Setup: Create and Rate Memories

In `beforeAll`:
- User 1 creates 2-3 test memories with tag `live-test-by-my-ratings`
- User 2 rates each memory (different star values: 2, 4, 5) using `client.memories.rate()`
- Store memory IDs and expected ratings for assertion

### 3. Cleanup

In `afterAll`:
- Retract all ratings (`client.memories.retractRating()`)
- Delete test memories (`client.memories.delete()`)
- Use try/catch around each cleanup call (may 204 or 404)

### 4. Test: Browse Mode (Default)

```typescript
it('byMyRatings browse mode returns envelope with metadata', async () => {
  const res = await client.memories.byMyRatings(TEST_USER_ID_2, {
    limit: 10,
  });
  // Verify { items, total, offset, limit } shape
  // Each item has { memory, metadata }
  // metadata has { my_rating, rated_at }
});
```

### 5. Test: Sort by Rating Descending

```typescript
it('byMyRatings sort_by rating desc returns highest first', async () => {
  const res = await client.memories.byMyRatings(TEST_USER_ID_2, {
    sort_by: 'rating',
    direction: 'desc',
    limit: 10,
  });
  // Verify first item metadata.my_rating >= last item metadata.my_rating
});
```

### 6. Test: Sort by Rated At

```typescript
it('byMyRatings sort_by rated_at returns most recent first', async () => {
  const res = await client.memories.byMyRatings(TEST_USER_ID_2, {
    sort_by: 'rated_at',
    direction: 'desc',
    limit: 10,
  });
  // Verify items exist and have rated_at in metadata
});
```

### 7. Test: Star Filter

```typescript
it('byMyRatings with rating_filter returns filtered results', async () => {
  const res = await client.memories.byMyRatings(TEST_USER_ID_2, {
    rating_filter: { min: 4 },
    limit: 10,
  });
  // Verify all returned items have metadata.my_rating >= 4
});
```

### 8. Test: Search Mode (with Query)

```typescript
it('byMyRatings with query searches within rated memories', async () => {
  const res = await client.memories.byMyRatings(TEST_USER_ID_2, {
    query: 'live-test',
    limit: 10,
  });
  // Verify returns results (or empty if query doesn't match)
  // Verify envelope shape is maintained
});
```

### 9. Test: Empty Results (Unrated User)

```typescript
it('byMyRatings for user with no ratings returns empty', async () => {
  const freshUserId = `live_test_no_ratings_${Date.now()}`;
  const res = await client.memories.byMyRatings(freshUserId, {
    limit: 10,
  });
  // Verify items is empty array, total is 0
});
```

### 10. Test: Error Handling Pattern

Follow the graceful error pattern from existing live tests:
- If `res.error`, log warning and check status is expected (400/500)
- Don't hard-fail on empty results (e1 test data may vary)
- Guard memory operations with null checks on IDs

---

## Verification

- [ ] `test/live/suites/11-by-my-ratings.live.ts` created
- [ ] Test uses `getClient()` and `TEST_USER_ID` / `TEST_USER_ID_2` from helpers
- [ ] beforeAll creates test memories and rates them as different user
- [ ] afterAll cleans up ratings and memories
- [ ] Browse mode test validates `{ items, total, offset, limit }` shape
- [ ] Each item has `{ memory, metadata }` with `metadata.my_rating` and `metadata.rated_at`
- [ ] Sort by rating test verifies ordering
- [ ] Sort by rated_at test verifies ordering
- [ ] Star filter test verifies all results match filter
- [ ] Search mode test validates envelope with query
- [ ] Empty results test for unrated user
- [ ] All tests follow graceful error pattern (warn, don't hard-fail)
- [ ] Tests pass with `npm run test:live`
- [ ] Existing live tests remain green

---

## Expected Output

**File Created**:
- `test/live/suites/11-by-my-ratings.live.ts`

**Test Cases** (~6 tests):
1. Browse mode returns envelope with metadata
2. Sort by rating descending
3. Sort by rated_at descending
4. Star filter (min: 4)
5. Search mode with query
6. Empty results for unrated user

---

## Notes

- byMyRatings uses `{ memory, metadata }` envelope — NOT flat `memories[]` like other sort modes
- Must rate as a different user (TEST_USER_ID_2) since self-rating is blocked
- The endpoint is Firestore-first, so results depend on rating docs existing in e1
- Live tests are run via `npm run test:live` with `E1_PLATFORM_SERVICE_TOKEN` env var
- Follow colocated test convention for unit tests, but live tests go in `test/live/suites/`
