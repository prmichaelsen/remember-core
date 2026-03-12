# Task 508: Query & Flatten Utilities

**Milestone**: M74 — Hierarchical Relationships
**Status**: pending
**Estimated Hours**: 3
**Dependencies**: T503

---

## Objective

Add hierarchy traversal methods: `findChildRelationships()`, `getHierarchy()`, and `flattenMemoryIds()`.

## Steps

1. `findChildRelationships(collection, parentId)`:
   - Filter by `parent_relationship_id === parentId`
   - Return child relationships

2. `getHierarchy(collection, rootId, maxDepth = 5)`:
   - Recursive traversal building a tree structure
   - Depth-limited to prevent runaway queries
   - Returns `RelationshipTree` type (relationship + children array)

3. `flattenMemoryIds(collection, relationshipId, maxDepth = 5)`:
   - Collect all transitive memory_ids from relationship and descendants
   - Deduplicate
   - Return flat string array

4. Add unit tests:
   - findChildRelationships returns direct children only
   - getHierarchy builds correct tree (2-3 levels)
   - getHierarchy respects depth limit
   - flattenMemoryIds collects transitive closure
   - flattenMemoryIds deduplicates shared members
   - Empty hierarchy (no children) returns own memory_ids

## Verification

- [ ] All three methods work correctly
- [ ] Depth limit prevents infinite recursion
- [ ] Deduplication in flatten
