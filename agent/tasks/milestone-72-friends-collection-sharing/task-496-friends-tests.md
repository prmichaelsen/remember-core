# Task 496: Friends Collection Comprehensive Test Suite

**Milestone**: M72 - Friends Collection Sharing
**Status**: pending
**Estimated Hours**: 4-5 hours
**Created**: 2026-03-11
**Dependencies**: Task 494, Task 495

---

## Objective

Create comprehensive test suite for friends collection features covering publish/retract/revise/search operations, validation, tracking, and full lifecycle flows.

---

## Context

From clarification-1-friends-collection-model.md:
- Friends uses boolean flag model (`friends: boolean` for publish/retract)
- Search uses array model (`friends: string[]` with client-ranked friends)
- Tracks `published_to_friends: boolean` in source memory
- Single collection per user: `Memory_friends_<user_id>`
- All friends access is implicit (no selective targeting)

**Testing Strategy**: Follow existing patterns in `space.service.spec.ts`, create new dedicated file for friends-specific tests.

---

## Steps

### 1. Create Test File

**File**: `src/services/__tests__/space.service.friends.spec.ts`

Follow colocated test pattern (see `agent/patterns/core-sdk.testing-unit.md`).

### 2. Setup Test Fixtures

Mirror structure from `space.service.spec.ts`:
```typescript
import { SpaceService } from '../space.service.js';
import { ConfirmationTokenService } from '../confirmation-token.service.js';
import { ValidationError } from '../../errors/app-errors.js';
import {
  createMockCollection,
  createMockWeaviateClient,
  createMockLogger,
} from '../../testing/weaviate-mock.js';

// Mock Firestore, space-schema, space-config, etc. (copy from main spec)

describe('SpaceService — Friends Collections', () => {
  let weaviateClient: ReturnType<typeof createMockWeaviateClient>;
  let userCollection: ReturnType<typeof createMockCollection>;
  let logger: ReturnType<typeof createMockLogger>;
  let confirmationService: ConfirmationTokenService;
  let mockMemoryIndex: { index: jest.Mock; lookup: jest.Mock };
  let service: SpaceService;
  const userId = 'test-user';

  beforeEach(() => {
    weaviateClient = createMockWeaviateClient();
    userCollection = createMockCollection();
    logger = createMockLogger();
    confirmationService = new ConfirmationTokenService(logger);
    mockMemoryIndex = {
      index: jest.fn().mockResolvedValue(undefined),
      lookup: jest.fn().mockResolvedValue(null)
    };
    service = new SpaceService(
      weaviateClient as any,
      userCollection as any,
      userId,
      confirmationService,
      logger,
      mockMemoryIndex as any,
    );
    (weaviateClient as any)._collections.set(`Memory_users_${userId}`, userCollection);
  });

  async function insertUserMemory(overrides: Record<string, any> = {}) {
    return userCollection.data.insert({
      properties: {
        user_id: userId,
        doc_type: 'memory',
        content: 'test memory',
        title: 'Test',
        tags: ['test'],
        space_ids: [],
        group_ids: [],
        published_to_friends: false,
        deleted_at: null,
        ...overrides,
      },
    });
  }

  // Test suites...
});
```

### 3. Test Suite: Publish to Friends

**Test cases**:
- ✅ Generates confirmation token for `friends: true`
- ✅ Throws if no destinations (`friends: false`, no spaces, no groups)
- ✅ Executes publish to `Memory_friends_<user_id>`
- ✅ Updates source memory `published_to_friends: true`
- ✅ Indexes published memory in friends collection
- ✅ Returns `published_to_friends: true` in ConfirmResult
- ✅ Publishes to spaces AND friends simultaneously
- ✅ Handles moderation if configured

Example:
```typescript
describe('publish to friends', () => {
  it('generates confirmation token for friends: true', async () => {
    const memoryId = await insertUserMemory();
    const result = await service.publish({
      memory_id: memoryId,
      friends: true,
    });
    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');
  });

  it('executes publish to friends collection', async () => {
    const memoryId = await insertUserMemory();

    const { token } = await service.publish({
      memory_id: memoryId,
      friends: true,
    });

    const result = await service.confirm({ token });
    expect(result.success).toBe(true);
    expect(result.action).toBe('publish_memory');
    expect(result.published_to_friends).toBe(true);

    // Verify source memory tracking updated
    const source = userCollection._store.get(memoryId);
    expect(source!.properties.published_to_friends).toBe(true);
  });

  // ... more tests
});
```

### 4. Test Suite: Retract from Friends

**Test cases**:
- ✅ Generates confirmation token for `friends: true`
- ✅ Throws if memory not published to friends
- ✅ Executes retract from `Memory_friends_<user_id>`
- ✅ Updates source memory `published_to_friends: false`
- ✅ Returns `published_to_friends: false` in ConfirmResult
- ✅ Handles partial retract (retract from spaces but not friends)

Example:
```typescript
describe('retract from friends', () => {
  it('executes retract from friends collection', async () => {
    const memoryId = await insertUserMemory();

    // First publish
    const { token: publishToken } = await service.publish({
      memory_id: memoryId,
      friends: true,
    });
    await service.confirm({ token: publishToken });

    // Then retract
    const { token: retractToken } = await service.retract({
      memory_id: memoryId,
      friends: true,
    });

    const result = await service.confirm({ token: retractToken });
    expect(result.success).toBe(true);
    expect(result.action).toBe('retract_memory');

    // Verify source memory tracking updated
    const source = userCollection._store.get(memoryId);
    expect(source!.properties.published_to_friends).toBe(false);
  });

  // ... more tests
});
```

### 5. Test Suite: Revise in Friends

**Test cases**:
- ✅ Generates confirmation token when published to friends
- ✅ Throws if memory not published anywhere
- ✅ Executes revise in friends collection
- ✅ Updates content correctly
- ✅ Returns success result

Example:
```typescript
describe('revise in friends', () => {
  it('executes revise in friends collection', async () => {
    const memoryId = await insertUserMemory({ content: 'original content' });

    // First publish
    const { token: publishToken } = await service.publish({
      memory_id: memoryId,
      friends: true,
    });
    await service.confirm({ token: publishToken });

    // Update content
    const memory = userCollection._store.get(memoryId);
    memory!.properties.content = 'updated content';

    // Revise
    const { token } = await service.revise({ memory_id: memoryId });
    const result = await service.confirm({ token });

    expect(result.success).toBe(true);
    expect(result.action).toBe('revise_memory');
  });

  // ... more tests
});
```

### 6. Test Suite: Search in Friends Collections

**Test cases**:
- ✅ Throws for invalid friend user IDs (contains dot)
- ✅ Throws for empty friend user IDs
- ✅ Searches single friend's collection
- ✅ Searches multiple friends' collections
- ✅ Returns `friends_searched` array
- ✅ Searches spaces AND friends together
- ✅ Skips nonexistent collections gracefully
- ✅ Does not search public when only friends specified
- ✅ Applies filters correctly (content_type, tags, etc.)

Example:
```typescript
describe('search in friends collections', () => {
  it('throws for invalid friend user ID (contains dot)', async () => {
    await expect(
      service.search({ query: 'test', friends: ['invalid.user'] }),
    ).rejects.toThrow('Friend user IDs cannot be empty or contain dots');
  });

  it('searches multiple friends collections', async () => {
    const friend1 = 'friend-user-1';
    const friend2 = 'friend-user-2';

    // Setup friend collections
    const friend1Collection = weaviateClient.collections.get(`Memory_friends_${friend1}`);
    const friend2Collection = weaviateClient.collections.get(`Memory_friends_${friend2}`);

    await friend1Collection.data.insert({
      properties: {
        doc_type: 'memory',
        content: 'friend 1 memory',
        deleted_at: null,
        moderation_status: 'approved',
        content_type: 'note',
      },
    });

    await friend2Collection.data.insert({
      properties: {
        doc_type: 'memory',
        content: 'friend 2 memory',
        deleted_at: null,
        moderation_status: 'approved',
        content_type: 'note',
      },
    });

    const result = await service.search({
      query: 'memory',
      friends: [friend1, friend2],
    });

    expect(result.friends_searched).toEqual([friend1, friend2]);
    expect(result.spaces_searched).toEqual([]);
    expect(result.groups_searched).toEqual([]);
  });

  // ... more tests
});
```

### 7. Test Suite: Tracking and State Management

**Test cases**:
- ✅ Initializes `published_to_friends: false`
- ✅ Updates to `true` after publish
- ✅ Updates to `false` after retract
- ✅ Maintains state alongside `space_ids` and `group_ids`
- ✅ Handles simultaneous operations (spaces + groups + friends)

### 8. Test Suite: Full Lifecycle Integration

**Test cases**:
- ✅ Complete publish → search → retract flow
- ✅ Publish to multiple targets → retract from one → verify others remain
- ✅ Publish → revise → search → verify updated content
- ✅ Error recovery (publish fails → source memory unchanged)

Example:
```typescript
describe('friends collection lifecycle', () => {
  it('complete publish → search → retract flow', async () => {
    const memoryId = await insertUserMemory({ content: 'lifecycle test' });

    // 1. Publish
    const { token: publishToken } = await service.publish({
      memory_id: memoryId,
      friends: true,
    });
    await service.confirm({ token: publishToken });

    // 2. Search
    const searchResult = await service.search({
      query: 'lifecycle',
      friends: [userId],  // Search my own friends collection
    });
    expect(searchResult.friends_searched).toEqual([userId]);

    // 3. Retract
    const { token: retractToken } = await service.retract({
      memory_id: memoryId,
      friends: true,
    });
    await service.confirm({ token: retractToken });

    // 4. Verify source memory cleared
    const memory = userCollection._store.get(memoryId);
    expect(memory!.properties.published_to_friends).toBe(false);
  });

  // ... more tests
});
```

### 9. Test Suite: Edge Cases

**Test cases**:
- ✅ Publish when already published (idempotent or error?)
- ✅ Retract when not published (validation error)
- ✅ Search empty friends array (searches public)
- ✅ Bounded fanout (50+ friends → performance acceptable)
- ✅ Nonexistent friend collection (skip gracefully)

### 10. Run All Tests

```bash
npm test -- space.service.friends.spec.ts
```

Verify all new tests pass, then run full suite:
```bash
npm test
```

Ensure no regressions (all 1,706+ tests pass).

---

## Verification Checklist

- [ ] Test file created: `space.service.friends.spec.ts`
- [ ] Mock setup mirrors main spec file
- [ ] Publish test suite complete (8+ tests)
- [ ] Retract test suite complete (5+ tests)
- [ ] Revise test suite complete (3+ tests)
- [ ] Search test suite complete (10+ tests)
- [ ] Tracking test suite complete (5+ tests)
- [ ] Lifecycle test suite complete (3+ tests)
- [ ] Edge case test suite complete (5+ tests)
- [ ] All new tests passing
- [ ] All existing tests passing (1,706+)
- [ ] No TypeScript errors
- [ ] Test coverage maintained/improved

---

## Expected Outcome

### Files Created
- `src/services/__tests__/space.service.friends.spec.ts` (~400-500 lines, 30+ tests)

### Test Coverage
- **Publish operations**: 8+ tests
- **Retract operations**: 5+ tests
- **Revise operations**: 3+ tests
- **Search operations**: 10+ tests
- **State tracking**: 5+ tests
- **Lifecycle flows**: 3+ tests
- **Edge cases**: 5+ tests
- **Total**: ~40 new tests

### Test Execution
```bash
$ npm test -- space.service.friends.spec.ts

PASS src/services/__tests__/space.service.friends.spec.ts
  SpaceService — Friends Collections
    publish to friends
      ✓ generates confirmation token for friends: true
      ✓ executes publish to friends collection
      ✓ updates source memory published_to_friends
      ...
    retract from friends
      ✓ executes retract from friends collection
      ...
    search in friends collections
      ✓ searches multiple friends collections
      ✓ returns friends_searched array
      ...

Tests: 40 passed, 40 total
```

---

## Notes

- **Test file organization**: Separate file keeps friends tests isolated and maintainable
- **Mock patterns**: Use existing mock infrastructure (createMockWeaviateClient, etc.)
- **Lifecycle testing**: Critical to test full publish→search→retract flows
- **Edge cases**: Focus on validation, nonexistent collections, empty arrays
- **Performance**: While tests run in-memory, verify patterns scale (50-friend search acceptable)
- **Regression prevention**: Full test suite must pass (no breaking changes)

---

**Status**: Ready to implement
**Next**: Execute Task 494 (implement core functionality)
