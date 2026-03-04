# Task 79: REM Job Migration

**Milestone**: [M16 - Job Tracking System](../../milestones/milestone-16-job-tracking-system.md)
**Estimated Time**: 3-4 hours
**Dependencies**: [Task 75](task-75-job-types-and-service.md)
**Status**: Not Started

---

## Objective

Migrate REM from hourly round-robin cursor to daily per-collection job creation. Each collection gets a discrete job that reports progress through JobService.

---

## Context

Currently, REM uses a `RemCursorState` in Firestore to track which collection to process next (startAfter-based scan). The new model: a daily cron enumerates all qualifying collections and creates one REM job per collection. Each job is a Cloud Run Job that executes `RemService.runCycle()` for that collection.

This gives per-collection observability (job status, timing, errors) and replaces the opaque cursor system.

---

## Steps

### 1. Create RemJobWorker (`src/services/rem-job.worker.ts`)

```typescript
interface RemJobParams {
  collection_id: string
}

class RemJobWorker {
  constructor(
    private jobService: JobService,
    private remService: RemService,
    private logger: Logger,
  ) {}

  async execute(jobId: string, params: RemJobParams): Promise<void>
}
```

Execute flow:
1. Register steps: candidate selection, clustering, haiku validation, relationship CRUD
2. Run `remService.runCycle()` for the collection (or break runCycle into substeps)
3. Update progress after each phase
4. Complete with run stats (relationships created/updated, clusters found)

### 2. Create REM job scheduler utility

A function that enumerates qualifying collections and creates jobs:

```typescript
async function scheduleRemJobs(
  jobService: JobService,
  collectionEnumerator: () => AsyncIterable<string>,
  logger: Logger,
): Promise<{ jobs_created: number }>
```

This is what the daily Cloud Scheduler cron will invoke. It:
- Enumerates collections with 50+ memories
- Creates a job per collection: `{ type: 'rem_cycle', user_id: null, params: { collection_id }, ttl_hours: 24 }`
- Returns count of jobs created

### 3. Update RemService (if needed)

If `RemService.runCycle()` currently depends on cursor state, refactor to accept `collection_id` directly. The cursor-based collection selection moves to the scheduler.

### 4. Deprecate RemCursorState

Mark `RemCursorState` and `RemCollectionState` types as deprecated. They'll be removed in a future version once the migration is confirmed stable.

### 5. Create unit tests (`src/services/rem-job.worker.spec.ts`)

Mock JobService, RemService. Test:
- Happy path: execute runs cycle, reports progress, completes
- REM cycle failure: job marked failed with error details
- scheduleRemJobs: creates correct number of jobs for enumerated collections
- REM job params include collection_id

---

## Verification

- [ ] `RemJobWorker` with `execute()` method
- [ ] `scheduleRemJobs()` enumerates collections and creates jobs
- [ ] REM jobs use `user_id: null`, `type: 'rem_cycle'`, `ttl_hours: 24`
- [ ] `RemCursorState` marked deprecated
- [ ] All unit tests pass
- [ ] `npm run build` compiles cleanly

---

## Expected Output

**Files Created**:
- `src/services/rem-job.worker.ts`
- `src/services/rem-job.worker.spec.ts`

**Files Modified**:
- `src/services/rem.types.ts` — deprecate cursor types
- `src/services/rem.service.ts` — accept collection_id directly (if needed)

---

**Next Task**: [Task 80: Barrel exports and integration tests](task-80-barrel-exports-integration-tests.md)
**Related Design Docs**: [Job Tracking System](../../design/local.job-tracking-system.md), [REM Background Relationships](../../design/local.rem-background-relationships.md)
