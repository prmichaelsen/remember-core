# Task 518: RelationshipService Integration

**Milestone**: M77 — Ordered Relationships
**Status**: Not Started
**Estimated Hours**: 4
**Dependencies**: [Task 516](task-516-schema-and-types.md), [Task 517](task-517-reorder-logic.md)

---

## Objective

Wire the reorder logic into RelationshipService. Add `reorder()` method, auto-ordering on create/update, sorted reads, and lazy backfill.

## Steps

1. **`reorder()` method**:
   - Fetch relationship, check version matches (409 if stale)
   - Parse `member_order_json` via `parseMemberOrder()`
   - Call `applyReorder()` with the operation
   - Write back `member_order_json`, increment `version`, update `updated_at`
   - Return updated relationship

2. **`create()` changes**:
   - After creating the relationship, populate `member_order_json` using `buildDefaultOrder(memory_ids)` (positions follow input order)

3. **`update()` changes**:
   - `add_memory_ids`: Parse current order, append new IDs at positions N, N+1, etc., serialize back
   - `remove_memory_ids`: Parse current order, remove IDs, compact remaining positions, serialize back

4. **Read path changes** (getById, findByMemoryIds, search):
   - Parse `member_order_json` into `member_order` field on returned relationship objects
   - Sort `related_memory_ids` by position when `member_order` exists
   - **Lazy backfill**: If `member_order_json` is null/empty on a relationship with members, generate default order from `related_memory_ids` array position. Optionally write it back (or just return it without persisting — cheaper).

5. **Tests** in `src/services/relationship.service.spec.ts`:
   - `reorder()` happy path for each operation
   - Version mismatch → error
   - Auto-order on create
   - Append on add_memory_ids
   - Compact on remove_memory_ids
   - Sorted reads
   - Lazy backfill for legacy relationships

## Verification

- [ ] `reorder()` works for all 5 operation types
- [ ] Stale version reorder returns conflict error
- [ ] Created relationships have member_order_json populated
- [ ] add_memory_ids appends to end of order
- [ ] remove_memory_ids compacts order
- [ ] related_memory_ids returned in position order
- [ ] Legacy relationships without member_order_json get default order on read
- [ ] All existing relationship tests still pass
