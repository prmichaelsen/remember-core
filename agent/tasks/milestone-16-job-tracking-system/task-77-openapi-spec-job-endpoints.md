# Task 77: OpenAPI Spec and Job REST Endpoints

**Milestone**: [M16 - Job Tracking System](../../milestones/milestone-16-job-tracking-system.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 75](task-75-job-types-and-service.md)
**Status**: Not Started

---

## Objective

Define job endpoints and schemas in the OpenAPI spec (`docs/openapi.yaml`) and update the import endpoint to return `202 Accepted` with a `job_id`.

---

## Context

The SVC client SDK generates types from the OpenAPI spec. Job endpoints need to be defined here so that `JobsResource` in the SDK has typed request/response shapes. The import endpoint changes from sync `200` to async `202`.

---

## Steps

### 1. Add job schemas to `docs/openapi.yaml`

Under `components/schemas`:
- `Job` — full job record (id, type, status, progress, current_step, steps, user_id, params, result, error, ttl_hours, created_at, updated_at, started_at, completed_at)
- `JobStep` — step record
- `JobError` — error record
- `JobStatus` — enum
- `JobType` — enum
- `CancelJobResponse` — `{ status: 'cancelled' }`

### 2. Add job endpoints

```yaml
/api/svc/v1/jobs/{jobId}:
  get:
    summary: Get job status
    operationId: getJobStatus
    parameters:
      - name: jobId
        in: path
        required: true
        schema: { type: string }
    responses:
      '200':
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Job'
      '404':
        description: Job not found

/api/svc/v1/jobs/{jobId}/cancel:
  post:
    summary: Cancel a running job
    operationId: cancelJob
    parameters:
      - name: jobId
        in: path
        required: true
        schema: { type: string }
    responses:
      '200':
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CancelJobResponse'
```

### 3. Update import endpoint

Change `POST /api/svc/v1/memories/import`:
- Response code: `200` → `202`
- Response body: `{ job_id: string }` (instead of full ImportResult)
- Add `Location` header: `/api/svc/v1/jobs/{job_id}`

### 4. Regenerate types

Run `npm run generate:types:svc` to regenerate `src/clients/svc/v1/types.generated.ts` with new job types.

---

## Verification

- [ ] `docs/openapi.yaml` contains Job, JobStep, JobError schemas
- [ ] GET /jobs/:id and POST /jobs/:id/cancel endpoints defined
- [ ] POST /memories/import response changed to 202 + job_id
- [ ] `npm run generate:types:svc` succeeds
- [ ] Generated types include job-related interfaces
- [ ] `npm run build` compiles cleanly

---

## Expected Output

**Files Modified**:
- `docs/openapi.yaml` — job schemas + endpoints, import endpoint updated
- `src/clients/svc/v1/types.generated.ts` — regenerated

---

**Next Task**: [Task 78: SVC client JobsResource](task-78-svc-client-jobs-resource.md)
**Related Design Docs**: [Job Tracking System](../../design/local.job-tracking-system.md)
