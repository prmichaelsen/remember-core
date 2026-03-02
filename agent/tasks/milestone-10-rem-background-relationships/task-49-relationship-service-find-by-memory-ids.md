# Task 49: RelationshipService extension — findByMemoryIds

**Milestone**: [M10 - REM Background Relationships](../../milestones/milestone-10-rem-background-relationships.md)
**Estimated Time**: 3 hours
**Dependencies**: [Task 48](task-48-schema-source-field.md)
**Status**: Not Started

---

## Objective

Add a `findByMemoryIds()` method to `RelationshipService` that returns all relationships in a collection that share any memory IDs with a given set. This is the core primitive REM needs for deduplication — checking whether a candidate cluster overlaps with existing relationships.

---

## Context

REM's dedup logic needs to: given a set of candidate memory IDs, find all existing relationships that contain any of those IDs. Then it computes overlap ratios to decide merge vs. create-new. Currently `RelationshipService` only has `search()` (hybrid text search) which doesn't support filtering by `related_memory_ids` membership.

---

## Steps

### 1. Define input/output types

```typescript
export interface FindByMemoryIdsInput {
  memory_ids: string[];       // Memory IDs to search for overlap
  source_filter?: RelationshipSource;  // Optional: only 'rem' relationships
  limit?: number;             // Default: 100
}

export interface FindByMemoryIdsResult {
  relationships: Record<string, unknown>[];
  total: number;
}
```

### 2. Implement findByMemoryIds()

Query Weaviate for documents where:
- `doc_type = 'relationship'`
- `related_memory_ids` contains any of the input `memory_ids`

Use Weaviate `containsAny` filter on `related_memory_ids` property. Optionally filter by `source`.

### 3. Add overlap computation utility

```typescript
export function computeOverlap(
  existing: string[],    // existing relationship's memory_ids
  candidate: string[],   // candidate cluster's memory_ids
): number  // 0-1 ratio: |intersection| / |candidate|
```

Export from the service or as a standalone utility.

### 4. Update barrel exports

Export new types and method from `services/index.ts`.

### 5. Add tests

Colocated in `relationship.service.spec.ts`:
- findByMemoryIds returns matching relationships
- findByMemoryIds with source_filter
- findByMemoryIds with no matches returns empty
- computeOverlap calculates correct ratio

---

## Verification

- [ ] `findByMemoryIds()` method exists on RelationshipService
- [ ] Returns relationships that share any memory IDs with input set
- [ ] `source_filter` works (e.g., only `'rem'` relationships)
- [ ] `computeOverlap()` correctly computes intersection ratio
- [ ] 4+ new tests pass
- [ ] Existing tests still pass
- [ ] Build compiles

---

**Next Task**: [Task 50: Collection enumeration and Firestore REM state](task-50-collection-enumeration-firestore-state.md)
**Related Design Docs**: [REM Design](../../design/local.rem-background-relationships.md) (Deduplication section)
