# Task 84: Wire Async Import Endpoint

**Milestone**: [M16 - Job Tracking System](../milestones/milestone-16-job-tracking-system.md) (follow-up)
**Estimated Time**: 2-3 hours
**Dependencies**: task-76 (ImportJobWorker), task-77 (OpenAPI spec)
**Status**: Not Started

---

## Objective

Wire the REST server's `POST /api/svc/v1/memories/import` route handler to create a job via `JobService` and dispatch to `ImportJobWorker`, returning `{ job_id }` with HTTP 202 instead of blocking on the synchronous `ImportService.import()`.

---

## Context

M16 delivered all the infrastructure for async job-based imports:
- `ImportJobWorker` — per-chunk stepped execution with progress, cancellation, partial failure
- `JobService` — Firestore-backed job CRUD, step tracking, progress updates
- OpenAPI spec updated to return 202 + `{ job_id }` from the import endpoint
- SVC client SDK types already declare `SdkResponse<{ job_id: string }>` for `memories.import()`

However, the actual route handler (in the REST server consuming remember-core) still calls `ImportService.import()` synchronously and returns the full `ImportResult`. The client (agentbase.me) has been patched to handle both sync and async responses, but the intent is for the server to return `{ job_id }` immediately.

**Key gap**: The REST server route needs to:
1. Create a job via `jobService.create({ type: 'import', ... })`
2. Fire `importJobWorker.execute(jobId, userId, params)` without awaiting (or dispatch to Cloud Run Job)
3. Return `{ job_id }` with status 202

---

## Steps

### 1. Locate the Import Route Handler

Find the route handler in the REST server (likely `remember-rest-server` or equivalent) that handles `POST /api/svc/v1/memories/import`.

### 2. Replace Synchronous Call with Job Creation

```typescript
// Before (synchronous):
const result = await importService.import(input);
return res.json(result);

// After (async job-based):
const jobId = await jobService.create({
  type: 'import',
  user_id: userId,
  params: { items: input.items, chunk_size: input.chunk_size, context_conversation_id: input.context_conversation_id },
});

// Fire-and-forget (or dispatch to Cloud Run Job)
importJobWorker.execute(jobId, userId, input).catch(err => {
  logger.error('Import job failed', { job_id: jobId, error: err });
  jobService.complete(jobId, { status: 'failed', error: { code: 'execution_error', message: err.message } });
});

return res.status(202).json({ job_id: jobId });
```

### 3. Ensure Job Dependencies Are Wired

The route handler needs access to both `JobService` and `ImportJobWorker` (already exported from remember-core barrels).

### 4. Update Tests

- Route handler test: assert 202 status and `{ job_id }` response shape
- Integration test: verify job appears in Firestore after import request

---

## Verification

- [ ] `POST /api/svc/v1/memories/import` returns HTTP 202 with `{ job_id: string }`
- [ ] Job record created in Firestore with type `import`
- [ ] `ImportJobWorker.execute()` is invoked (fire-and-forget or dispatched)
- [ ] `GET /api/svc/v1/jobs/:jobId` returns job status after import request
- [ ] Client SDK `svc.memories.import()` receives `{ job_id }` (no code change needed — types already match)
- [ ] Existing import tests updated or replaced
- [ ] Build passes, no type errors

---

## Notes

- The agentbase.me client already handles both sync and async responses (0.42.1 fix), so this is a non-breaking change
- Once this is deployed, the sync fallback path in agentbase.me can be removed
- Consider whether `importJobWorker.execute()` should be dispatched to Cloud Run Jobs for isolation, or if fire-and-forget in the request process is acceptable for now

---

**Related Design Docs**: [Job Tracking System](../design/local.job-tracking-system.md), [Import Service](../design/local.import-service.md)
