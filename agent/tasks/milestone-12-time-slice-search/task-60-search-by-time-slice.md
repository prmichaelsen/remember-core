# Task 60: searchByTimeSlice Function

**Milestone**: M12 — Time-Slice Search
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: [Task 59](./task-59-time-slice-bucket-builders.md)

---

## Objective

Create `src/search/search-by-time-slice.ts` with the `searchByTimeSlice()` orchestration function. It accepts a svc client, userId, query, and options, then fires parallel bucketed searches and aggregates results in chronological order.

---

## Context

This function bridges the gap between text search (relevance-ranked) and chronological ordering. It calls existing svc client methods — no new REST endpoints or Weaviate changes needed.

- **Desc**: Builds graded slices, fires 14 parallel `svc.memories.search()` calls with date filters
- **Asc**: Calls `svc.memories.byTime({ direction: 'asc', limit: 1 })` to find oldest memory, builds even slices, fires 14 parallel searches

See: `agent/design/local.by-time-slice-search.md` (Search Function section)

---

## Steps

### 1. Create `src/search/search-by-time-slice.ts`

```typescript
export interface TimeSliceSearchOptions {
  limit: number;
  offset: number;
  direction: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

export interface TimeSliceSearchResult {
  memories: Record<string, unknown>[];
  total: number;
}

export async function searchByTimeSlice(
  svc: { memories: { search: Function; byTime: Function } },
  userId: string,
  query: string,
  options: TimeSliceSearchOptions,
): Promise<TimeSliceSearchResult>
```

Implementation:
- Compute `perBucketLimit = Math.max(Math.ceil(limit / 3), 5)`
- Branch on direction to build graded or even slices
- For asc: call `svc.memories.byTime(userId, { direction: 'asc', limit: 1 })`, extract oldest `created_at`, early return if empty
- `Promise.all()` over slices, each calling `svc.memories.search()` with `date_from`/`date_to` in filters
- Concatenate bucket results in order, apply offset/limit
- Return `{ memories, total }`

### 2. Update barrel export

Add `search-by-time-slice.ts` exports to `src/search/index.ts`.

### 3. Create `src/search/search-by-time-slice.spec.ts`

Mock svc client with jest:
- `svc.memories.search` — returns mock memories with `created_at` per bucket
- `svc.memories.byTime` — returns mock oldest memory (for asc tests)

Tests:
- **Desc direction**: verify 14 `search` calls with graded date boundaries, no `byTime` call
- **Asc direction**: verify 1 `byTime` call + 14 `search` calls with even date boundaries
- **Empty collection (asc)**: byTime returns no memories → returns `{ memories: [], total: 0 }`
- **Pagination**: offset=5, limit=10 → correct slice of aggregated results
- **Filters pass-through**: custom filters appear in every bucket search call
- **Per-bucket limit**: verify `perBucketLimit` calculation

---

## Verification

- [ ] Desc fires 14 parallel searches with graded date boundaries
- [ ] Asc fires byTime(limit:1) then 14 parallel searches with even boundaries
- [ ] Empty collection returns empty result
- [ ] Offset/limit pagination works
- [ ] Filters are passed through to every bucket search
- [ ] All new tests pass
- [ ] All existing tests still pass
- [ ] Build compiles without errors
