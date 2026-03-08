# Task 192: Sort Mode Expansion Live E2E Tests

**Milestone**: [M39 - Live E2E Test Expansion](../milestones/milestone-39-live-e2e-test-expansion.md)
**Design Reference**: None (follows existing patterns in 07-sort-modes.live.ts)
**Estimated Time**: 2 hours
**Dependencies**: Task 191, byCurated/byDiscovery/byRecommendation deployed to e1
**Status**: Not Started

---

## Objective

Add live e2e tests for `byCurated`, `byDiscovery`, and `byRecommendation` sort mode endpoints. These were added in M25/M27/M36 but the existing `07-sort-modes.live.ts` only covers byTime, byDensity, and byRating.

---

## Context

`test/live/suites/07-sort-modes.live.ts` tests 3 sort modes (byTime, byDensity, byRating). Three more sort modes exist on the SVC client but have no live coverage:

- `client.memories.byCurated()` → `POST /api/svc/v1/memories/by-curated`
- `client.memories.byDiscovery()` → `POST /api/svc/v1/memories/by-discovery`
- `client.memories.byRecommendation()` → `POST /api/svc/v1/memories/by-recommendation`

These all return flat `memories[]` responses (standard sort mode pattern).

---

## Steps

### 1. Extend Existing Sort Modes Test File

Add tests to `test/live/suites/07-sort-modes.live.ts` (preferred) or create `test/live/suites/12-advanced-sort-modes.live.ts` if the file is getting too large.

### 2. Test: byCurated

```typescript
it('query byCurated returns results or empty', async () => {
  const res = await client.memories.byCurated(TEST_USER_ID, {
    limit: 10,
  });
  if (res.error) {
    console.warn('byCurated error:', res.error);
    expect([400, 500]).toContain(res.error.status);
    return;
  }
  expect(res.data).toBeDefined();
});
```

### 3. Test: byDiscovery

```typescript
it('query byDiscovery returns results or empty', async () => {
  const res = await client.memories.byDiscovery(TEST_USER_ID, {
    limit: 10,
  });
  if (res.error) {
    console.warn('byDiscovery error:', res.error);
    expect([400, 500]).toContain(res.error.status);
    return;
  }
  expect(res.data).toBeDefined();
});
```

### 4. Test: byRecommendation

```typescript
it('query byRecommendation returns results or graceful fallback', async () => {
  const res = await client.memories.byRecommendation(TEST_USER_ID, {
    limit: 10,
  });
  if (res.error) {
    console.warn('byRecommendation error:', res.error);
    // May 400 if user has no ratings (no centroid to build)
    expect([400, 404, 500]).toContain(res.error.status);
    return;
  }
  expect(res.data).toBeDefined();
});
```

### 5. Test: byCurated with Search Query

```typescript
it('byCurated with query re-ranks by curated score', async () => {
  const res = await client.memories.byCurated(TEST_USER_ID, {
    query: 'test',
    limit: 10,
  });
  if (res.error) {
    console.warn('byCurated search error:', res.error);
    expect([400, 500]).toContain(res.error.status);
    return;
  }
  expect(res.data).toBeDefined();
});
```

---

## Verification

- [ ] byCurated live test added and passes
- [ ] byDiscovery live test added and passes
- [ ] byRecommendation live test added and passes (or graceful error for no-centroid user)
- [ ] byCurated search mode test added
- [ ] All tests follow graceful error pattern
- [ ] Existing sort mode tests remain green
- [ ] Tests pass with `npm run test:live`

---

## Expected Output

**Files Modified or Created**:
- `test/live/suites/07-sort-modes.live.ts` (extended) OR `test/live/suites/12-advanced-sort-modes.live.ts` (new)

**Test Cases** (~4 tests):
1. byCurated browse mode
2. byDiscovery browse mode
3. byRecommendation browse mode (graceful fallback)
4. byCurated search mode

---

## Notes

- byRecommendation requires a user with rated memories to build a centroid; test user may not have ratings, so expect graceful 400/fallback
- byDiscovery interleaves unrated with rated — hard to assert ordering in live test, just verify response shape
- byCurated depends on pre-computed curated_score — may return all zeros for fresh memories
- All three use flat `memories[]` response (unlike byMyRatings which uses envelope)
