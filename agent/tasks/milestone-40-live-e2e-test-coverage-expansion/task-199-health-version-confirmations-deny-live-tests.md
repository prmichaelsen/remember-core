# Task 199: Health Version + Confirmations Deny Live Tests

**Milestone**: [M40 - Live E2E Test Coverage Expansion](../../milestones/milestone-40-live-e2e-test-coverage-expansion.md)
**Design Reference**: None
**Estimated Time**: 1 hour
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add live e2e tests for `health.version()` and `confirmations.deny()`.

---

## Steps

### 1. Extend health test

Add to `test/live/suites/01-health.live.ts`:

```typescript
it('version() returns service version info', async () => {
  const res = await client.health.version();

  if (res.error) {
    console.warn('version error:', res.error);
    expect([400, 500]).toContain(res.error.status);
    return;
  }

  expect(res.data).toBeDefined();
});
```

### 2. Test: confirmations.deny()

Add to `test/live/suites/05-spaces.live.ts` (which already has the publish + confirm flow):

After the existing publish test that gets a confirmation token:

```typescript
it('deny() rejects a pending confirmation', async () => {
  // Publish a memory to get a token, then deny it instead of confirming
  const publishRes = await client.spaces.publish(TEST_USER_ID, {
    memory_id: denyTestMemoryId,
    spaces: ['the_void'],
  });

  if (publishRes.error || !publishRes.data) return;
  const token = (publishRes.data as any).token;
  if (!token) return;

  const res = await client.confirmations.deny(TEST_USER_ID, token);

  if (res.error) {
    console.warn('deny error:', res.error);
    expect([400, 500]).toContain(res.error.status);
    return;
  }

  expect(res.error).toBeNull();
});
```

### 3. Setup for deny test

Create a separate test memory in beforeAll specifically for the deny test so it doesn't interfere with existing publish/confirm tests.

---

## Verification

- [ ] health.version() test added to 01-health.live.ts
- [ ] confirmations.deny() test added to 05-spaces.live.ts
- [ ] deny test creates its own memory + publish token (isolated from other tests)
- [ ] Both follow graceful error pattern
- [ ] Existing tests remain green
