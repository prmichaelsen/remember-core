# Task 198: App Client Memory + Relationships + Ghost Live Tests

**Milestone**: [M40 - Live E2E Test Coverage Expansion](../../milestones/milestone-40-live-e2e-test-coverage-expansion.md)
**Design Reference**: None
**Estimated Time**: 2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add live e2e tests for `app.memories.get()`, `app.relationships.getMemories()`, and `app.ghost.searchAsGhost()`.

---

## Context

Method signatures:
- `memories.get(userId, memoryId, { includeRelationships?, relationshipMemoryLimit?, includeSimilar?, similarLimit? })`
- `relationships.getMemories(userId, relationshipId, { limit?, offset? })`
- `ghost.searchAsGhost(userId, { owner_user_id, query, limit, offset })`

---

## Steps

### 1. Create test file

Create `test/live/suites/15-app-compound.live.ts`.

### 2. Setup

In `beforeAll`:
- Create a test memory via SVC client
- Create a relationship referencing that memory (if possible)
- Import `getAppClient` from helpers

### 3. Test: app.memories.get()

```typescript
it('memories.get() returns memory with optional relationships and similar', async () => {
  const res = await appClient.memories.get(TEST_USER_ID, memoryId, {
    includeRelationships: true,
    includeSimilar: true,
    similarLimit: 3,
  });
  // Verify compound response shape
});
```

### 4. Test: app.memories.get() basic

```typescript
it('memories.get() returns memory without extras', async () => {
  const res = await appClient.memories.get(TEST_USER_ID, memoryId);
  // Verify basic memory response
});
```

### 5. Test: app.relationships.getMemories()

```typescript
it('relationships.getMemories() returns paginated memories', async () => {
  // May need a known relationship ID — create one in setup or use existing
  const res = await appClient.relationships.getMemories(TEST_USER_ID, relationshipId, {
    limit: 10,
  });
  // Verify paginated response or graceful 404
});
```

### 6. Test: app.ghost.searchAsGhost()

```typescript
it('ghost.searchAsGhost() searches as another user', async () => {
  const res = await appClient.ghost.searchAsGhost(TEST_USER_ID, {
    owner_user_id: TEST_USER_ID_2,
    query: 'test',
    limit: 5,
  });
  // May error if ghost not enabled for target user
  // Verify response or graceful error
});
```

### 7. Cleanup

Delete test memory and relationship in `afterAll`.

---

## Verification

- [ ] `test/live/suites/15-app-compound.live.ts` created
- [ ] app.memories.get() with options tested
- [ ] app.memories.get() basic tested
- [ ] app.relationships.getMemories() tested (or graceful 404)
- [ ] app.ghost.searchAsGhost() tested (or graceful error)
- [ ] Cleanup removes test data
