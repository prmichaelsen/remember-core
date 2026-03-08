# Task 193: Memory Get + Similar + Query Live Tests

**Milestone**: [M40 - Live E2E Test Coverage Expansion](../../milestones/milestone-40-live-e2e-test-coverage-expansion.md)
**Design Reference**: None
**Estimated Time**: 2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add live e2e tests for `memories.get()`, `memories.similar()`, and `memories.query()` SVC client methods.

---

## Context

These are core memory retrieval operations with zero live test coverage. `get()` fetches a single memory by ID (with optional author/space/group/include params). `similar()` does vector similarity search. `query()` does semantic/nearText query.

---

## Steps

### 1. Create or extend test file

Create `test/live/suites/13-memory-retrieval.live.ts`.

### 2. Setup

In `beforeAll`:
- Create a test memory with known content using `client.memories.create()`
- Store `memory_id` for get/similar/query tests

### 3. Test: memories.get() by ID

```typescript
it('get() fetches a single memory by ID', async () => {
  const res = await client.memories.get(TEST_USER_ID, memoryId);
  // Verify data contains the memory with matching content
});
```

### 4. Test: memories.get() with options

```typescript
it('get() with include option returns enriched data', async () => {
  const res = await client.memories.get(TEST_USER_ID, memoryId, { include: 'relationships' });
  // Verify response shape
});
```

### 5. Test: memories.get() not found

```typescript
it('get() returns 404 for non-existent memory', async () => {
  const res = await client.memories.get(TEST_USER_ID, '00000000-0000-0000-0000-000000000000');
  expect(res.error).toBeDefined();
  expect(res.error!.status).toBe(404);
});
```

### 6. Test: memories.similar()

```typescript
it('similar() returns vector-similar memories', async () => {
  const res = await client.memories.similar(TEST_USER_ID, {
    memory_id: memoryId,
    limit: 5,
  });
  // Verify data is defined, results array
});
```

### 7. Test: memories.query()

```typescript
it('query() returns semantic search results', async () => {
  const res = await client.memories.query(TEST_USER_ID, {
    query: 'memory retrieval test content',
    limit: 5,
  });
  // Verify data is defined, results array
});
```

### 8. Cleanup

In `afterAll`: delete test memory.

---

## Verification

- [ ] `test/live/suites/13-memory-retrieval.live.ts` created
- [ ] get() by ID returns the created memory
- [ ] get() with options works
- [ ] get() returns 404 for non-existent ID
- [ ] similar() returns results
- [ ] query() returns results
- [ ] Graceful error handling on all tests
- [ ] Cleanup deletes test memory
