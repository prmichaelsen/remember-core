# Task 37: Add relationship_count Property to Memory Schema

**Milestone**: [M11 - Basic Sort Modes](../../milestones/milestone-11-basic-sort-modes.md)
**Estimated Time**: 15 minutes
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add a denormalized `relationship_count` property to the Memory type and schema. This property mirrors `relationships.length` as a scalar field, enabling efficient server-side sorting by relationship density in Weaviate.

---

## Context

Weaviate cannot sort by array length (`relationships.length`) natively. To enable density sorting (showing memories with most relationships first), we need a scalar property that Weaviate can sort on.

This is a denormalized field - the source of truth remains the `relationships` array, but `relationship_count` is maintained for query performance.

---

## Steps

### 1. Update Memory Interface

Edit `src/types/memory.types.ts` and add the property (around line 108, after `relationships`):

```typescript
export interface Memory {
  // ... existing fields

  // Relationships
  relationships: string[]; // IDs of relationship documents
  relationship_count: number; // Denormalized count for sorting (NEW)

  // Access Tracking (for weight calculation)
  access_count: number;
  // ...
}
```

### 2. Update Schema Definition (if exists)

If schema management exists in `src/database/weaviate/schema.ts`, add the property:

```typescript
{
  name: 'relationship_count',
  dataType: ['int'],
  description: 'Count of relationships this memory belongs to (denormalized for sorting)',
  indexSearchable: false,
  indexFilterable: true, // Enable filtering by count
}
```

### 3. Update createMemory Default

In `src/services/memory.service.ts`, ensure new memories initialize with `relationship_count: 0`:

```typescript
async create(input: CreateMemoryInput): Promise<CreateMemoryResult> {
  // ...
  const properties: Record<string, unknown> = {
    // ...existing properties
    relationships: [],
    relationship_count: 0, // Initialize to 0
    // ...
  };
  // ...
}
```

---

## Verification

- [ ] `relationship_count: number` added to Memory interface
- [ ] Property added to schema definition (if schema file exists)
- [ ] New memories initialize with `relationship_count: 0`
- [ ] TypeScript compiles without errors
- [ ] No existing tests broken by new property

---

## Expected Output

**Memory Interface**:
```typescript
export interface Memory {
  // ...
  relationships: string[];
  relationship_count: number; // NEW
  // ...
}
```

---

## Notes

- This property will be maintained by RelationshipService (Task 39)
- Existing memories will be backfilled via migration script (Task 38)
- Property should never be manually set by users
- Source of truth remains the `relationships` array

---

**Next Task**: [task-38-backfill-relationship-count.md](task-38-backfill-relationship-count.md)
**Related Design Docs**: [memory-sorting-algorithms.md](../../design/memory-sorting-algorithms.md)
