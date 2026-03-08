# Task 195: Trust Operations Expansion Live Tests

**Milestone**: [M40 - Live E2E Test Coverage Expansion](../../milestones/milestone-40-live-e2e-test-coverage-expansion.md)
**Design Reference**: None
**Estimated Time**: 2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add live e2e tests for `trust.updateGhostConfig()`, `trust.blockUser()`, `trust.unblockUser()`, and `trust.checkAccess()`.

---

## Steps

### 1. Extend trust test file

Add to `test/live/suites/06-trust.live.ts`.

### 2. Test: updateGhostConfig()

```typescript
it('updateGhostConfig() modifies ghost configuration', async () => {
  const res = await client.trust.updateGhostConfig(TEST_USER_ID, {
    // Set a safe ghost config value, e.g. ghost_enabled
  });
  // Verify success or graceful error
});
```

### 3. Test: blockUser() + unblockUser()

```typescript
it('blockUser() blocks a target user', async () => {
  const res = await client.trust.blockUser(TEST_USER_ID, {
    target_user_id: TEST_USER_ID_2,
  });
  // Verify success
});

it('unblockUser() unblocks a previously blocked user', async () => {
  const res = await client.trust.unblockUser(TEST_USER_ID, {
    target_user_id: TEST_USER_ID_2,
  });
  // Verify success
});
```

Note: block then unblock in sequence to leave clean state.

### 4. Test: checkAccess()

```typescript
it('checkAccess() returns access info for a memory', async () => {
  // Requires a memory_id — use one created in beforeAll or another suite
  const res = await client.trust.checkAccess(TEST_USER_ID, {
    memory_id: memoryId,
    accessor_user_id: TEST_USER_ID_2,
  });
  // Verify { accessible, trust_tier } shape
});
```

### 5. Setup/cleanup

Create a test memory in `beforeAll` for checkAccess, clean up in `afterAll`. Also unblock TEST_USER_ID_2 in afterAll as safety net.

---

## Verification

- [ ] updateGhostConfig() test added
- [ ] blockUser() test added
- [ ] unblockUser() test added (runs after blockUser to restore state)
- [ ] checkAccess() test validates { accessible, trust_tier } shape
- [ ] afterAll unblocks TEST_USER_ID_2 as safety net
- [ ] Existing trust tests remain green
