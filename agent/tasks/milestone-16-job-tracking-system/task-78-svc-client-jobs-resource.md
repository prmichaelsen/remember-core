# Task 78: SVC Client JobsResource

**Milestone**: [M16 - Job Tracking System](../../milestones/milestone-16-job-tracking-system.md)
**Estimated Time**: 3-4 hours
**Dependencies**: [Task 77](task-77-openapi-spec-job-endpoints.md)
**Status**: Not Started

---

## Objective

Add a `JobsResource` to the SVC client SDK with `get()`, `cancel()`, and a `poll()` convenience helper. Update `memories.import()` to return `{ job_id }` instead of the full import result.

---

## Context

The SVC client (`src/clients/svc/v1/`) follows a resource-grouped pattern. Jobs get their own resource class. The `poll()` helper is a convenience that calls `get()` on an interval until the job reaches a terminal status, making it easy for consumers to await job completion.

---

## Steps

### 1. Create JobsResource (`src/clients/svc/v1/jobs.ts`)

```typescript
interface PollOptions {
  intervalMs?: number       // default 3000
  timeoutMs?: number        // default 600000 (10min)
  onProgress?: (job: Job) => void
}

class JobsResource {
  constructor(private http: HttpClient) {}

  get(userId: string, jobId: string): Promise<SdkResponse<Job>>
  cancel(userId: string, jobId: string): Promise<SdkResponse<{ status: string }>>
  poll(userId: string, jobId: string, options?: PollOptions): Promise<SdkResponse<Job>>
}
```

### 2. Implement poll() helper

- Call `get()` every `intervalMs` (default 3s)
- Call `onProgress` callback on each poll if provided
- Resolve when job status is terminal: `completed`, `completed_with_errors`, `failed`, `cancelled`
- Reject if `timeoutMs` exceeded
- Clear interval on resolution/rejection

### 3. Update memories.import() return type

Change `MemoriesResource.import()` to return `SdkResponse<{ job_id: string }>` instead of `SdkResponse<ImportResult>`.

### 4. Register JobsResource on SVC client

Add `jobs` property to the client created by `createSvcClient()`:
```typescript
const client = createSvcClient(config);
client.jobs.get(userId, jobId)
client.jobs.cancel(userId, jobId)
client.jobs.poll(userId, jobId, { onProgress: (j) => console.log(j.progress) })
```

### 5. Create unit tests (`src/clients/svc/v1/jobs.spec.ts`)

Mock HTTP client. Test:
- get: correct URL, method, response parsing
- cancel: correct URL, method, response
- poll: resolves on completed, rejects on timeout, calls onProgress
- poll: resolves immediately if job already terminal
- memories.import: returns { job_id } shape

---

## Verification

- [ ] `JobsResource` with get, cancel, poll methods
- [ ] `poll()` respects intervalMs, timeoutMs, onProgress
- [ ] `memories.import()` return type updated
- [ ] `createSvcClient()` includes `jobs` resource
- [ ] All unit tests pass
- [ ] `npm run build` compiles cleanly

---

## Expected Output

**Files Created**:
- `src/clients/svc/v1/jobs.ts`
- `src/clients/svc/v1/jobs.spec.ts`

**Files Modified**:
- `src/clients/svc/v1/memories.ts` — import return type
- `src/clients/svc/v1/index.ts` — register JobsResource

---

**Next Task**: [Task 79: REM job migration](task-79-rem-job-migration.md)
**Related Design Docs**: [Job Tracking System](../../design/local.job-tracking-system.md), [Client SDK Architecture](../../design/local.client-sdk-architecture.md)
