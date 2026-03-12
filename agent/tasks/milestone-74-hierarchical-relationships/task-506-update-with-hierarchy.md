# Task 506: Update with Hierarchy

**Milestone**: M74 — Hierarchical Relationships
**Status**: pending
**Estimated Hours**: 3
**Dependencies**: T503, T504

---

## Objective

Extend `RelationshipService.update()` with `add_relationship_ids` and `remove_relationship_ids` operations.

## Steps

1. Extend `UpdateRelationshipInput`:
   - `add_relationship_ids?: string[]`
   - `remove_relationship_ids?: string[]`

2. In `update()`:
   - Validate new relationship IDs (cycle detection with selfId)
   - Deduplicate against existing relationship_ids
   - Update `child_relationship_count`
   - Set `parent_relationship_id` on added children
   - Clear `parent_relationship_id` on removed children

3. Add unit tests:
   - Add child relationships to existing umbrella
   - Remove child relationships
   - Deduplicate (adding existing child is no-op)
   - Cycle detection on update (can't add ancestor as child)
   - parent_relationship_id updated on children

## Verification

- [ ] Add/remove child relationships works correctly
- [ ] Bidirectional links maintained
- [ ] Cycle detection prevents invalid updates
