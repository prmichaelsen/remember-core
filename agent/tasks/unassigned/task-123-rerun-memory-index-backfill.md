# Task 123: Rerun Memory Index Backfill

**Status**: Completed
**Milestone**: Unassigned (follow-up to task-117)
**Estimated Time**: 1 hour
**Dependencies**: task-117
**Completed**: 2026-03-06

---

## Objective

Rerun the memory index backfill migration because memory indexing on new memories wasn't deployed correctly after task-117, leaving some memories unindexed in Firestore.

## Context

After task-117 wired `MemoryIndexService` into `MemoryService` and `SpaceService`, the deployment didn't correctly enable indexing on new memory writes. This meant memories created after the original backfill (task-96) but before the fix was deployed had no index entries.

## Changes Made

1. **Improved backfill script UX** (`scripts/migrations/backfill-memory-index.ts`):
   - Replaced verbose line-by-line logging with inline progress bars using `\r\x1b[K`
   - Added `collection.aggregate.overAll()` to get total count before iterating, so progress bar shows real 0-100% progress
   - Suppressed noisy `MemoryIndexService` logger output during migration
   - Added box-drawing summary table at completion
   - Added empty collection detection (skip with message)
   - Pre-filter non-memory collections upfront

2. **Ran backfill on production** to reindex all unindexed memories

## Verification

- [x] Backfill script updated with progress bars
- [x] Progress bar shows real progress (not stuck at 100%)
- [x] Backfill ran successfully on production
- [x] Committed in 55ca86f and a9c2d6e
