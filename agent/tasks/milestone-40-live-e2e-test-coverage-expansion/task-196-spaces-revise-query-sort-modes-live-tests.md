# Task 196: Spaces Revise + Query + Sort Modes Live Tests

**Milestone**: [M40 - Live E2E Test Coverage Expansion](../../milestones/milestone-40-live-e2e-test-coverage-expansion.md)
**Design Reference**: None
**Estimated Time**: 2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add live e2e tests for `spaces.revise()`, `spaces.query()`, and three space sort modes: `spaces.byDiscovery()`, `spaces.byRecommendation()`, `spaces.byCurated()`.

---

## Steps

### 1. Extend space sort modes test

Add to `test/live/suites/10-space-sort-modes.live.ts`:

```typescript
it('byDiscovery returns results or empty', async () => {
  const res = await client.spaces.byDiscovery(TEST_USER_ID, {
    spaces: ['the_void'],
    limit: 5,
  });
  // Verify data shape or graceful error
});

it('byRecommendation returns results or graceful fallback', async () => {
  const res = await client.spaces.byRecommendation(TEST_USER_ID, {
    spaces: ['the_void'],
    limit: 5,
  });
  // May 400 if no centroid
  // Verify data or expected error
});

it('byCurated returns results or empty', async () => {
  const res = await client.spaces.byCurated(TEST_USER_ID, {
    spaces: ['the_void'],
    limit: 5,
  });
  // Verify data shape
});
```

### 2. Extend spaces test for revise + query

Add to `test/live/suites/05-spaces.live.ts`:

```typescript
it('query() returns semantic search results from spaces', async () => {
  const res = await client.spaces.query(TEST_USER_ID, {
    query: 'test content',
    spaces: ['the_void'],
    limit: 5,
  });
  // Verify data shape or graceful error
});
```

For `revise()`: requires a published memory + confirmation token flow. Add after the existing publish/retract tests:

```typescript
it('revise() updates published memory content', async () => {
  // Publish a memory, confirm it, then revise
  const res = await client.spaces.revise(TEST_USER_ID, {
    memory_id: publishedMemoryId,
    content: 'Revised content from live test',
    spaces: ['the_void'],
  });
  // May return confirmation token or direct success
});
```

---

## Verification

- [ ] spaces.byDiscovery() test added to 10-space-sort-modes.live.ts
- [ ] spaces.byRecommendation() test added (graceful fallback)
- [ ] spaces.byCurated() test added
- [ ] spaces.query() test added to 05-spaces.live.ts
- [ ] spaces.revise() test added (may need publish+confirm setup)
- [ ] All follow graceful error pattern
- [ ] Existing space tests remain green
