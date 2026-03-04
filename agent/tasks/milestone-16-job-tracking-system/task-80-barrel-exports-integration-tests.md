# Task 80: Barrel Exports and Integration Tests

**Milestone**: [M16 - Job Tracking System](../../milestones/milestone-16-job-tracking-system.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 75](task-75-job-types-and-service.md), [Task 76](task-76-import-job-worker.md), [Task 78](task-78-svc-client-jobs-resource.md), [Task 79](task-79-rem-job-migration.md)
**Status**: Not Started

---

## Objective

Export all new job modules from barrel files and create integration tests that verify the full job lifecycle end-to-end.

---

## Context

All job modules are created in prior tasks. This task wires them into the public API (barrel exports) and verifies the system works end-to-end with integration tests.

---

## Steps

### 1. Update `src/services/index.ts`

Add exports for:
- All types from `job.types.ts` (Job, JobStep, JobError, JobStatus, JobType, CreateJobInput, etc.)
- `JobService` from `job.service.ts`
- `ImportJobWorker` and `ImportJobParams` from `import-job.worker.ts`
- `RemJobWorker`, `RemJobParams`, `scheduleRemJobs` from `rem-job.worker.ts`

### 2. Update `src/clients/svc/v1/index.ts`

Ensure `JobsResource` is exported and registered on the svc client factory.

### 3. Create integration test

`src/services/job.integration.spec.ts` (or in the e2e test config):

Test the full import job lifecycle:
1. Create a job via `JobService.create()` with import params
2. Execute via `ImportJobWorker.execute()` (mock MemoryService/RelationshipService/HaikuClient)
3. After each step, verify `JobService.getStatus()` reflects correct progress
4. After completion, verify terminal status + result shape
5. Verify `cleanupExpired()` removes the job after TTL

Test cancellation flow:
1. Create job, start executing
2. Cancel via `JobService.cancel()` after first step
3. Verify worker stops, job status = cancelled

Test partial failure:
1. Mock one chunk to fail
2. Verify job status = completed_with_errors
3. Verify failed step has JobError

### 4. Verify all tests pass

Run full test suite: `npm test` + `npm run test:e2e`

---

## Verification

- [ ] `src/services/index.ts` exports all job types + JobService + workers
- [ ] `src/clients/svc/v1/index.ts` exports JobsResource
- [ ] Integration test: full import job lifecycle passes
- [ ] Integration test: cancellation flow passes
- [ ] Integration test: partial failure flow passes
- [ ] All existing tests still pass (536+ existing)
- [ ] `npm run build` compiles cleanly

---

## Expected Output

**Files Created**:
- `src/services/job.integration.spec.ts`

**Files Modified**:
- `src/services/index.ts` — add job exports
- `src/clients/svc/v1/index.ts` — add JobsResource export

---

**Next Task**: None (milestone complete)
**Related Design Docs**: [Job Tracking System](../../design/local.job-tracking-system.md)
