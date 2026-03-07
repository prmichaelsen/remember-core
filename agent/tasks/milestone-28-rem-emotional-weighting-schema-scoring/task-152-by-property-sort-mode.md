# Task 152: byProperty Sort Mode

**Milestone**: [M28 - REM Emotional Weighting — Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 3 hours
**Dependencies**: Task 145
**Status**: Not Started

---

## Objective

Implement a generic byProperty sort mode that sorts memories by any Weaviate property value, supporting ascending and descending order.

---

## Context

With 37 new properties on memories, users and applications need the ability to sort by any of them — e.g., "show me memories sorted by total_significance descending" or "sort by feel_nostalgia descending." byProperty is a pure sort mode (no vector search involved) that accepts a property name and direction, making it fully generic and future-proof for any new properties added later.

---

## Steps

### 1. Add byProperty to sort_mode Enum
Add `byProperty` as a new value in the sort_mode enum. When selected, require `sort_field` (any valid property name) and `sort_direction` (asc/desc) parameters.

### 2. Implement in MemoryService and SpaceService
Implement byProperty sorting in both MemoryService and SpaceService search methods. Use Weaviate's native sort capability (not vector search) to order results by the specified property.

### 3. Add to Search APIs
Wire byProperty into the search API endpoints. Validate that sort_field corresponds to an actual Weaviate property. Support limit and offset for pagination.

### 4. Update OpenAPI Spec and Types
Add byProperty to the sort_mode enum in OpenAPI specs. Document the sort_field and sort_direction parameters.

---

## Verification

- [ ] `sort_mode: 'byProperty'` accepted by space search, space query, and memory search
- [ ] sort_field accepts any valid Weaviate property name (feel_*, functional_*, total_significance, etc.)
- [ ] sort_direction supports both 'asc' and 'desc'
- [ ] Results correctly ordered by the specified property and direction
- [ ] Invalid sort_field returns a clear error
- [ ] Pagination (limit, offset) works with byProperty
- [ ] No vector search involved (pure sort)
- [ ] OpenAPI spec updated with byProperty, sort_field, sort_direction
- [ ] Tests pass

---

## Expected Output

A generic byProperty sort mode available across all search APIs that sorts memories by any Weaviate property in ascending or descending order, with proper validation and pagination support.

---

**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
