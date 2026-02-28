# Task 23: Wire Ghost Filtering into MemoryService Methods

**Milestone**: [M6 - Ghost/Trust Integration](../../milestones/milestone-6-ghost-memory-service-integration.md)
**Estimated Time**: 3 hours
**Dependencies**: Task 22
**Status**: Not Started

---

## Objective

Modify `MemoryService.search()`, `MemoryService.query()`, and `MemoryService.findSimilar()` to apply trust filtering and ghost content exclusion when `ghost_context` is provided.

---

## Steps

### 1. Update MemoryService.search()

When `input.ghost_context` is present:
1. Call `buildTrustFilter(collection, ghost_context.accessor_trust_level)` to get trust filter
2. Unless `ghost_context.include_ghost_content`, add ghost exclusion filter: `content_type != 'ghost'`
3. Combine with existing filters (deleted filter, search filters)

When `ghost_context` is absent:
- Behavior unchanged (no trust filter, no ghost exclusion)
- This preserves backwards compatibility for personal memory searches

Reference implementation (from remember-mcp `search-memory.ts`):
```typescript
const ghostMode = ghost_context;
if (ghostMode) {
  const trustFilter = buildTrustFilter(collection, ghostMode.accessor_trust_level);
  filters.push(trustFilter);
}
if (!ghostMode?.include_ghost_content) {
  filters.push(collection.filter.byProperty('content_type').notEqual('ghost'));
}
```

### 2. Update MemoryService.query()

Same pattern as search(). When ghost_context present:
1. Apply trust filter via `buildTrustFilter()`
2. Apply ghost exclusion filter
3. Combine with existing filters

### 3. Update MemoryService.findSimilar()

When ghost_context present:
1. Apply ghost exclusion filter (currently post-filtered in remember-mcp adapter)
2. Trust filter may not apply to findSimilar (vector search on own collection), but apply ghost exclusion

This eliminates the post-filter workaround in remember-mcp's find-similar adapter.

### 4. Import buildTrustFilter

Add import to memory.service.ts:
```typescript
import { buildTrustFilter } from './trust-enforcement.service.js';
```

---

## Verification

- [ ] `search()` with ghost_context applies trust filter + ghost exclusion
- [ ] `search()` without ghost_context behaves exactly as before
- [ ] `query()` with ghost_context applies trust filter + ghost exclusion
- [ ] `query()` without ghost_context behaves exactly as before
- [ ] `findSimilar()` with ghost_context excludes ghost content
- [ ] `findSimilar()` without ghost_context behaves exactly as before
- [ ] Build passes
- [ ] All existing tests pass
