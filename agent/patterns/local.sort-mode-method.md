# Sort Mode Method Pattern

**Category**: Architecture
**Applicable To**: MemoryService sort modes, new browsing/feed methods
**Status**: Stable

---

## Overview

A sort mode method is a `MemoryService` method that returns memories ordered by a Weaviate-native property sort (not by relevance). Each sort mode has a dedicated `Request`/`Result` interface pair, uses `fetchObjects` (not `hybrid`/`nearText`), and is mirrored 1:1 as a svc client method and REST endpoint.

This pattern exists because Weaviate separates "search" (relevance-ranked) from "fetch" (property-sorted). Sort modes live on the fetch side — they don't accept a text query.

---

## When to Use This Pattern

✅ **Use this pattern when:**
- Adding a new browsing/feed mode that sorts by a Weaviate property (e.g., `created_at`, `relationship_count`, `weight`)
- The ordering is determined by a stored property, not by query relevance
- The mode should be available as a REST endpoint and svc client method

❌ **Don't use this pattern when:**
- You need text search + ordering (use the time-slice search pattern instead)
- The ordering requires a computed value not stored in Weaviate
- You're adding a variant of an existing search method (add a parameter instead)

---

## Core Principles

1. **fetchObjects, not hybrid**: Sort modes use `collection.query.fetchObjects()` with a `sort` clause. They cannot accept a text query.
2. **Dedicated input/output types**: Each mode defines `{Name}ModeRequest` and `{Name}ModeResult` interfaces. Don't reuse `SearchMemoryInput`.
3. **Standard filter pipeline**: Ghost/trust filtering, deleted filter, and `buildMemoryOnlyFilters` are applied consistently, same as other MemoryService methods.
4. **1:1 REST mirror**: Each sort mode method maps to exactly one svc client method and one REST endpoint (`POST /api/svc/v1/memories/by-{name}`).

---

## Implementation

### Layer Stack

```
Consumer (agentbase.me feed, CLI, etc.)
    │
    ▼
svc client  ─── client.memories.byFoo(userId, input)
    │              POST /api/svc/v1/memories/by-foo
    ▼
REST controller  ─── @Post('by-foo') handler
    │
    ▼
MemoryService  ─── memoryService.byFoo(input)
    │                collection.query.fetchObjects({ sort, filters, limit })
    ▼
Weaviate  ─── native property sort
```

### Step 1: Define Request/Result Types

In `src/services/memory.service.ts`, add the interface pair:

```typescript
export interface FooModeRequest {
  limit?: number;
  offset?: number;
  // Mode-specific parameters (e.g., direction, min_threshold)
  direction?: 'asc' | 'desc';
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface FooModeResult {
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}
```

All sort mode results share the same shape: `{ memories, total, offset, limit }`.

### Step 2: Add Method to MemoryService

```typescript
async byFoo(input: FooModeRequest): Promise<FooModeResult> {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  // 1. Build filters (same pipeline as byTime/byDensity)
  const memoryFilters = buildMemoryOnlyFilters(this.collection, input.filters);

  const ghostFilters: any[] = [];
  if (input.ghost_context) {
    ghostFilters.push(buildTrustFilter(this.collection, input.ghost_context.accessor_trust_level));
  }
  if (!input.ghost_context?.include_ghost_content) {
    ghostFilters.push(this.collection.filter.byProperty('content_type').notEqual('ghost'));
  }

  // 2. Mode-specific filters (optional)
  const modeFilters: any[] = [];
  // e.g., min threshold filters

  // 3. Execute with retry-without-deleted-filter
  const executeQuery = async (useDeletedFilter: boolean) => {
    const deletedFilter = useDeletedFilter
      ? buildDeletedFilter(this.collection, input.deleted_filter || 'exclude')
      : null;

    const combinedFilters = combineFiltersWithAnd(
      [deletedFilter, memoryFilters, ...ghostFilters, ...modeFilters].filter((f) => f !== null),
    );

    const queryOptions: any = {
      limit: limit + offset,
      // 4. Sort by the target property using Weaviate sort builder
      sort: this.collection.sort.byProperty('your_property', ascending),
    };

    if (combinedFilters) {
      queryOptions.filters = combinedFilters;
    }

    return this.collection.query.fetchObjects(queryOptions);
  };

  const results = await this.retryWithoutDeletedFilter(executeQuery);
  const paginated = results.objects.slice(offset);

  // 5. Map Weaviate objects to output shape
  const memories: Record<string, unknown>[] = [];
  for (const obj of paginated) {
    const doc = { id: obj.uuid, ...obj.properties };
    if (doc.doc_type === 'memory') {
      memories.push(doc);
    }
  }

  return { memories, total: memories.length, offset, limit };
}
```

**Critical**: Use `this.collection.sort.byProperty(name, ascending)` — NOT a plain `{ property, order }` object. The Weaviate SDK expects a `Sorting` instance.

### Step 3: Add Svc Client Method

In `src/clients/svc/v1/memories.ts`:

```typescript
// Interface
export interface MemoriesResource {
  // ... existing methods ...
  byFoo(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
}

// Implementation
byFoo(userId, input) {
  return http.request('POST', '/api/svc/v1/memories/by-foo', { userId, body: input });
},
```

### Step 4: Add Tests

Colocated test in `src/services/__tests__/memory.service.spec.ts`:

```typescript
describe('byFoo', () => {
  it('returns memories sorted by property', async () => {
    // Insert test memories with varying property values
    // Call byFoo()
    // Assert order matches expected sort
  });

  it('respects limit and offset', async () => { /* ... */ });

  it('applies filters', async () => { /* ... */ });

  it('applies ghost/trust filtering', async () => { /* ... */ });
});
```

Colocated test in svc client spec:

```typescript
it('byFoo calls POST /api/svc/v1/memories/by-foo', async () => {
  await memories.byFoo('user1', { limit: 50 });
  expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/memories/by-foo', {
    userId: 'user1',
    body: { limit: 50 },
  });
});
```

---

## Examples

### Example 1: byTime (chronological)

Sorts by `created_at`. Mode-specific parameter: `direction` (asc/desc).

```typescript
// Request
{ limit: 50, offset: 0, direction: 'desc', filters: { tags: ['poem'] } }

// Sort
sort: this.collection.sort.byProperty('created_at', direction === 'asc')

// REST
POST /api/svc/v1/memories/by-time

// Client
client.memories.byTime(userId, { limit: 50, direction: 'desc' })
```

### Example 2: byDensity (relationship count)

Sorts by `relationship_count` DESC. Mode-specific parameter: `min_relationship_count`.

```typescript
// Request
{ limit: 20, min_relationship_count: 3 }

// Sort
sort: this.collection.sort.byProperty('relationship_count', false)

// Mode-specific filter
collection.filter.byProperty('relationship_count').greaterOrEqual(min)

// REST
POST /api/svc/v1/memories/by-density

// Client
client.memories.byDensity(userId, { limit: 20, min_relationship_count: 3 })
```

---

## Benefits

### 1. Consistency
Every sort mode follows the same structure: request type, filter pipeline, fetchObjects + sort, result type, svc client method, REST endpoint. Adding a new mode is mechanical.

### 2. Weaviate-native performance
Sorting is done server-side by Weaviate, not in application code. No need to fetch all memories and sort in JS.

### 3. Standard filter composition
Ghost/trust, deleted, and user-defined filters are applied identically across all sort modes and search methods. No per-mode filter bugs.

---

## Trade-offs

### 1. No text query support
**Downside**: Sort modes use `fetchObjects`, which doesn't accept a text query. Users can't search + sort simultaneously.
**Mitigation**: Use the time-slice search pattern to combine text search with chronological ordering via parallel bucketed searches.

### 2. Requires stored property
**Downside**: You can only sort by a property that exists in the Weaviate schema. Computed or derived sorts require a denormalized property.
**Mitigation**: Add a denormalized property (like `relationship_count`) and maintain it in the relevant service. See byDensity for this approach.

### 3. Offset-based pagination
**Downside**: `fetchObjects` with `limit + offset` fetches extra objects. Deep pagination is inefficient.
**Mitigation**: Acceptable for typical feed UX (pages 1-5). For deep pagination, consider cursor-based approach in the future.

---

## Anti-Patterns

### ❌ Plain objects for sort

**Description**: Passing `{ property: 'name', order: 'desc' }` as the sort parameter.

**Why it's bad**: Weaviate SDK expects a `Sorting` instance with a `.sorts` array. Plain objects cause `TypeError: Cannot read properties of undefined (reading 'map')` at runtime.

**Instead, do this**:
```typescript
// ❌ Bad
sort: [{ property: 'created_at', order: 'desc' }]

// ✅ Good
sort: this.collection.sort.byProperty('created_at', false)
```

### ❌ Reusing SearchMemoryInput

**Description**: Adding sort parameters to `SearchMemoryInput` instead of creating a dedicated request type.

**Why it's bad**: Search uses `hybrid()` which doesn't support sort. Mixing the concepts leads to confusing APIs where some parameter combinations are invalid.

**Instead, do this**: Create a dedicated `FooModeRequest` interface for each sort mode.

---

## Testing Strategy

### Unit Testing
- Mock the Weaviate collection with `fetchObjects` support including sort handling
- Test sort order, pagination (limit/offset), filter application, ghost/trust filtering
- Test the `retryWithoutDeletedFilter` fallback path

### Svc Client Testing
- Mock `HttpClient.request`, verify correct HTTP method, path, and body
- One test per sort mode method

---

## Related Patterns

- **[core-sdk.service-base](./core-sdk.service-base.md)**: MemoryService follows the DI constructor pattern
- **[core-sdk.adapter-client](./core-sdk.adapter-client.md)**: Svc client mirrors service methods as REST calls
- **[local.by-time-slice-search](../design/local.by-time-slice-search.md)**: Design doc for combining text search with sort modes via parallel bucketed searches

---

## Checklist for Adding a New Sort Mode

- [ ] Property exists in Weaviate schema (add if needed, with migration script)
- [ ] `{Name}ModeRequest` and `{Name}ModeResult` interfaces defined in `memory.service.ts`
- [ ] `byName()` method added to `MemoryService` using `fetchObjects` + `collection.sort.byProperty()`
- [ ] Standard filter pipeline applied (ghost, trust, deleted, memoryOnly)
- [ ] `retryWithoutDeletedFilter` wrapper used
- [ ] Svc client method added to `MemoriesResource` interface and implementation
- [ ] REST route `POST /api/svc/v1/memories/by-{name}` added to REST service
- [ ] Unit tests: sort order, pagination, filters, ghost/trust
- [ ] Svc client test: correct HTTP call
- [ ] OpenAPI spec updated with new endpoint
- [ ] If denormalized property: maintenance logic in relevant service (create/delete hooks)
- [ ] If denormalized property: backfill migration script for existing data

---

**Status**: Stable
**Recommendation**: Follow this pattern for all new MemoryService browsing/feed modes that sort by a stored property.
**Last Updated**: 2026-03-03
**Contributors**: remember-core team
