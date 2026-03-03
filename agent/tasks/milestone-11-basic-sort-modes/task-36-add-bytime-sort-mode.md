# Task 36: Add byTime Sort Mode to MemoryService

**Milestone**: [M11 - Basic Sort Modes](../../milestones/milestone-11-basic-sort-modes.md)
**Estimated Time**: 30 minutes
**Dependencies**: None
**Status**: Not Started

---

## Objective

Implement server-side chronological sorting using Weaviate's native sort capability. Add `byTime()` method to MemoryService that supports both ascending (oldest first) and descending (newest first) sorting by `created_at` timestamp.

---

## Context

The existing `MemoryService.search()` method uses hybrid search (BM25 + vector) which is great for relevance-based queries, but doesn't provide simple chronological browsing. Users need a "Recent" sort mode to view memories in time order.

Weaviate supports native sorting via the `sort` parameter on `query.fetchObjects()`, which is performant and server-side. This avoids the need for client-side sorting which doesn't scale.

This is part of Phase 1 MVP for basic sort modes (see design doc agent/design/memory-sorting-algorithms.md).

---

## Steps

### 1. Define TimeModeRequest Interface

Add the interface to MemoryService types (around line 50):

```typescript
export interface TimeModeRequest {
  limit?: number;           // Default 50
  offset?: number;          // Default 0
  direction?: 'asc' | 'desc'; // Default 'desc' (newest first)
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface TimeModeResult {
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}
```

### 2. Add byTime() Method to MemoryService

Add method after the existing `search()` method:

```typescript
async byTime(input: TimeModeRequest): Promise<TimeModeResult> {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const direction = input.direction ?? 'desc';

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

  const executeQuery = async (useDeletedFilter: boolean) => {
    const deletedFilter = useDeletedFilter
      ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
      : null;

    const combinedFilters = combineFiltersWithAnd(
      [deletedFilter, memoryFilters, ...ghostFilters].filter((f) => f !== null),
    );

    const queryOptions: any = {
      limit: limit + offset,
      sort: [
        {
          property: 'created_at',
          order: direction,
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

Update the exports at the bottom of memory.service.ts:

```typescript
export type {
  // ... existing exports
  TimeModeRequest,
  TimeModeResult,
};
```

### 4. Add Unit Tests

Create or update `src/services/memory.service.spec.ts`:

```typescript
describe('MemoryService.byTime', () => {
  it('should sort memories by created_at descending by default', async () => {
    const result = await memoryService.byTime({ limit: 10 });

    expect(result.memories.length).toBeLessThanOrEqual(10);
    // Verify descending order
    for (let i = 0; i < result.memories.length - 1; i++) {
      const current = new Date(result.memories[i].created_at as string);
      const next = new Date(result.memories[i + 1].created_at as string);
      expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
    }
  });

  it('should sort memories by created_at ascending when specified', async () => {
    const result = await memoryService.byTime({
      limit: 10,
      direction: 'asc',
    });

    // Verify ascending order
    for (let i = 0; i < result.memories.length - 1; i++) {
      const current = new Date(result.memories[i].created_at as string);
      const next = new Date(result.memories[i + 1].created_at as string);
      expect(current.getTime()).toBeLessThanOrEqual(next.getTime());
    }
  });

  it('should respect pagination', async () => {
    const page1 = await memoryService.byTime({ limit: 5, offset: 0 });
    const page2 = await memoryService.byTime({ limit: 5, offset: 5 });

    expect(page1.memories.length).toBe(5);
    expect(page2.memories.length).toBe(5);
    expect(page1.memories[0].id).not.toBe(page2.memories[0].id);
  });

  it('should apply filters correctly', async () => {
    const result = await memoryService.byTime({
      limit: 10,
      filters: {
        content_type: ['note'],
        tags: ['important'],
      },
    });

    for (const memory of result.memories) {
      expect(memory.content_type).toBe('note');
      expect(memory.tags).toContain('important');
    }
  });
});
```

---

## Verification

- [ ] `byTime()` method added to MemoryService
- [ ] Method uses Weaviate's native sort (no client-side sorting)
- [ ] Sorts by `created_at` correctly in both directions
- [ ] Pagination works (offset/limit respected)
- [ ] Filters apply correctly (content_type, tags, etc.)
- [ ] Ghost content filtering works
- [ ] Trust filtering works (if ghost_context provided)
- [ ] Deleted filter works (exclude/include/only)
- [ ] Unit tests pass
- [ ] TypeScript compiles without errors

---

## Expected Output

**Method Signature**:
```typescript
async byTime(input: TimeModeRequest): Promise<TimeModeResult>
```

**Example Usage**:
```typescript
// Get 50 most recent memories
const recent = await memoryService.byTime({ limit: 50 });

// Get oldest memories
const oldest = await memoryService.byTime({
  limit: 50,
  direction: 'asc',
});

// Get recent notes only
const recentNotes = await memoryService.byTime({
  limit: 20,
  filters: { content_type: ['note'] },
});
```

---

## Common Issues and Solutions

### Issue 1: Weaviate doesn't support sort on created_at
**Symptom**: Error message about invalid property for sorting
**Solution**: Verify that `created_at` is indexed in Weaviate schema. Check schema definition in `src/database/weaviate/schema.ts`.

### Issue 2: Pagination returns unexpected results
**Symptom**: Second page contains same memories as first page
**Solution**: Ensure offset is applied AFTER fetching results from Weaviate (fetch limit+offset, then slice).

### Issue 3: Tests fail with empty results
**Symptom**: Test expectations fail because no memories returned
**Solution**: Ensure test database is seeded with test memories. Check test setup in `memory.service.spec.ts`.

---

## Resources

- [Weaviate Query API - Sort](https://weaviate.io/developers/weaviate/api/graphql/search-operators#sort): Documentation for sort parameter
- [Design Doc](../../design/memory-sorting-algorithms.md): Full design for memory sorting system (Phase 1 MVP section)
- [MemoryService Source](../../src/services/memory.service.ts): Existing service implementation

---

## Notes

- This is the simplest of the three sort modes (Smart, Time, Density)
- Smart mode already works via existing `search()` method
- Density mode (Task 40) requires relationship_count property
- No new infrastructure needed - uses native Weaviate features
- Performance is good - Weaviate handles sorting efficiently

---

**Next Task**: [task-37-add-relationship-count-property.md](task-37-add-relationship-count-property.md)
**Related Design Docs**: [memory-sorting-algorithms.md](../../design/memory-sorting-algorithms.md)
**Estimated Completion Date**: TBD
