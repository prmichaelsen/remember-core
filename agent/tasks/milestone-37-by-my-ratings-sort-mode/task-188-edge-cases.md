# Task 188: Edge Cases (Unavailable, Deleted, Empty)

**Objective**: Handle unavailable memories, soft-deleted memories, and empty ratings in byMyRatings
**Estimated Hours**: 2
**Dependencies**: [Task 186](task-186-my-ratings-types-browse-mode.md)
**Design Reference**: [byMyRatings Sort Mode](../../design/local.by-my-ratings-sort-mode.md)

---

## Steps

### 1. Unavailable memories

When `fetchMemoryWithAllProperties` returns null for a rated memory ID (deleted collection, data loss, etc.):

Return a stub:
```typescript
{
  memory: { id: memoryId },
  metadata: { my_rating, rated_at, unavailable: true }
}
```

Do NOT skip the memory — the user's rating data is preserved and visible.

### 2. Soft-deleted memories

When a hydrated memory has `is_deleted: true` (or equivalent deleted marker):

Include it with `deleted: true` in metadata:
```typescript
{
  memory: normalizedDoc,
  metadata: { my_rating, rated_at, deleted: true }
}
```

### 3. Empty ratings

When a user has no rating docs at all, return:
```typescript
{ items: [], total: 0, offset: 0, limit: 50 }
```

### 4. Rating docs without collectionName

For rating docs written before the backfill (task 185), `collectionName` may be missing. Handle gracefully:
- Attempt `MemoryIndexService.lookup(memoryId)` as fallback
- If lookup fails, include as unavailable stub
- Log a warning for monitoring

---

## Verification

- [ ] Unavailable memories return stubs with `unavailable: true`
- [ ] Deleted memories included with `deleted: true` in metadata
- [ ] Empty ratings return empty items array (not error)
- [ ] Rating docs missing collectionName handled gracefully (fallback lookup or unavailable)
- [ ] No crashes on any edge case
