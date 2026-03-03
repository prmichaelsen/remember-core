# Task 40: Add byDensity Sort Mode to MemoryService

**Milestone**: [M11 - Basic Sort Modes](../../milestones/milestone-11-basic-sort-modes.md)
**Estimated Time**: 30 minutes
**Dependencies**: Tasks 37, 38, 39 (relationship_count must exist, be populated, and maintained)
**Status**: Not Started

---

## Objective

Implement density sorting using the `relationship_count` property. Add `byDensity()` method to MemoryService that returns memories sorted by number of relationships (highest first), enabling users to discover highly-connected memories.

---

## Context

Density mode shows memories that are most interconnected - those that appear in many relationships. This helps users discover "hub" memories that tie together many concepts.

Now that `relationship_count` exists and is maintained, we can use Weaviate's native sort to implement this efficiently server-side.

This completes the Phase 1 MVP trio: Smart (hybrid search), Time (chronological), and Density (relationship-based).

---

## Steps

### 1. Define DensityModeRequest Interface

Add to MemoryService types:

```typescript
export interface DensityModeRequest {
  limit?: number;           // Default 50
  offset?: number;          // Default 0
  min_relationship_count?: number; // Optional filter
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface DensityModeResult {
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}
```

### 2. Add byDensity() Method to MemoryService

Add method after `byTime()`:

```typescript
async byDensity(input: DensityModeRequest): Promise<DensityModeResult> {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  // Build filters
  const memoryFilters = buildMemoryOnlyFilters(this.collection, input.filters);

  // Ghost/trust filtering
  const ghostFilters: any[] = [];
  if (input.ghost_context) {
    ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
  }
  if (!input.ghost_context?.include_ghost_content) {
    ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
  }

  // Min relationship count filter
  const densityFilters: any[] = [];
  if (input.min_relationship_count !== undefined) {
    densityFilters.push(
      this.collection.filter.byProperty('relationship_count').greaterThanOrEqual(input.min_relationship_count)
    );
  }

  const executeQuery = async (useDeletedFilter: boolean) => {
    const deletedFilter = useDeletedFilter
      ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
      : null;

    const combinedFilters = combineFiltersWithAnd(
      [deletedFilter, memoryFilters, ...ghostFilters, ...densityFilters].filter((f) => f !== null),
    );

    const queryOptions: any = {
      limit: limit + offset,
      sort: [
        {
          property: 'relationship_count',
          order: 'desc', // Highest first
        }
      ],
    };

    if (combinedFilters) {
      queryOptions.filters = combinedFilters;
    }

    return this.collection.query.fetchObjects(queryOptions);
  };

  const results = await this.retryWithoutDeletedFilter(executeQuery);
  const paginated = results.objects.slice(offset);

  const memories: Record<string, unknown>[] = [];
  for (const obj of paginated) {
    const doc = { id: obj.uuid, ...obj.properties };
    if (doc.doc_type === 'memory') {
      memories.push(doc);
    }
  }

  return {
    memories,
    total: memories.length,
    offset,
    limit,
  };
}
```

### 3. Export New Types

Update exports:

```typescript
export type {
  // ... existing exports
  DensityModeRequest,
  DensityModeResult,
};
```

### 4. Add Unit Tests

Update `src/services/memory.service.spec.ts`:

```typescript
describe('MemoryService.byDensity', () => {
  it('should sort memories by relationship_count descending', async () => {
    // Create memories with different relationship counts
    const memory1 = await createTestMemory({ relationship_count: 5 });
    const memory2 = await createTestMemory({ relationship_count: 10 });
    const memory3 = await createTestMemory({ relationship_count: 2 });

    const result = await memoryService.byDensity({ limit: 10 });

    expect(result.memories.length).toBeGreaterThan(0);
    // Verify descending order
    for (let i = 0; i < result.memories.length - 1; i++) {
      const current = result.memories[i].relationship_count as number;
      const next = result.memories[i + 1].relationship_count as number;
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  it('should filter by min_relationship_count', async () => {
    const result = await memoryService.byDensity({
      limit: 10,
      min_relationship_count: 5,
    });

    for (const memory of result.memories) {
      expect(memory.relationship_count).toBeGreaterThanOrEqual(5);
    }
  });

  it('should respect pagination', async () => {
    const page1 = await memoryService.byDensity({ limit: 5, offset: 0 });
    const page2 = await memoryService.byDensity({ limit: 5, offset: 5 });

    expect(page1.memories.length).toBe(5);
    expect(page2.memories.length).toBe(5);
    expect(page1.memories[0].id).not.toBe(page2.memories[0].id);
  });

  it('should apply filters correctly', async () => {
    const result = await memoryService.byDensity({
      limit: 10,
      filters: {
        content_type: ['note'],
      },
    });

    for (const memory of result.memories) {
      expect(memory.content_type).toBe('note');
    }
  });

  it('should include memories with zero relationships', async () => {
    const memory = await createTestMemory({ relationship_count: 0 });

    const result = await memoryService.byDensity({
      limit: 100,
      // No min filter, should include all
    });

    const found = result.memories.find(m => m.id === memory.id);
    expect(found).toBeDefined();
    expect(found.relationship_count).toBe(0);
  });
});
```

---

## Verification

- [ ] `byDensity()` method added to MemoryService
- [ ] Method uses Weaviate's native sort (no client-side sorting)
- [ ] Sorts by `relationship_count` descending (highest first)
- [ ] `min_relationship_count` filter works
- [ ] Pagination works (offset/limit respected)
- [ ] Other filters apply correctly (content_type, tags, etc.)
- [ ] Ghost content filtering works
- [ ] Trust filtering works (if ghost_context provided)
- [ ] Deleted filter works
- [ ] Includes memories with 0 relationships (unless filtered)
- [ ] Unit tests pass
- [ ] TypeScript compiles without errors

---

## Expected Output

**Method Signature**:
```typescript
async byDensity(input: DensityModeRequest): Promise<DensityModeResult>
```

**Example Usage**:
```typescript
// Get 50 most connected memories
const hubs = await memoryService.byDensity({ limit: 50 });

// Only show memories with 5+ relationships
const wellConnected = await memoryService.byDensity({
  limit: 20,
  min_relationship_count: 5,
});

// Filter by content type
const connectedNotes = await memoryService.byDensity({
  limit: 10,
  filters: { content_type: ['note'] },
});
```

**Example Result**:
```typescript
{
  memories: [
    { id: 'abc', content: 'Hub memory', relationship_count: 25 },
    { id: 'def', content: 'Well connected', relationship_count: 18 },
    { id: 'ghi', content: 'Some links', relationship_count: 7 },
    { id: 'jkl', content: 'Few links', relationship_count: 2 },
    { id: 'mno', content: 'Isolated', relationship_count: 0 },
  ],
  total: 5,
  offset: 0,
  limit: 50,
}
```

---

## Common Issues and Solutions

### Issue 1: Memories with null relationship_count
**Symptom**: Some memories missing from results or errors
**Solution**: Ensure backfill script (Task 38) completed successfully. Re-run if needed.

### Issue 2: Counts don't match actual relationships
**Symptom**: Memory shows relationship_count=5 but has 3 relationships
**Solution**: Relationship count may be stale. Run backfill script to reset. Verify RelationshipService maintenance (Task 39) is working.

### Issue 3: Performance issues with large result sets
**Symptom**: Slow queries
**Solution**: Add reasonable limit (50-100). Consider adding indexes on relationship_count if not already indexed.

---

## Resources

- [Weaviate Query API - Sort](https://weaviate.io/developers/weaviate/api/graphql/search-operators#sort): Documentation for sort parameter
- [Design Doc](../../design/memory-sorting-algorithms.md): Full design for memory sorting system
- [MemoryService Source](../../src/services/memory.service.ts): Existing service implementation

---

## Notes

- Completes the Phase 1 MVP trio (Smart, Time, Density)
- Smart mode uses existing `search()` method
- Time and Density are new server-side implementations
- All three modes use native Weaviate features
- Ready for REST endpoint exposure (remember-rest-service)
- Phase 2 will add advanced features (analytics, reputation, REM curation)

---

**Next Task**: REST endpoint implementation (remember-rest-service repository)
**Related Design Docs**: [memory-sorting-algorithms.md](../../design/memory-sorting-algorithms.md)
**Estimated Completion Date**: TBD
