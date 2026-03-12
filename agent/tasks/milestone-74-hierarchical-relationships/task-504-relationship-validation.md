# Task 504: Relationship Validation

**Milestone**: M74 — Hierarchical Relationships
**Status**: pending
**Estimated Hours**: 3

---

## Objective

Add `validateRelationshipIds()` to RelationshipService with doc_type checking, deletion checking, and circular reference detection.

## Steps

1. Create `validateRelationshipIds(collection, relationshipIds, selfId?)` method:
   - Fetch each ID, assert `doc_type === 'relationship'`
   - Assert not deleted
   - If `selfId` provided, walk `parent_relationship_id` chain to detect cycles

2. Add unit tests:
   - Valid relationship IDs pass
   - Non-existent ID throws NotFoundError
   - Memory ID (wrong doc_type) throws ValidationError
   - Deleted relationship throws ValidationError
   - Circular reference detected and rejected
   - Deep chain (3+ levels) cycle detection works

## Verification

- [ ] Validation rejects invalid relationship IDs
- [ ] Cycle detection prevents self-reference and ancestor loops
- [ ] Tests in `relationship.service.spec.ts`
