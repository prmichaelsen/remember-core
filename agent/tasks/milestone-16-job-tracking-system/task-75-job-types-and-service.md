# Task 75: Job Types and JobService

**Milestone**: [M16 - Job Tracking System](../../milestones/milestone-16-job-tracking-system.md)
**Estimated Time**: 3-4 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Create the core job infrastructure: TypeScript types for job state and a `JobService` class that provides Firestore CRUD for job records, cancellation support, and TTL-based cleanup.

---

## Context

The job tracking system needs a persistence layer before any workers or APIs can be built. `JobService` is the foundation that all other tasks depend on. It follows the same DI pattern as other remember-core services (constructor params, Logger).

---

## Steps

### 1. Create job types (`src/services/job.types.ts`)

Define all job-related types:

- `JobType`: `'import' | 'rem_cycle'` (union, extensible)
- `JobStatus`: `'pending' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled' | 'paused'`
- `JobStep`: `{ id, label, status, started_at, completed_at, error }`
- `JobError`: `{ code, message, step_id? }`
- `Job`: Full job record (id, type, status, progress, current_step, steps, user_id, params, result, error, ttl_hours, created_at, updated_at, started_at, completed_at)
- `CreateJobInput`, `JobProgressUpdate`, `CompleteJobInput`
- `DEFAULT_TTL_HOURS`: `{ import: 1, rem_cycle: 24 }`

### 2. Create JobService (`src/services/job.service.ts`)

Methods:
- `create(input: CreateJobInput): Promise<Job>` — write to Firestore `jobs/{uuid}`
- `getStatus(jobId: string): Promise<Job | null>` — read from Firestore
- `listByUser(userId: string, options?): Promise<Job[]>` — query with composite index `(user_id, created_at)`
- `updateProgress(jobId: string, update: JobProgressUpdate): Promise<void>` — update progress + current_step + updated_at
- `addStep(jobId: string, step: JobStep): Promise<void>` — append to steps array
- `updateStep(jobId: string, stepId: string, update: Partial<JobStep>): Promise<void>` — update specific step in array
- `complete(jobId: string, input: CompleteJobInput): Promise<void>` — set terminal status, result, completed_at
- `cancel(jobId: string): Promise<void>` — set status to 'cancelled'
- `isCancelled(jobId: string): Promise<boolean>` — check status === 'cancelled'
- `cleanupExpired(): Promise<number>` — delete jobs where `completed_at + ttl_hours < now`

Constructor deps: `{ firestore: FirebaseFirestore.Firestore, logger: Logger }`

Firestore collection path: `jobs` (top-level).

### 3. Create unit tests (`src/services/job.service.spec.ts`)

Mock Firestore. Test:
- create: generates UUID, sets correct defaults (status: pending, progress: 0, steps: [])
- getStatus: returns job or null
- listByUser: filters by user_id, respects limit
- updateProgress: updates progress + current_step + updated_at
- addStep: appends step to steps array
- updateStep: updates specific step by id
- complete: sets terminal status, completed_at, result/error
- cancel: sets status to cancelled
- isCancelled: returns true/false based on status
- cleanupExpired: deletes expired jobs, returns count

---

## Verification

- [ ] `job.types.ts` exports all types: Job, JobStep, JobError, JobStatus, JobType, CreateJobInput, JobProgressUpdate, CompleteJobInput, DEFAULT_TTL_HOURS
- [ ] `job.service.ts` exports JobService with all 10 methods
- [ ] All unit tests pass
- [ ] `npm run build` compiles cleanly
- [ ] Field naming follows snake_case convention (user_id, created_at, etc.)

---

## Expected Output

**Files Created**:
- `src/services/job.types.ts`
- `src/services/job.service.ts`
- `src/services/job.service.spec.ts`

---

**Next Task**: [Task 76: ImportJobWorker](task-76-import-job-worker.md)
**Related Design Docs**: [Job Tracking System](../../design/local.job-tracking-system.md)
