# Task 507: Delete with Hierarchy

**Milestone**: M74 — Hierarchical Relationships
**Status**: pending
**Estimated Hours**: 2
**Dependencies**: T505

---

## Objective

Handle hierarchy cleanup when deleting relationships — orphan children on parent delete, update parent on child delete.

## Steps

1. In `delete()` for parent relationships:
   - Find all children (relationship_ids)
   - Clear `parent_relationship_id` on each child
   - Children become standalone relationships (no cascade delete)

2. In `delete()` for child relationships:
   - If relationship has `parent_relationship_id`, update parent:
     - Remove child ID from parent's `relationship_ids`
     - Decrement parent's `child_relationship_count`

3. Add unit tests:
   - Delete parent: children orphaned, still exist as standalone
   - Delete child: parent's relationship_ids updated
   - Delete standalone relationship (no hierarchy): unchanged behavior

## Verification

- [ ] No cascade deletion
- [ ] Children orphaned correctly
- [ ] Parent updated when child deleted
- [ ] Existing delete behavior preserved for non-hierarchical relationships
