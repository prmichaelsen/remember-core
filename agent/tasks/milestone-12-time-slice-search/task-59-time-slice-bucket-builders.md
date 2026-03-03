# Task 59: Time-Slice Bucket Builders

**Milestone**: M12 — Time-Slice Search
**Status**: Not Started
**Estimated Hours**: 1
**Dependencies**: None

---

## Objective

Create `src/search/time-slices.ts` with two bucket-building functions: `buildGradedSlices()` for newest-first (exponential) and `buildEvenSlices()` for oldest-first (uniform). These are pure functions with no external dependencies.

---

## Context

The time-slice search approach partitions the time axis into buckets so parallel searches can be run per bucket. The two directions need different bucketing strategies:
- **Desc (newest first)**: 14 exponentially-graded buckets anchored at `now`
- **Asc (oldest first)**: N equal-width buckets spanning from oldest memory to now

See: `agent/design/local.by-time-slice-search.md` (Time Slice Definition section)

---

## Steps

### 1. Create `src/search/time-slices.ts`

Export:
- `TimeSlice` interface: `{ label: string; from?: string; to: string }`
- `GRADED_OFFSETS_MS` — 15-element array of millisecond offsets (0, 10m, 30m, 1h, ... 2y, MAX_SAFE_INTEGER)
- `BUCKET_COUNT` — 14
- `buildGradedSlices(now: number): TimeSlice[]` — builds 14 graded buckets from offsets
- `buildEvenSlices(oldestCreatedAt: string, now: number): TimeSlice[]` — divides span into N equal buckets

### 2. Create `src/search/time-slices.spec.ts`

Tests:
- `buildGradedSlices`: returns 14 slices, first slice `to` is ISO of `now`, last slice has no `from`, boundaries are monotonically decreasing
- `buildEvenSlices`: returns 14 slices, first `from` equals oldest date, last `to` is close to now, all widths equal
- Edge case: `buildEvenSlices` where oldest = now (zero span) — should produce 14 zero-width buckets without error
- Edge case: `buildEvenSlices` with very short span (1 second)

### 3. Create `src/search/index.ts` barrel

Export everything from `time-slices.ts`. Will be extended in task-60.

---

## Verification

- [ ] `buildGradedSlices` returns 14 slices with correct boundaries
- [ ] `buildEvenSlices` returns BUCKET_COUNT slices with equal widths
- [ ] Edge cases handled (zero span, short span)
- [ ] All new tests pass
- [ ] All existing tests still pass
- [ ] Build compiles without errors
