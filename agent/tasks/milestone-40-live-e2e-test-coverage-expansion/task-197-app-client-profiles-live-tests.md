# Task 197: App Client Profiles Live Tests

**Milestone**: [M40 - Live E2E Test Coverage Expansion](../../milestones/milestone-40-live-e2e-test-coverage-expansion.md)
**Design Reference**: None
**Estimated Time**: 2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add live e2e tests for all 4 `app.profiles.*` methods: `createAndPublish()`, `search()`, `retract()`, `updateAndRepublish()`.

---

## Context

The App client profiles resource is at 0% live test coverage. Uses `test/live/helpers/app-client.ts` for client construction. Profile operations are compound (create + publish in one call).

Method signatures:
- `profiles.createAndPublish(userId, { display_name, bio, tags, ... })`
- `profiles.search(userId, { query, limit, offset })`
- `profiles.retract(userId, memoryId)`
- `profiles.updateAndRepublish(userId, memoryId, { display_name, bio, tags, ... })`

---

## Steps

### 1. Create test file

Create `test/live/suites/14-app-profiles.live.ts`.

### 2. Setup

Import `getAppClient` from `../helpers/app-client.js`.

### 3. Test: createAndPublish()

```typescript
it('createAndPublish() creates and publishes a profile', async () => {
  const res = await appClient.profiles.createAndPublish(TEST_USER_ID, {
    display_name: 'Live Test Profile',
    bio: 'A test profile for e2e testing',
    tags: ['live-test'],
  });
  // Store memory_id for subsequent tests
  // Verify success shape
});
```

### 4. Test: search()

```typescript
it('search() finds published profiles', async () => {
  const res = await appClient.profiles.search(TEST_USER_ID, {
    query: 'Live Test Profile',
    limit: 10,
  });
  // Verify results array
});
```

### 5. Test: updateAndRepublish()

```typescript
it('updateAndRepublish() updates profile content', async () => {
  const res = await appClient.profiles.updateAndRepublish(TEST_USER_ID, profileMemoryId, {
    display_name: 'Updated Live Test Profile',
    bio: 'Updated bio',
  });
  // Verify success
});
```

### 6. Test: retract()

```typescript
it('retract() removes published profile', async () => {
  const res = await appClient.profiles.retract(TEST_USER_ID, profileMemoryId);
  // Verify success — run last as cleanup
});
```

### 7. Cleanup

`afterAll`: retract profile if still published, delete underlying memory.

---

## Verification

- [ ] `test/live/suites/14-app-profiles.live.ts` created
- [ ] createAndPublish() test works
- [ ] search() finds the created profile
- [ ] updateAndRepublish() modifies the profile
- [ ] retract() removes the profile
- [ ] Graceful error handling throughout
- [ ] Cleanup removes test data
