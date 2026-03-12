# Task 503: Type & Schema Changes

**Milestone**: M74 — Hierarchical Relationships
**Status**: pending
**Estimated Hours**: 2

---

## Objective

Add hierarchy fields to the Relationship type and Weaviate schema.

## Steps

1. Add to `Relationship` interface in `src/types/memory.types.ts`:
   - `relationship_ids?: string[]` — child relationship IDs
   - `parent_relationship_id?: string` — inverse pointer to parent
   - `child_relationship_count?: number` — denormalized count

2. Add to `COMMON_MEMORY_PROPERTIES` in `src/database/weaviate/v2-collections.ts`:
   - `relationship_ids` (TEXT_ARRAY)
   - `parent_relationship_id` (TEXT)
   - `child_relationship_count` (INT)

3. Update barrel exports if needed

## Verification

- [ ] TypeScript compiles with new fields
- [ ] Weaviate auto-reconciliation adds properties (no migration needed)
- [ ] Existing tests still pass
