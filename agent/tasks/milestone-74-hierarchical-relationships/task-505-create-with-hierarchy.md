# Task 505: Create with Hierarchy

**Milestone**: M74 — Hierarchical Relationships
**Status**: pending
**Estimated Hours**: 3
**Dependencies**: T503, T504

---

## Objective

Extend `RelationshipService.create()` to accept `relationship_ids` and set up bidirectional parent-child links.

## Steps

1. Extend `CreateRelationshipInput` with optional `relationship_ids: string[]`

2. In `create()`:
   - Call `validateRelationshipIds()` if provided
   - Store `relationship_ids` and `child_relationship_count` on new relationship
   - Set `parent_relationship_id` on each child relationship (update each child doc)

3. Add unit tests:
   - Create umbrella with child relationships
   - Create umbrella with both memory_ids and relationship_ids
   - Children have `parent_relationship_id` set correctly
   - `child_relationship_count` matches array length
   - Invalid relationship_ids rejected

## Verification

- [ ] Umbrella relationships created correctly
- [ ] Bidirectional links established
- [ ] Denormalized counts accurate
