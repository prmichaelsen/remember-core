# Task 190: Unit Tests

**Objective**: Comprehensive unit tests for byMyRatings on RatingService
**Estimated Hours**: 3
**Dependencies**: [Task 186](task-186-my-ratings-types-browse-mode.md), [Task 187](task-187-search-mode-hybrid-intersection.md), [Task 188](task-188-edge-cases.md)
**Design Reference**: [byMyRatings Sort Mode](../../design/local.by-my-ratings-sort-mode.md)

---

## Steps

### 1. Add tests to `src/services/rating.service.spec.ts`

Colocated with the service file (per project convention — NEVER use `__tests__/`).

### 2. Test cases

**Browse mode**:
- Sort by `rated_at` desc (default)
- Sort by `rating` desc
- Sort by `rating` asc
- Pagination: offset=10, limit=5 returns correct slice
- Empty ratings: returns `{ items: [], total: 0 }`

**Scope filtering**:
- No spaces/groups: returns all rated memories
- Single space: returns only memories in that space's collection
- Single group: returns only memories in that group's collection
- Multiple spaces + groups: returns union
- Personal collection only: filter by user's personal collection name

**Star filter**:
- `{ min: 5, max: 5 }`: only 5-star rated
- `{ min: 1, max: 2 }`: only 1-2 star rated
- `{ min: 3, max: 5 }`: 3-5 star range
- No filter: all ratings included

**Search mode**:
- Query intersects with rated set — only rated memories matching query returned
- Results from multiple collections merged
- Metadata attached to search results

**Edge cases**:
- Unavailable memory: stub with `unavailable: true`
- Deleted memory: included with `deleted: true`
- Rating doc missing `collectionName`: fallback lookup or unavailable
- User with 0 ratings + search query: empty results

**rate() dual-write update**:
- Verify `rate()` now writes `collectionName` to user-rating doc

### 3. Mock setup

- Mock `queryDocuments` to return test rating docs
- Mock Weaviate collection `fetchObjects` / `fetchMemoryWithAllProperties`
- Mock `MemoryIndexService.lookup()` for fallback resolution

---

## Verification

- [ ] All test cases listed above are implemented
- [ ] Tests colocated in `rating.service.spec.ts`
- [ ] All tests pass
- [ ] No existing tests broken
- [ ] Coverage for browse mode, search mode, scope filter, star filter, edge cases
