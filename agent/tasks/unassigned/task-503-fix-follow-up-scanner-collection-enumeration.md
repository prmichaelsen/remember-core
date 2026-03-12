# Task 503: Fix Follow-Up Scanner Collection Enumeration

**Milestone**: Unassigned (bug fix)
**Design Reference**: None
**Estimated Time**: 2-4 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Investigate and fix why `getNextMemoryCollection()` returns no collections, causing the follow-up scanner (`scanAndNotifyFollowUps`) to report `scanned: 0` on every run despite memories existing with `follow_up_at` dates that are past due.

---

## Context

The follow-up scanner in remember-rest-service runs every minute via Cloud Scheduler (`POST /api/internal/follow-ups/scan`). It calls `scanAndNotifyFollowUps()` from remember-core, which uses a `collectionEnumerator` that calls `getNextMemoryCollection()` to iterate Weaviate collections.

**Observed behavior** (production logs, 2026-03-12):
- Scanner runs every minute successfully (HTTP 200)
- Every run reports: `{"scanned": 0, "notified": 0, "failed": 0}`
- A memory exists with `follow_up_at: 2026-03-12T06:15:00Z` — well past due
- The `follow_up_notified_at` field is `undefined` (never notified)
- `follow_up_failure_count` is `undefined`
- `follow_up_targets` is `undefined`

**Expected behavior**:
- `getNextMemoryCollection()` should return user memory collections (e.g., `Memory_users_{userId}`)
- `scanAndNotifyFollowUps` should find the memory, check `follow_up_at <= now`, and emit `memory.follow_up_due` webhook event
- agentbase.me webhook handler (already implemented) would create a notification for the user

**The problem is in `getNextMemoryCollection()`** — it returns `null`/`undefined` immediately, so the collection enumerator yields nothing and the scanner skips all collections.

---

## Steps

### 1. Locate and examine `getNextMemoryCollection`

Find the implementation. It's exported from `@prmichaelsen/remember-core/services`. Understand:
- How does it discover Weaviate collections?
- Does it use a cursor/pagination mechanism?
- What does it return when no cursor is provided (first call)?
- Does it filter to only `Memory_users_*` collections, or all memory collections?

### 2. Locate and examine `scanAndNotifyFollowUps`

Understand the full scan flow:
- How does it call the `collectionEnumerator` generator?
- What Weaviate query does it run per collection to find due follow-ups?
- What fields does it check (`follow_up_at`, `follow_up_notified_at`, `follow_up_failure_count`)?
- How does it emit `memory.follow_up_due` events?

### 3. Reproduce the issue locally

- Write a test or script that calls `getNextMemoryCollection(null)` against a Weaviate instance with known collections
- Verify it returns `null` (confirming the bug)
- Check if the issue is:
  - Missing Weaviate API call (never queries collections)
  - Wrong collection name pattern/filter
  - Cursor logic bug (first call returns null instead of first collection)
  - Configuration issue (missing Weaviate client in the function's scope)

### 4. Fix the root cause

Common suspects:
- `getNextMemoryCollection` may not have access to the Weaviate client
- The collection listing API call may be using wrong parameters
- The cursor logic may have an off-by-one or initialization bug
- The function may be filtering collections with a regex that doesn't match actual collection names

### 5. Verify the fix

- Run `scanAndNotifyFollowUps` against a collection with a memory that has `follow_up_at` in the past
- Confirm `scanned > 0` and `notified > 0`
- Confirm the `memory.follow_up_due` webhook event is emitted with correct payload:
  - `memory_id`, `title`, `owner_id`, `follow_up_at`, `content_preview`, `follow_up_targets`, `space_ids`, `group_ids`
- Confirm `follow_up_notified_at` is set on the memory after notification

### 6. Add/update tests

- Unit test: `getNextMemoryCollection` returns collections when they exist
- Unit test: `getNextMemoryCollection` returns null when no collections exist
- Unit test: `scanAndNotifyFollowUps` finds due memories and emits events
- Unit test: `scanAndNotifyFollowUps` skips memories already notified (`follow_up_notified_at` set)

### 7. Publish fix

- Bump remember-core version
- Publish to npm
- Update remember-rest-service to use new version
- Deploy remember-rest-service
- Monitor Cloud Run logs to confirm `scanned > 0` on next run

---

## Verification

- [ ] `getNextMemoryCollection()` returns collection names when Weaviate has memory collections
- [ ] `scanAndNotifyFollowUps` reports `scanned > 0` when collections exist
- [ ] `scanAndNotifyFollowUps` reports `notified > 0` when a memory has `follow_up_at <= now` and `follow_up_notified_at` is unset
- [ ] `memory.follow_up_due` webhook event emitted with correct payload shape
- [ ] `follow_up_notified_at` set on memory after successful notification
- [ ] Already-notified memories are not re-notified
- [ ] Production logs show `scanned > 0` after deployment
- [ ] Tests pass

---

## Diagnostic Data

**Production Cloud Scheduler jobs** (project: `com-f5-parm`):
- `follow-up-scanner` — every 1 min, prod (`remember-rest-service-dit6gawkbq-uc.a.run.app`)
- `follow-up-scanner-e1` — every 15 min, staging (`remember-rest-service-e1-dit6gawkbq-uc.a.run.app`)

**Sample log output** (every run identical):
```json
{"failed": 0, "level": "INFO", "message": "Follow-up scan complete", "notified": 0, "scanned": 0}
```

**Test memory fields**:
```
follow_up_at:            2026-03-12T06:15:00Z (past due)
follow_up_failure_count: undefined
follow_up_notified_at:   undefined
follow_up_targets:       undefined
```

---

## Notes

- The agentbase.me side (webhook handler for `memory.follow_up_due`) is already implemented and tested — this is purely a remember-core fix
- The `SchedulerController` in remember-rest-service passes a `collectionEnumerator` generator that wraps `getNextMemoryCollection` — the bug is likely in that core function, not the controller
- Staging scanner returns HTTP status code 13 (INTERNAL error) — may be a related or separate issue

---

**Next Task**: None (standalone bug fix)
**Related Design Docs**: None
**Estimated Completion Date**: TBD
