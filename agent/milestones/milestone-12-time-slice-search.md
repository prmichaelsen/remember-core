# Milestone 12: Time-Slice Search

**Goal**: Add a `searchByTimeSlice` utility that combines text search with chronological ordering via parallel time-bucketed searches
**Duration**: 1-2 days
**Dependencies**: M11 (byTime sort mode must exist for asc oldest-memory lookup)
**Status**: Complete

---

## Overview

Weaviate's hybrid search returns relevance-ranked results, and its sort-based fetch (`byTime`) doesn't support text queries. Users want both: "search for 'vacation' sorted newest first." This milestone adds a new `remember-core/search` subpath export with a `searchByTimeSlice` function that partitions the time axis into buckets, runs parallel searches per bucket, and concatenates results in chronological order.

The function is a consumer-side orchestration layer — it calls existing svc client methods (`search` with date filters, `byTime` for oldest-memory lookup) and requires no Weaviate schema changes or new REST endpoints.

**Design Reference**: `agent/design/local.by-time-slice-search.md`

---

## Deliverables

### 1. Search Module (`src/search/`)
- `time-slices.ts` — `buildGradedSlices()`, `buildEvenSlices()`, `GRADED_OFFSETS_MS`, `BUCKET_COUNT`
- `search-by-time-slice.ts` — `searchByTimeSlice()` function
- `index.ts` — barrel export

### 2. Package Configuration
- New subpath export: `remember-core/search`
- Updated `package.json` exports and typesVersions

### 3. Tests
- `time-slices.spec.ts` — bucket math for graded and even strategies
- `search-by-time-slice.spec.ts` — orchestration with mocked svc client

---

## Success Criteria

- [ ] `buildGradedSlices(now)` returns 14 exponentially-spaced buckets anchored at now
- [ ] `buildEvenSlices(oldestDate, now)` returns N equal-width buckets
- [ ] `searchByTimeSlice(svc, userId, query, { direction: 'desc' })` fires 14 parallel searches with correct date boundaries
- [ ] `searchByTimeSlice(svc, userId, query, { direction: 'asc' })` fetches oldest memory, builds even buckets, fires parallel searches
- [ ] Empty collection returns `{ memories: [], total: 0 }` for asc
- [ ] Pagination (offset/limit) works across aggregated results
- [ ] `remember-core/search` subpath export works
- [ ] All existing tests still pass
- [ ] New tests cover both directions, edge cases, empty buckets

---

## Key Files to Create

```
src/
├── search/
│   ├── index.ts                      # Barrel export
│   ├── time-slices.ts                # Bucket builders (graded + even)
│   ├── time-slices.spec.ts           # Bucket math tests
│   ├── search-by-time-slice.ts       # searchByTimeSlice orchestration
│   └── search-by-time-slice.spec.ts  # Orchestration tests
```

---

## Tasks

1. [Task 59: Time-slice bucket builders](../tasks/milestone-12-time-slice-search/task-59-time-slice-bucket-builders.md) — `buildGradedSlices`, `buildEvenSlices`, unit tests
2. [Task 60: searchByTimeSlice function](../tasks/milestone-12-time-slice-search/task-60-search-by-time-slice.md) — Orchestration function, svc client integration, unit tests
3. [Task 61: Subpath export and documentation](../tasks/milestone-12-time-slice-search/task-61-subpath-export-docs.md) — Package.json export, barrel, CHANGELOG, README

---

## Testing Requirements

- [ ] Bucket math: graded offsets produce correct ISO date boundaries
- [ ] Bucket math: even slices divide span uniformly, edge cases (span=0, very short span)
- [ ] Orchestration: desc fires 14 graded parallel searches with correct date_from/date_to
- [ ] Orchestration: asc calls byTime(limit:1) then fires 14 even parallel searches
- [ ] Orchestration: empty collection (asc) returns empty result
- [ ] Orchestration: pagination offset/limit across aggregated results
- [ ] Orchestration: filters passed through to each bucket search

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| 14 parallel Weaviate calls per request | Medium | Medium | Small per-bucket limits, short-circuit as future optimization |
| Pagination imprecision across buckets | Low | High | Acceptable for feed UX; document as known limitation |
| svc client date_from/date_to not passed as filters | Medium | Low | Verify svc search passes filters through to Weaviate |

---

**Next Milestone**: TBD
**Blockers**: None — all dependencies (search with date filters, byTime) already exist
**Notes**: This is a consumer-side utility, not a Weaviate-level change. No schema migration needed.
