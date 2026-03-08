# Task 194: Relationship Update + Preferences Update Live Tests

**Milestone**: [M40 - Live E2E Test Coverage Expansion](../../milestones/milestone-40-live-e2e-test-coverage-expansion.md)
**Design Reference**: None
**Estimated Time**: 1 hour
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add live e2e tests for `relationships.update()` and `preferences.update()` CRUD gaps.

---

## Steps

### 1. Extend relationships test

Add to `test/live/suites/04-relationships.live.ts`:

```typescript
it('update() modifies relationship properties', async () => {
  // Use relationship created in beforeAll
  const res = await client.relationships.update(TEST_USER_ID, relationshipId, {
    observation: 'Updated observation from live test',
  });
  // Verify success or graceful error
});
```

### 2. Extend preferences test

Add to `test/live/suites/03-preferences.live.ts`:

```typescript
it('update() modifies user preferences', async () => {
  const res = await client.preferences.update(TEST_USER_ID, {
    // Set a safe preference value
  });
  // Verify success
});
```

---

## Verification

- [ ] relationships.update() test added to 04-relationships.live.ts
- [ ] preferences.update() test added to 03-preferences.live.ts
- [ ] Both follow graceful error pattern
- [ ] Existing tests in those files remain green
