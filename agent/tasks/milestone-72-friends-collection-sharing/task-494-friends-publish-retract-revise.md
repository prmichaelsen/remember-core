# Task 494: Friends Collection Publish/Retract/Revise Support

**Milestone**: M72 - Friends Collection Sharing
**Status**: pending
**Estimated Hours**: 4-6 hours
**Created**: 2026-03-11
**Dependencies**: Task 493 (Friends Collection Type)

---

## Objective

Extend SpaceService publish/retract/revise operations to support friends collections using a boolean flag model where publishing to friends writes to the user's own `Memory_friends_<user_id>` collection.

---

## Context

From clarification-1-friends-collection-model.md:
- Friends publishing uses `friends: boolean` input (not array)
- `friends: true` → publish to `Memory_friends_<my_user_id>` (ONE collection - mine)
- Tracks `published_to_friends: boolean` in source memory (not array)
- All friends access is implicit (no selective friend targeting)
- Access control enforced via `AuthContext.credentials.friend_user_ids`

**Pattern**: Similar to spaces (one collection), not groups (multiple collections).

---

## Steps

### 1. Extend Input Interfaces

**File**: `src/services/space.service.ts`

Update these interfaces:
```typescript
export interface PublishInput {
  memory_id: string;
  spaces?: string[];
  groups?: string[];
  friends?: boolean;  // NEW
  tags?: string[];
  // ...
}

export interface RetractInput {
  memory_id: string;
  spaces?: string[];
  groups?: string[];
  friends?: boolean;  // NEW
}

export interface ReviseInput {
  memory_id: string;
  spaces?: string[];
  groups?: string[];
  friends?: boolean;  // NEW
}
```

### 2. Update Validation Logic

**In `publish()` function**:
```typescript
const spaces = input.spaces || [];
const groups = input.groups || [];
const friends = input.friends || false;

if (spaces.length === 0 && groups.length === 0 && !friends) {
  throw new ValidationError('Must specify at least one space, group, or friends target to publish to');
}
```

**In `retract()` function**:
```typescript
const currentPublishedToFriends = originalMemory.properties.published_to_friends as boolean || false;

if (!currentPublishedToFriends && friends) {
  throw new ValidationError('Memory is not published to some destinations you want to retract from');
}
```

**In `revise()` function**:
```typescript
const publishedToFriends = originalMemory.properties.published_to_friends as boolean || false;

if (spaceIds.length === 0 && groupIds.length === 0 && !publishedToFriends) {
  throw new ValidationError('Memory has no published copies to revise');
}
```

### 3. Update Confirmation Token Payloads

Add `friends: boolean` to payload:
```typescript
const tokenPayload = {
  memory_id: request.payload.memory_id,
  spaces,
  groups,
  friends,  // NEW
  tags: mergedTags,
};
```

### 4. Implement Friends Publishing in executePublish()

After groups publishing loop, add:
```typescript
// Publish to friends
if (friends) {
  const friendsCollectionName = getCollectionName(CollectionType.FRIENDS, this.userId);
  await ensureFriendsCollection(this.weaviateClient, this.userId);
  const friendsCollection = this.weaviateClient.collections.get(friendsCollectionName);

  const friendsMemory: Record<string, any> = {
    ...originalMemory.properties,
    composite_id: compositeId,
    space_ids: existingSpaceIds,
    group_ids: existingGroupIds,
    published_to_friends: true,  // boolean, not array
    author_id: this.userId,
    published_at: new Date().toISOString(),
    discovery_count: 0,
    attribution: 'user',
    moderation_status: 'approved',
    tags: mergedTags,
    original_memory_id: request.payload.memory_id,
  };

  try {
    const result = await friendsCollection.data.insert({
      properties: friendsMemory,
    });
    successfulPublications.push('friends');
    await this.memoryIndex.index(result, friendsCollectionName);
  } catch (error: any) {
    const msg = error?.message || String(error);
    failedPublications.push(`friends: ${msg}`);
  }
}
```

### 5. Update Source Memory Tracking

After publishing, update source memory:
```typescript
const published_to_friends = friends ? true : (existingPublishedToFriends || false);

if (published_to_friends !== existingPublishedToFriends) {
  try {
    await this.userCollection.data.update({
      id: request.payload.memory_id,
      properties: { published_to_friends },
    });
  } catch (error: any) {
    this.logger.warn('Failed to update published_to_friends tracking', {
      memoryId: request.payload.memory_id,
      error: error?.message || String(error),
    });
  }
}
```

### 6. Implement Friends Retraction in executeRetract()

After groups retraction loop, add:
```typescript
// Retract from friends
if (friends && currentPublishedToFriends) {
  const friendsCollectionName = getCollectionName(CollectionType.FRIENDS, this.userId);
  const exists = await this.weaviateClient.collections.exists(friendsCollectionName);

  if (exists) {
    const friendsCollection = this.weaviateClient.collections.get(friendsCollectionName);
    try {
      await friendsCollection.data.deleteById(weaviateId);
      successfulRetractions.push('friends');
      await this.memoryIndex.remove(weaviateId);
    } catch (error: any) {
      const msg = error?.message || String(error);
      failedRetractions.push(`friends: ${msg}`);
    }
  }
}

// Update source memory tracking
const newPublishedToFriends = (friends && currentPublishedToFriends) ? false : currentPublishedToFriends;

if (newPublishedToFriends !== currentPublishedToFriends) {
  try {
    await this.userCollection.data.update({
      id: request.payload.memory_id,
      properties: { published_to_friends: newPublishedToFriends },
    });
  } catch (error: any) {
    this.logger.warn('Failed to update published_to_friends tracking', {
      memoryId: request.payload.memory_id,
      error: error?.message || String(error),
    });
  }
}
```

### 7. Implement Friends Revision in executeRevise()

After groups revision loop, add:
```typescript
// Revise in friends collection
if (publishedToFriends) {
  const friendsCollectionName = getCollectionName(CollectionType.FRIENDS, this.userId);
  const exists = await this.weaviateClient.collections.exists(friendsCollectionName);

  if (exists) {
    const friendsCollection = this.weaviateClient.collections.get(friendsCollectionName);
    try {
      await friendsCollection.data.update({
        id: weaviateId,
        properties: revisedProperties,
      });
      results.push({ collection: friendsCollectionName, status: 'success' });
    } catch (error: any) {
      results.push({
        collection: friendsCollectionName,
        status: 'failed',
        error: error?.message || String(error),
      });
    }
  }
}
```

### 8. Update ConfirmResult Interface

Add `published_to_friends` field:
```typescript
export interface ConfirmResult {
  action: string;
  success: boolean;
  composite_id?: string;
  published_to?: string[];
  retracted_from?: string[];
  revised_at?: string;
  space_ids?: string[];
  group_ids?: string[];
  published_to_friends?: boolean;  // NEW
  failed?: string[];
  results?: RevisionResult[];
  memory_id?: string;
}
```

Update return statements in `executePublish()`, `executeRetract()`, `executeRevise()`:
```typescript
return {
  action: 'publish_memory',
  success: true,
  composite_id: compositeId,
  published_to: successfulPublications,
  failed: failedPublications.length > 0 ? failedPublications : undefined,
  space_ids: finalSpaceIds,
  group_ids: finalGroupIds,
  published_to_friends: friends,  // NEW
};
```

### 9. Update Weaviate Schema

**File**: `src/database/weaviate/v2-collections.ts`

Ensure `published_to_friends` field exists:
```typescript
{ name: 'published_to_friends', dataType: configure.dataType.BOOLEAN },
```

(This should already exist from Task 493)

### 10. Run Tests

```bash
npm test
```

Verify all existing tests pass.

---

## Verification Checklist

- [ ] `PublishInput`, `RetractInput`, `ReviseInput` interfaces extended with `friends?: boolean`
- [ ] Validation logic updated for all three operations
- [ ] Confirmation token payloads include `friends` field
- [ ] `executePublish()` writes to `Memory_friends_<user_id>` when `friends: true`
- [ ] Source memory `published_to_friends` tracking updated after publish
- [ ] `executeRetract()` deletes from friends collection when `friends: true`
- [ ] Source memory `published_to_friends` tracking updated after retract
- [ ] `executeRevise()` updates friends collection when applicable
- [ ] `ConfirmResult` interface includes `published_to_friends?: boolean`
- [ ] All return statements include `published_to_friends` field
- [ ] All 1,706 tests passing
- [ ] No TypeScript errors

---

## Expected Outcome

### Files Modified
- `src/services/space.service.ts` - Main implementation

### Behavior Changes
- `publish({ friends: true })` → writes to `Memory_friends_<my_user_id>`
- `retract({ friends: true })` → deletes from `Memory_friends_<my_user_id>`
- `revise({ memory_id })` → updates friends collection if published there
- Source memory tracks `published_to_friends: boolean`
- `ConfirmResult` returns `published_to_friends` status

### API Compatibility
- Backward compatible (friends is optional)
- Existing code unaffected

---

## Notes

- **Single collection model**: Unlike groups (multiple), friends uses ONE collection per user
- **Boolean flag**: Not an array of friend IDs - all friends access is implicit
- **Access control**: Enforced in search via `AuthContext.credentials.friend_user_ids` (Task 495)
- **No partial retraction**: It's all-or-nothing (boolean can't be partially true)
- **Deduplication**: Friends tier 3 (spaces=1, groups=2, friends=3, users=4)

---

**Status**: Ready to implement
**Next**: Task 495 (Friends Collection Search Support)
