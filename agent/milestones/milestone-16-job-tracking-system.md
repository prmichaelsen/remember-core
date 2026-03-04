# Milestone 16: Job Tracking System

**Goal**: Add async job infrastructure — Firestore-backed state, Cloud Run Jobs execution, REST polling, stepped progress reporting
**Duration**: 1-2 weeks
**Dependencies**: M14 (Import Service — completed)
**Status**: Not Started

---

## Overview

Long-running operations (bulk imports, REM cycles) currently block the caller's UX thread. This milestone adds a `JobService` to remember-core that tracks job state in Firestore, executes work via Cloud Run Jobs, and exposes a REST polling API for progress monitoring.

The import endpoint migrates from synchronous to async (`202 Accepted` + `job_id`). REM migrates from hourly round-robin cursor to daily per-collection job creation. The system is extensible to future job types (bulk delete, export, re-indexing, dedup).

---

## Deliverables

### 1. Job Infrastructure
- `JobService` class with Firestore CRUD for job state
- Job types and state machine (pending → running → completed/failed/cancelled/completed_with_errors)
- Per-step progress tracking with step-level errors
- Cancellation support (flag-based, checked between steps)
- TTL-based auto-cleanup for expired jobs

### 2. Import Migration
- `ImportJobWorker` — refactored ImportService as a job executor
- Per-chunk step tracking with progress percentage
- Partial failure support (completed_with_errors)
- `POST /memories/import` returns `202 Accepted` + `job_id`

### 3. REST API & SDK
- `GET /api/svc/v1/jobs/:id` — poll job status
- `POST /api/svc/v1/jobs/:id/cancel` — request cancellation
- OpenAPI spec with job schemas
- SVC client `client.jobs.get()`, `client.jobs.cancel()`, `client.jobs.poll()` helper

### 4. REM Migration
- Daily cron creates per-collection REM jobs (replaces round-robin cursor)
- REM jobs use `user_id: null` with `collection_id` in params
- RemCursorState no longer needed

---

## Success Criteria

- [ ] `JobService.create()` creates Firestore job record with correct schema
- [ ] `JobService.getStatus()` returns full job state including steps
- [ ] `ImportJobWorker.execute()` processes chunks as steps with progress updates
- [ ] Cancellation flag stops import between steps
- [ ] Partial failure produces `completed_with_errors` with per-step error detail
- [ ] `GET /jobs/:id` returns job state (OpenAPI spec defined)
- [ ] `POST /jobs/:id/cancel` sets cancellation flag
- [ ] SVC client `jobs.get()`, `jobs.cancel()`, `jobs.poll()` work correctly
- [ ] TTL cleanup removes expired jobs
- [ ] All existing tests pass + new tests for all modules
- [ ] `npm run build` compiles cleanly

---

## Key Files to Create

```
src/services/
  job.types.ts                    # Job, JobStep, JobError, JobStatus, JobType
  job.service.ts                  # JobService — Firestore CRUD
  job.service.spec.ts             # Unit tests
  import-job.worker.ts            # Import job executor
  import-job.worker.spec.ts       # Unit tests

src/clients/svc/v1/
  jobs.ts                         # JobsResource (get, cancel, poll)
  jobs.spec.ts                    # Unit tests

docs/
  openapi.yaml                    # Add job endpoints + schemas
```

---

## Tasks

1. [Task 75: Job types and JobService](../tasks/milestone-16-job-tracking-system/task-75-job-types-and-service.md) — Job state types, Firestore CRUD service, TTL cleanup
2. [Task 76: ImportJobWorker](../tasks/milestone-16-job-tracking-system/task-76-import-job-worker.md) — Refactor ImportService into job-native worker with per-chunk steps
3. [Task 77: OpenAPI spec and job REST endpoints](../tasks/milestone-16-job-tracking-system/task-77-openapi-spec-job-endpoints.md) — Job schemas, GET /jobs/:id, POST /jobs/:id/cancel, update import to 202
4. [Task 78: SVC client JobsResource](../tasks/milestone-16-job-tracking-system/task-78-svc-client-jobs-resource.md) — get, cancel, poll helper, update memories.import return type
5. [Task 79: REM job migration](../tasks/milestone-16-job-tracking-system/task-79-rem-job-migration.md) — Daily cron per-collection jobs, remove cursor state
6. [Task 80: Barrel exports and integration tests](../tasks/milestone-16-job-tracking-system/task-80-barrel-exports-integration-tests.md) — Export from services/index.ts, end-to-end job lifecycle test

---

## Testing Requirements

- [ ] Unit: JobService CRUD operations (create, get, update, cancel, cleanup)
- [ ] Unit: ImportJobWorker step tracking, progress, cancellation, partial failure
- [ ] Unit: SVC client JobsResource methods and poll helper
- [ ] Integration: Full import job lifecycle (create → execute → poll → complete)
- [ ] Edge cases: empty import, single-chunk, all-fail, cancel mid-execution

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Breaking change to import API (sync → async) | Medium | Certain | Only consumer is agentbase.me (we control it). Coordinate update. |
| Firestore write volume per job | Low | Low | ~100 writes per 50-chunk import. Negligible at Firestore pricing. Batch if needed. |
| Cloud Run Job cold starts | Low | Medium | Keep container image small. Jobs are not latency-sensitive. |

---

**Next Milestone**: TBD
**Blockers**: None
**Notes**: Design doc: agent/design/local.job-tracking-system.md. Clarification: agent/clarifications/clarification-5-job-tracking-system.md.
