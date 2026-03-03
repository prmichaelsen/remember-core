# By-Time-Slice Search

**Concept**: Combine text search with chronological ordering by partitioning queries across parallel time-bucketed searches
**Created**: 2026-03-03
**Status**: Proposal

---

## Overview

Weaviate's hybrid/BM25 search returns results ranked by relevance score, and its sort-based fetch (`byTime`) doesn't support text queries. These are fundamentally different query modes — you either search (ranked by relevance) or fetch (sorted by property), but not both.

This design proposes a time-slice approach: partition the time axis into buckets, run parallel searches within each bucket, and aggregate results in chronological order. This gives users text-filtered results with a chronological presentation.

The two directions use different bucketing strategies:
- **Newest first (desc)**: Exponentially-graded buckets anchored at `now` — fine granularity for recent memories, coarser for older ones. Matches how humans perceive recency.
- **Oldest first (asc)**: Evenly-distributed buckets spanning from the user's oldest memory to `now`. The user is browsing their archive — equal representation across all time periods.

---

## Problem Statement

- `byTime()` uses `collection.query.fetchObjects()` with a sort clause — no text query support
- `search()` uses `collection.query.hybridSearch()` — results ranked by relevance, not time
- Users expect to search memories and see results in chronological order (e.g., "show me everything about 'vacation' newest first")
- Current fallback: when a query is present with chronological/relationships algorithms, we use `search()` which returns relevance-ranked results, losing the time ordering

---

## Solution

Run parallel searches across time buckets, then concatenate results bucket-by-bucket to produce chronologically-ordered search results. The bucketing strategy differs by direction.

### Newest First (desc) — Graded Buckets

14 exponentially-spaced buckets anchored at `now`. Fine granularity for recent memories, coarser for older ones:

| # | Slice | From | To |
|---|-------|------|----|
| 1 | <10m | now - 10m | now |
| 2 | 10m - 30m | now - 30m | now - 10m |
| 3 | 30m - 1h | now - 1h | now - 30m |
| 4 | 1h - 12h | now - 12h | now - 1h |
| 5 | 12h - 24h | now - 24h | now - 12h |
| 6 | 1d - 3d | now - 3d | now - 1d |
| 7 | 3d - 7d | now - 7d | now - 3d |
| 8 | 1w - 2w | now - 2w | now - 1w |
| 9 | 2w - 4w | now - 4w | now - 2w |
| 10 | 1m - 3m | now - 3m | now - 1m |
| 11 | 3m - 6m | now - 6m | now - 3m |
| 12 | 6m - 1y | now - 1y | now - 6m |
| 13 | 1y - 2y | now - 2y | now - 1y |
| 14 | 2y+ | epoch | now - 2y |

### Oldest First (asc) — Even Buckets

Requires a preliminary query to find the oldest memory's `created_at`, then divides the span `(oldest → now)` into N equal-width buckets:

| Step | Action |
|------|--------|
| 1 | Fetch oldest memory: `byTime({ direction: 'asc', limit: 1 })` |
| 2 | Compute span: `now - oldest_created_at` |
| 3 | Divide span into N equal buckets (N = 14) |
| 4 | Bucket width = `span / N` |

Example: user's oldest memory is 1 year ago → each bucket covers ~26 days.

| # | Slice | From | To |
|---|-------|------|----|
| 1 | Bucket 1 | oldest | oldest + width |
| 2 | Bucket 2 | oldest + width | oldest + 2×width |
| ... | ... | ... | ... |
| N | Bucket N | oldest + (N-1)×width | now |

This gives equal representation across the user's entire history — no time period is over- or under-weighted. The user is browsing their archive, not chasing recency.

### Algorithm

**Newest first (desc):**
```
1. Compute graded bucket boundaries from current time
2. Fire all 14 searches in parallel via Promise.all()
3. Concatenate results bucket 1 → 14 (newest first)
4. Trim to requested page size
```

**Oldest first (asc):**
```
1. Fetch oldest memory's created_at (single byTime query, limit: 1, direction: asc)
2. Compute even bucket boundaries: span = now - oldest, width = span / N
3. Fire all N searches in parallel via Promise.all()
4. Concatenate results bucket 1 → N (oldest first)
5. Trim to requested page size
```

### Why This Works

- Each bucket returns relevance-ranked results *within* that time window
- Concatenating buckets in order produces chronological grouping
- Parallel execution means latency ≈ slowest single bucket, not Nx
- Short-circuit: stop processing further buckets once page is full
- **Desc graded buckets** match how humans perceive recency (fine near now, coarse far away)
- **Asc even buckets** match how humans browse archives (equal weight to all periods)

---

## Implementation

### Time Slice Definition

```typescript
interface TimeSlice {
  label: string
  from: string   // ISO date string
  to: string     // ISO date string
}

// ── Newest first: graded buckets anchored at now ──

const GRADED_OFFSETS_MS = [
  0,
  10 * 60_000,             // 10m
  30 * 60_000,             // 30m
  60 * 60_000,             // 1h
  12 * 3_600_000,          // 12h
  24 * 3_600_000,          // 24h
  3 * 86_400_000,          // 3d
  7 * 86_400_000,          // 7d
  14 * 86_400_000,         // 2w
  28 * 86_400_000,         // 4w
  90 * 86_400_000,         // 3m
  180 * 86_400_000,        // 6m
  365 * 86_400_000,        // 1y
  730 * 86_400_000,        // 2y
  Number.MAX_SAFE_INTEGER, // epoch
]

function buildGradedSlices(now: number): TimeSlice[] {
  const slices: TimeSlice[] = []
  for (let i = 0; i < GRADED_OFFSETS_MS.length - 1; i++) {
    const to = new Date(now - GRADED_OFFSETS_MS[i]).toISOString()
    const from = GRADED_OFFSETS_MS[i + 1] === Number.MAX_SAFE_INTEGER
      ? undefined  // no lower bound for oldest bucket
      : new Date(now - GRADED_OFFSETS_MS[i + 1]).toISOString()
    slices.push({ label: `bucket-${i + 1}`, from, to })
  }
  return slices
}

// ── Oldest first: even buckets from oldest memory to now ──

const BUCKET_COUNT = 14

function buildEvenSlices(oldestCreatedAt: string, now: number): TimeSlice[] {
  const oldestMs = new Date(oldestCreatedAt).getTime()
  const span = now - oldestMs
  const width = span / BUCKET_COUNT
  const slices: TimeSlice[] = []
  for (let i = 0; i < BUCKET_COUNT; i++) {
    slices.push({
      label: `bucket-${i + 1}`,
      from: new Date(oldestMs + i * width).toISOString(),
      to: new Date(oldestMs + (i + 1) * width).toISOString(),
    })
  }
  return slices
}
```

### Search Function

```typescript
async function searchByTimeSlice(
  svc: SvcClient,
  userId: string,
  query: string,
  options: {
    limit: number
    offset: number
    direction: 'asc' | 'desc'
    filters?: Record<string, unknown>
  }
): Promise<{ memories: ScoredMemory[]; total: number }> {
  const now = Date.now()
  const perBucketLimit = Math.max(Math.ceil(options.limit / 3), 5)

  // Build slices based on direction
  let slices: TimeSlice[]

  if (options.direction === 'desc') {
    slices = buildGradedSlices(now)
  } else {
    // Oldest first: fetch oldest memory to anchor the even buckets
    const oldestRes = await svc.memories.byTime(userId, {
      direction: 'asc',
      limit: 1,
    })
    const oldest = oldestRes.throwOnError()
    const oldestDate = oldest.memories?.[0]?.created_at
    if (!oldestDate) {
      return { memories: [], total: 0 }
    }
    slices = buildEvenSlices(oldestDate, now)
  }

  // Fire all searches in parallel
  const bucketResults = await Promise.all(
    slices.map(async (slice) => {
      const res = await svc.memories.search(userId, {
        query,
        limit: perBucketLimit,
        offset: 0,
        include_relationships: true,
        ...(slice.from && { date_from: slice.from }),
        date_to: slice.to,
        ...(options.filters && { filters: options.filters }),
      })
      const data = res.throwOnError() as { memories?: unknown[]; total?: number }
      return {
        memories: (data.memories ?? []) as ScoredMemory[],
        total: data.total ?? 0,
      }
    })
  )

  const allMemories = bucketResults.flatMap((r) => r.memories)
  const totalEstimate = bucketResults.reduce((sum, r) => sum + r.total, 0)

  // Apply offset and limit
  const paged = allMemories.slice(options.offset, options.offset + options.limit)

  return { memories: paged, total: totalEstimate }
}
```

### Feed Endpoint Integration

In `/api/memories/feed`, the `chronological` case with a query would call:

```typescript
case 'chronological': {
  if (hasQuery) {
    const result = await searchByTimeSlice(svc, user.uid, query, {
      limit, offset, direction, filters,
    })
    memories = result.memories
    total = result.total
  } else {
    // Existing byTime() call
  }
  break
}
```

---

## Benefits

- **Chronological search**: Users get time-ordered results with text filtering
- **Parallel execution**: Latency bounded by slowest bucket, not sum of all
- **Direction-appropriate bucketing**: Graded buckets for newest-first (recency bias), even buckets for oldest-first (uniform archive browsing)
- **Short-circuit potential**: Can skip older buckets once page is full
- **No Weaviate changes**: Works with existing search API via date_from/date_to filters

---

## Trade-offs

- **14 parallel Weaviate queries per request**: Increases load on Weaviate instance. Mitigated by small per-bucket limits and potential short-circuiting.
- **Uneven result distribution**: For a niche query, most buckets return 0 results — wasted calls. Mitigated by parallel execution (latency cost is minimal).
- **Pagination complexity**: Offset-based pagination across 14 buckets is imprecise. The total estimate is a sum of per-bucket totals which may double-count. Acceptable for feed UX where exact counts aren't critical.
- **Approximate ordering**: Results are chronological *between* buckets but relevance-ranked *within* each bucket. For desc, a 2-hour-old result could appear before a 1-hour-old result if they're in the same 1h-12h bucket. For asc, within-bucket ordering is also by relevance — but even bucket widths keep the approximation uniform.
- **Extra round trip for asc**: Oldest-first requires one additional query (`byTime limit:1`) to find the oldest memory before building buckets. Adds ~50ms latency.
- **Cost**: 14x the search calls. If Weaviate charges per query or has rate limits, this matters.

---

## Dependencies

- `svc.memories.search()` must support `date_from` and `date_to` parameters (already supported)
- `svc.memories.byTime()` must support `direction: 'asc', limit: 1` for oldest-memory lookup (already supported)
- Weaviate `created_at` field must be indexed for date filtering (already the case)

---

## Testing Strategy

- **Unit tests (desc)**: Mock `svc.memories.search()`, verify 14 graded parallel calls with correct date boundaries
- **Unit tests (asc)**: Mock `svc.memories.byTime()` for oldest-memory lookup, verify N even-width parallel calls
- **Bucket boundary tests**: Verify edge cases (now, epoch, exactly on boundary, single-memory collection)
- **Even bucket math**: Verify span/width calculation, edge case where oldest = now (empty or single moment)
- **Direction tests**: Verify desc uses graded slices, asc uses even slices
- **Empty bucket tests**: Verify graceful handling when most buckets return 0 results
- **Empty collection test**: Verify asc returns empty when no memories exist (byTime returns nothing)
- **Pagination tests**: Verify offset/limit across aggregated results

---

## Future Considerations

- **Adaptive bucket count for asc**: Vary N based on span length (e.g., 7 buckets for spans < 1 month, 14 for longer)
- **Adaptive bucket sizing for desc**: Skip buckets based on user's memory creation patterns (if they have no memories older than 6 months, skip 1y+ buckets)
- **Short-circuit optimization**: Once `limit` results collected from recent buckets, cancel remaining older bucket requests
- **Relationships algorithm**: Same approach could work for `byDensity` + query, though bucket partitioning by relationship_count ranges is less natural
- **Caching**: Cache per-bucket results for repeated queries with same time windows

---

**Status**: Proposal
**Recommendation**: Implement as an enhancement to the feed endpoint's chronological + query path. Start with the basic parallel approach, add short-circuiting as an optimization later.
**Related Documents**:
- [Memory Sorting Algorithms](memory-sorting-algorithms.md)
- [Memory Feed API](memory-feed-api.md)
