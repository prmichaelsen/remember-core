# Task 162: byRandom Core Method

**Milestone**: M31 — byBroad & byRandom
**Status**: Not Started
**Estimated Hours**: 3-4
**Dependencies**: M18 (Memory Index Lookup, complete)

---

## Objective

Implement `byRandom()` on MemoryService — random sampling for serendipitous rediscovery of forgotten memories. Uses Firestore memory index to enumerate UUIDs, then picks random selections and batch-fetches from Weaviate.

## Context

- **Design doc**: `agent/design/local.new-search-tools.md` — section "byRandom Mode"
- Weaviate doesn't natively support random sampling, so this uses Firestore memory index as the UUID source
- Algorithm: enumerate UUIDs in Firestore index for collection, pick N random offsets, batch-fetch from Weaviate by UUID
- Useful for serendipitous rediscovery of forgotten content

## TypeScript Interfaces

```typescript
interface RandomModeRequest {
  user_id: string;
  query?: string;          // Optional: constrain the random pool (e.g., random memories tagged "idea")
  limit?: number;          // Default: 10
  filters?: {
    types?: string[];
    exclude_types?: string[];
    tags?: string[];
    weight_min?: number;
    weight_max?: number;
    trust_min?: number;
    trust_max?: number;
    date_from?: string;
    date_to?: string;
    rating_min?: number;
    relationship_count_min?: number;
    relationship_count_max?: number;
    has_relationships?: boolean;
  };
  deleted_filter?: 'exclude' | 'include' | 'only';
}

interface RandomModeResult {
  results: Memory[];  // Full memory objects (not truncated like byBroad)
  total_pool_size: number;  // Total number of memories in the random pool
}
```

## Algorithm

```typescript
async function byRandom(request: RandomModeRequest): Promise<RandomModeResult> {
  const limit = request.limit ?? 10;

  // 1. Query Firestore memory index for all UUIDs in target collection
  const allUuids = await firestoreIndex.getMemoryIds(request.user_id, request.filters);
  const N = allUuids.length;

  if (N === 0) return { results: [], total_pool_size: 0 };

  // 2. Pick `limit` random offsets
  const selectedIndices = new Set<number>();
  const maxAttempts = limit * 3; // prevent infinite loop on small collections
  let attempts = 0;

  while (selectedIndices.size < Math.min(limit, N) && attempts < maxAttempts) {
    const idx = Math.floor(Math.random() * N);
    selectedIndices.add(idx);  // Set deduplicates automatically
    attempts++;
  }

  // 3. Map offsets to UUIDs
  const selectedUuids = [...selectedIndices].map(i => allUuids[i]);

  // 4. Batch-fetch from Weaviate by UUID
  const memories = await weaviate.batchFetchByUuid(selectedUuids);

  // 5. Apply post-filters (ghost/trust/deleted)
  const filtered = applyPostFilters(memories, request);

  return { results: filtered, total_pool_size: N };
}
```

## Edge Cases

- **Empty collection**: Return `{ results: [], total_pool_size: 0 }`
- **Collection smaller than limit**: Return all memories (no duplicates possible)
- **Same offset picked twice**: `Set` handles deduplication automatically; `maxAttempts` prevents infinite loop
- **Filters narrow pool significantly**: Apply Firestore-level filtering first where possible to narrow UUID set before random selection

## Steps

1. Define `RandomModeRequest` and `RandomModeResult` interfaces
2. Query Firestore memory index for all UUIDs in target collection (with applicable filters)
3. Get total count N from the UUID list
4. Pick `limit` random offsets via `Math.floor(Math.random() * N)`
5. Use a `Set<number>` to deduplicate indices; retry with new random on collision
6. Cap attempts at `limit * 3` to prevent infinite loops on very small collections
7. Map selected indices to UUIDs from the list
8. Batch-fetch selected memories from Weaviate by UUID
9. Apply ghost/trust/deleted post-filtering on fetched results
10. Return full memory objects (not truncated like byBroad)
11. Include `total_pool_size` in response so caller knows the size of the random pool

## Verification

- [ ] Returns random memories from collection (not deterministic)
- [ ] Uses Firestore memory index (no Weaviate offset scanning)
- [ ] Deduplicates when same offset picked twice (Set-based)
- [ ] Works with empty collections (returns empty results)
- [ ] Works with collections smaller than limit (returns all available)
- [ ] `maxAttempts` prevents infinite loop
- [ ] Filters applied correctly (types, tags, weight, trust, date)
- [ ] Ghost memories excluded by default
- [ ] Deleted memories excluded by default
- [ ] `total_pool_size` accurately reflects the pool size
- [ ] Returns full memory objects (not truncated)
- [ ] Tests colocated: appropriate `.spec.ts` file alongside implementation
