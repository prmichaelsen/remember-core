# Milestone 74: Hierarchical Relationships

**ID**: M74
**Status**: pending
**Progress**: 0% (0/7 tasks completed)
**Started**: (not yet)
**Estimated Duration**: 1-2 weeks
**Completed**: (not yet)

---

## Goal

Allow relationships to contain child relationships via a `relationship_ids` field, enabling umbrella/parent-child grouping. Update the REST API to expose hierarchy operations.

---

## Overview

Relationships are currently flat — each references memory IDs only. This milestone adds a separate `relationship_ids` array so a relationship can reference child relationships, forming a tree. A parent relationship (e.g., "autonomous film") groups sub-relationships (e.g., "technical notes", "script snippets") under one navigable hierarchy.

**Design**: [agent/design/local.hierarchical-relationships.md](../design/local.hierarchical-relationships.md)

---

## Context

**Problem**: Users can't organize related clusters under a single umbrella. REM discovers thematically related clusters but has no way to express that they belong to the same project/topic.

**Solution**: Add `relationship_ids`, `parent_relationship_id`, and `child_relationship_count` to the Relationship type. Extend RelationshipService CRUD with validation, cycle detection, and hierarchy traversal. Update OpenAPI spec and REST handlers.

---

## Tasks

| Task | Name | Status | Est. Hours |
|------|------|--------|-----------|
| T503 | Type & Schema Changes | pending | 2h |
| T504 | Relationship Validation | pending | 3h |
| T505 | Create with Hierarchy | pending | 3h |
| T506 | Update with Hierarchy | pending | 3h |
| T507 | Delete with Hierarchy | pending | 2h |
| T508 | Query & Flatten Utilities | pending | 3h |
| T509 | OpenAPI & REST Handlers | pending | 3h |

**Total estimated**: ~19 hours

---

## Success Criteria

- [ ] Relationships can contain child relationship IDs
- [ ] Circular references are detected and rejected
- [ ] Parent deletion orphans children (no cascade)
- [ ] Child deletion updates parent's relationship_ids
- [ ] `flattenMemoryIds()` returns transitive closure with depth limit
- [ ] OpenAPI spec includes hierarchy fields and endpoints
- [ ] All existing relationship tests continue passing
- [ ] New tests cover all hierarchy CRUD operations and edge cases

---

## Dependencies

- None (builds on existing RelationshipService)
