# Task 495: Friends Collection Search Support

**Milestone**: M72 - Friends Collection Sharing
**Status**: pending
**Estimated Hours**: 3-4 hours
**Created**: 2026-03-11
**Dependencies**: Task 494 (Friends Publish/Retract)

---

## Objective

Add friends collection search support to SpaceService using client-provided ranked friend lists with bounded fanout (max 50 friends per query).

---

## Context

From clarification-1-friends-collection-model.md:
- Search accepts `friends: string[]` (array of friend user IDs to query)
- Client ranks friends and passes top 50 (bounded fanout to avoid 1000+ collection queries)
- Loops through `Memory_friends_<friend_id>` for each friend
- Returns `friends_searched: string[]` in result
- **Security**: Per-user collections provide collection-level isolation (safer than shared collection)
- **Ranking**: Handled client-side in agentbase.me via `/api/search/friends` route

**Pattern**: Follows groups search pattern (loop through collections), not spaces (single collection).

---

## Steps

### 1. Extend SearchSpaceInput Interface

**File**: `src/services/space.service.ts`

```typescript
export interface SearchSpaceInput {
  query: string;
  spaces?: string[];
  groups?: string[];
  friends?: string[];  // NEW - array of friend user IDs (client-ranked)
  search_type?: 'hybrid' | 'bm25' | 'semantic';
  content_type?: string;
  tags?: string[];
  author_ids?: string[];
  moderation_filter?: 'pending' | 'approved' | 'rejected';
  limit?: number;
  offset?: number;
  dedupe?: DedupeOptions;
}
```

### 2. Extend SearchSpaceResult Interface

```typescript
export interface SearchSpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  friends_searched: string[];  // NEW - echoes back which friends were queried
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}
```

### 3. Add Friends Validation in search()

After group validation, add:
```typescript
// Validate friends (user IDs)
if (friends.length > 0) {
  const invalidFriends = friends.filter((f) => !f || f.includes('.') || f.trim() === '');
  if (invalidFriends.length > 0) {
    throw new ValidationError('Friend user IDs cannot be empty or contain dots');
  }
}
```

### 4. Update fetchLimit Calculation

Include friends in calculation:
```typescript
const fetchLimit = (limit + offset) * Math.max(
  1,
  groups.length + friends.length + (spaces.length > 0 || (groups.length === 0 && friends.length === 0) ? 1 : 0)
);
```

### 5. Update Spaces Collection Query Condition

Modify to account for friends:
```typescript
// Search spaces collection (when spaces specified or no targets at all)
if (spaces.length > 0 || (groups.length === 0 && friends.length === 0)) {
  // ... existing spaces search logic
}
```

### 6. Implement Friends Search Loop

After groups search loop, add:
```typescript
// Search friends collections
for (const friendUserId of friends) {
  const friendsCollectionName = getCollectionName(CollectionType.FRIENDS, friendUserId);
  const exists = await this.weaviateClient.collections.exists(friendsCollectionName);
  if (!exists) continue;

  const friendsCollection = this.weaviateClient.collections.get(friendsCollectionName);
  const filterList = this.buildBaseFilters(friendsCollection, input);
  const combinedFilters = filterList.length > 0 ? Filters.and(...filterList) : undefined;
  const friendsObjects = await this.executeSearch(friendsCollection, input.query, searchType, combinedFilters, fetchLimit);
  allObjects.push(...tagWithSource(friendsObjects, friendsCollectionName));
}
```

**Note**: No access control check in `search()` itself - enforcement happens at API layer via `AuthContext` validation before calling search.

### 7. Update isAllPublic Logic

Include friends in condition:
```typescript
const isAllPublic = spaces.length === 0 && groups.length === 0 && friends.length === 0;
```

### 8. Update Return Statement

Add `friends_searched` field:
```typescript
return {
  spaces_searched: isAllPublic ? 'all_public' : spaces,
  groups_searched: groups,
  friends_searched: friends,  // NEW
  memories,
  total: memories.length,
  offset,
  limit,
};
```

### 9. Update Other Search Methods

Apply similar changes to:
- `query()` - If it should support friends (check requirements)
- `searchByType()` - If it should support friends
- Any other methods that perform collection searches

**Decision**: For now, only extend `search()`. Other methods can be extended in future tasks if needed.

### 10. Extend UserCredentials Type (Auth Context)

**File**: `src/types/auth.types.ts`

```typescript
export interface UserCredentials {
  user_id: string;
  group_memberships: GroupMembership[];
  friend_user_ids: string[];  // NEW - all friend user IDs (unranked)
}
```

**Note**: This doesn't implement the actual population of `friend_user_ids` - that's handled by CredentialsProvider in the consuming application (agentbase.me). This just defines the type contract.

### 11. Run Tests

```bash
npm test
```

Verify all existing tests pass with new interfaces.

---

## Verification Checklist

- [ ] `SearchSpaceInput` interface extended with `friends?: string[]`
- [ ] `SearchSpaceResult` interface extended with `friends_searched: string[]`
- [ ] Friends validation added (no dots, not empty)
- [ ] `fetchLimit` calculation includes friends count
- [ ] Spaces collection query condition accounts for friends
- [ ] Friends search loop implemented (follows groups pattern)
- [ ] `isAllPublic` logic includes friends check
- [ ] Return statement includes `friends_searched` field
- [ ] `UserCredentials` extended with `friend_user_ids: string[]`
- [ ] All 1,706 tests passing
- [ ] No TypeScript errors

---

## Expected Outcome

### Files Modified
- `src/services/space.service.ts` - Search implementation
- `src/types/auth.types.ts` - UserCredentials extension

### Behavior Changes
- `search({ friends: ['user1', 'user2'] })` → queries those friends' collections
- Returns `friends_searched` array in result
- Bounded fanout (client passes max 50 friends)
- Skips nonexistent collections gracefully

### API Usage Example
```typescript
// Client-side (agentbase.me)
const allFriends = authContext.credentials.friend_user_ids; // from ACL
const rankedFriends = rankFriendsByInteraction(allFriends).slice(0, 50);

const results = await spaceService.search({
  query: 'vacation photos',
  friends: rankedFriends,
  limit: 20
});

// results.friends_searched = ['user1', 'user2', ...] (up to 50)
```

---

## Notes

- **Bounded fanout**: Client must pass ≤50 friends to avoid performance issues
- **Client-side ranking**: agentbase.me implements `/api/search/friends` route with ranking logic
- **Access control**: Enforced at API layer by validating `authContext.credentials.friend_user_ids` contains requested friends
- **Collection-level security**: Per-user collections provide isolation (defense in depth)
- **Dedupe precedence**: Friends tier 3 (spaces=1, groups=2, friends=3, users=4)
- **Graceful skip**: If friend's collection doesn't exist, skip without error

---

**Status**: Ready to implement
**Next**: Task 496 (Friends Collection Tests)
