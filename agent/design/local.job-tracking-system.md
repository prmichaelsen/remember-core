# Job Tracking System

**Concept**: Async job infrastructure for long-running operations — Firestore-backed state, Cloud Run Jobs execution, REST polling for progress
**Created**: 2026-03-04
**Status**: Design Specification
**Source**: agent/drafts/jobs.draft.md, agent/clarifications/clarification-5-job-tracking-system.md

---

## Overview

Long-running operations in remember-core (bulk imports, REM cycles) currently block the caller's UX thread with no progress indication, health reporting, or failure recovery. The chat platform (agentbase.me) cannot show users whether a bulk import is healthy, how far along it is, or whether it has failed.

This design adds a `JobService` to remember-core that provides:
1. Firestore-backed job state and progress tracking
2. Stepped progress reporting with per-step error detail
3. REST polling API for consumers to check job status
4. Cloud Run Jobs as the execution backend (not in-process)
5. Per-job-type TTL for automatic cleanup
6. Migration of ImportService onto the job architecture

The system is designed to be extensible to future job types (bulk delete, bulk export, re-indexing, deduplication) without architectural changes.

---

## Problem Statement

- **UX blocking**: `ImportService.import()` is synchronous — the REST server holds the connection open while processing potentially hundreds of chunks. The chat platform's UX thread is blocked for the entire duration.
- **No progress visibility**: Consumers have no way to know how far along an import is, whether it's healthy, or whether it has silently failed.
- **No failure recovery**: If an import fails partway through, there's no record of what succeeded and what didn't. The user must start over.
- **REM opacity**: REM cycles run as a cron with no observability into individual cycle health, timing, or failures.
- **Scaling**: As remember-core adds more long-running operations (bulk delete, export, re-indexing), each would need ad-hoc async handling without a shared job infrastructure.

---

## Solution

### Architecture

```
Consumer (agentbase.me, MCP server)
  │
  ├─ POST /api/svc/v1/memories/import
  │    → 202 Accepted { job_id }
  │
  ├─ GET /api/svc/v1/jobs/:id  (poll every 3s)
  │    → { id, type, status, progress, current_step, steps[], ... }
  │
  └─ POST /api/svc/v1/jobs/:id/cancel
       → { status: 'cancelled' }

REST Server (Cloud Run Service)
  │
  ├─ JobService.create(type, params)
  │    → Creates Firestore job record (status: 'pending')
  │    → Triggers Cloud Run Job execution
  │    → Returns job_id
  │
  └─ JobService.getStatus(job_id)
       → Reads Firestore job record

Cloud Run Job (triggered worker)
  │
  ├─ Reads job record from Firestore
  ├─ Executes job logic (ImportService, RemService, etc.)
  ├─ Updates Firestore with step progress
  └─ Marks job completed/failed on finish
```

### Key Design Decisions

| Decision | Outcome | Rationale |
|----------|---------|-----------|
| Transport | REST polling (3s default) | Works with existing Cloudflare + Cloud Run stack, zero new infra, boring and reliable |
| Execution | Cloud Run Jobs (triggered) | Not in-process — avoids REST server timeout concerns, isolated execution |
| Persistence | Firestore `jobs` collection | Top-level for efficient scanning, indexed on `user_id` |
| Progress model | Stepped (`steps[]` array) | Enough detail for progress bars + step-level errors, not over-engineered |
| Partial failure | `completed_with_errors` status | Preserves successful work, reports per-step failures |
| Import migration | Fully onto job architecture | `ImportService` becomes job-native, not a wrapper around sync code |
| REM migration | Daily cron creates per-collection jobs | Replaces round-robin cursor with discrete, observable jobs |
| Cancellation | Supported in MVP | Job checks cancellation flag between steps |
| Pause/resume | State machine supports it, not implemented in MVP | Forward-compatible without premature complexity |

### Alternatives Considered

- **Webhooks**: Requires agentbase.me to expose a webhook endpoint (new infra). Better for server-to-server. Deferred as future enhancement.
- **SSE/WebSocket**: Persistent connections don't fit serverless. Cloud Run has timeout constraints. Marginal latency improvement doesn't justify the complexity.
- **In-process execution**: REST server on Cloud Run has request timeouts. Large imports could exceed limits. Cloud Run Jobs have longer execution windows and isolated resources.
- **BullMQ/Redis queue**: Adds Redis infrastructure dependency. Cloud Run Jobs are simpler for GCP-native stack.

---

## Implementation

### 1. Job State Schema (Firestore)

```typescript
// Firestore collection: jobs/{job_id}
interface Job {
  id: string                    // UUID
  type: JobType                 // 'import' | 'rem_cycle' | ...
  status: JobStatus             // 'pending' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled' | 'paused'
  progress: number              // 0-100
  current_step: string | null   // e.g. "Processing chunk 3/10"
  steps: JobStep[]              // Ordered step records
  user_id: string | null        // null for system jobs (REM)
  params: Record<string, unknown> // Job-type-specific input params
  result: Record<string, unknown> | null // Job-type-specific output
  error: JobError | null        // Top-level error (if failed)
  ttl_hours: number             // Auto-cleanup after completion
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp
  started_at: string | null     // When execution began
  completed_at: string | null   // When execution finished
}

interface JobStep {
  id: string                    // e.g. "chunk-3"
  label: string                 // e.g. "Processing chunk 3 of 10"
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  started_at: string | null
  completed_at: string | null
  error: JobError | null        // Step-level error
}

interface JobError {
  code: string                  // e.g. 'chunk_failed', 'haiku_timeout'
  message: string               // Sanitized, consumer-safe message
  step_id?: string              // Which step failed
}

type JobType = 'import' | 'rem_cycle'
type JobStatus = 'pending' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled' | 'paused'
```

**Firestore indexes** (for efficient queries):
- `(user_id, created_at)` — "list my jobs"
- `(status, created_at)` — "find pending jobs"
- `(type, status)` — "find running imports"

### 2. JobService

```typescript
// src/services/job.service.ts

interface JobServiceDeps {
  firestore: FirebaseFirestore.Firestore
  logger: Logger
}

class JobService {
  constructor(private deps: JobServiceDeps) {}

  // Create a new job record in Firestore
  async create(input: CreateJobInput): Promise<Job>

  // Read job status (used by polling endpoint)
  async getStatus(jobId: string): Promise<Job | null>

  // List jobs for a user (with optional status filter)
  async listByUser(userId: string, options?: { status?: JobStatus, limit?: number }): Promise<Job[]>

  // Update job progress (called by worker during execution)
  async updateProgress(jobId: string, update: JobProgressUpdate): Promise<void>

  // Add a step to the job
  async addStep(jobId: string, step: JobStep): Promise<void>

  // Mark step as completed/failed
  async updateStep(jobId: string, stepId: string, update: Partial<JobStep>): Promise<void>

  // Mark job as completed/failed/cancelled
  async complete(jobId: string, result: CompleteJobInput): Promise<void>

  // Request cancellation (sets a flag; worker checks between steps)
  async cancel(jobId: string): Promise<void>

  // Check if cancellation was requested
  async isCancelled(jobId: string): Promise<boolean>

  // Clean up expired jobs (called by scheduled cleanup)
  async cleanupExpired(): Promise<number>
}

interface CreateJobInput {
  type: JobType
  user_id: string | null
  params: Record<string, unknown>
  ttl_hours: number
  steps?: JobStep[]             // Pre-defined steps if known
}

interface JobProgressUpdate {
  progress: number
  current_step: string
}

interface CompleteJobInput {
  status: 'completed' | 'completed_with_errors' | 'failed'
  result?: Record<string, unknown>
  error?: JobError
}
```

### 3. Import Job Worker

The existing `ImportService` is refactored to be job-native. Instead of a synchronous `import()` that blocks until done, it becomes a job executor that reports progress through `JobService`.

```typescript
// src/services/import-job.worker.ts

interface ImportJobParams {
  items: ImportItem[]
  chunk_size?: number
  context_conversation_id?: string
}

class ImportJobWorker {
  constructor(
    private jobService: JobService,
    private memoryService: MemoryService,
    private relationshipService: RelationshipService,
    private haikuClient: HaikuClient,
    private logger: Logger,
  ) {}

  async execute(jobId: string, userId: string, params: ImportJobParams): Promise<void> {
    // 1. Chunk all items, create step records
    const allChunks = params.items.flatMap((item, i) => {
      const chunks = chunkByTokens(item.content, params.chunk_size ?? 3000)
      return chunks.map((chunk, j) => ({ itemIndex: i, chunkIndex: j, chunk, item }))
    })

    // Register steps
    for (const [i, entry] of allChunks.entries()) {
      await this.jobService.addStep(jobId, {
        id: `chunk-${i}`,
        label: `Processing chunk ${i + 1} of ${allChunks.length}`,
        status: 'pending',
        started_at: null,
        completed_at: null,
        error: null,
      })
    }

    // 2. Process each chunk as a step
    const results: ImportItemResult[] = []
    let succeeded = 0
    let failed = 0

    for (const [i, entry] of allChunks.entries()) {
      // Check cancellation between steps
      if (await this.jobService.isCancelled(jobId)) {
        await this.jobService.complete(jobId, {
          status: 'cancelled',
          result: { processed: i, total: allChunks.length },
        })
        return
      }

      await this.jobService.updateStep(jobId, `chunk-${i}`, {
        status: 'running',
        started_at: new Date().toISOString(),
      })

      try {
        // ... create memory, link relationships ...
        await this.jobService.updateStep(jobId, `chunk-${i}`, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        succeeded++
      } catch (err) {
        await this.jobService.updateStep(jobId, `chunk-${i}`, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: { code: 'chunk_failed', message: err.message, step_id: `chunk-${i}` },
        })
        failed++
      }

      // Update overall progress
      await this.jobService.updateProgress(jobId, {
        progress: Math.round(((i + 1) / allChunks.length) * 100),
        current_step: `Processing chunk ${i + 1} of ${allChunks.length}`,
      })
    }

    // 3. Generate parent summaries + relationships (per item)
    // ... (same logic as current ImportService, but with step tracking)

    // 4. Complete job
    await this.jobService.complete(jobId, {
      status: failed > 0 ? 'completed_with_errors' : 'completed',
      result: { items: results, total_memories_created: succeeded, failed },
    })
  }
}
```

### 4. REST API

**MVP endpoints** (on remember-rest-service):

```
POST /api/svc/v1/memories/import
  → 202 Accepted
  → { job_id: "uuid" }
  → Location: /api/svc/v1/jobs/{job_id}

GET /api/svc/v1/jobs/:id
  → 200 OK
  → Job object (full state)

POST /api/svc/v1/jobs/:id/cancel
  → 200 OK
  → { status: 'cancelled' }
```

**P1 enhancement**: Generic `POST /api/svc/v1/jobs` endpoint that wraps any job type.

### 5. SVC Client SDK

```typescript
// src/clients/svc/v1/memories.ts — update import method
memories.import(userId, input)
  // Returns: SdkResponse<{ job_id: string }>
  // No longer blocks — returns immediately with job_id

// src/clients/svc/v1/jobs.ts — new resource
client.jobs.get(userId, jobId)        // GET /api/svc/v1/jobs/:id
client.jobs.cancel(userId, jobId)     // POST /api/svc/v1/jobs/:id/cancel
client.jobs.list(userId, options?)    // GET /api/svc/v1/jobs (future)

// Convenience: poll helper
client.jobs.poll(userId, jobId, {
  intervalMs: 3000,                   // default 3s
  onProgress: (job) => { ... },       // callback per poll
  timeoutMs: 600000,                  // max wait (10min default)
}): Promise<SdkResponse<Job>>
```

The `poll()` helper is a convenience wrapper that calls `get()` on an interval and resolves when the job reaches a terminal status (`completed`, `completed_with_errors`, `failed`, `cancelled`).

### 6. REM Integration

The daily cron replaces the hourly round-robin:

```
Cloud Scheduler (daily)
  → Enumerate all collections with 50+ memories
  → For each collection:
      → JobService.create({ type: 'rem_cycle', user_id: null, params: { collection_id }, ttl_hours: 24 })
      → Trigger Cloud Run Job

Cloud Run Job (per-collection):
  → RemService.runCycle(collection_id)
  → Reports progress via JobService (candidate selection, clustering, Haiku validation, CRUD)
  → Completes with relationship creation stats
```

REM jobs use `user_id: null` and include `collection_id` in params. The `rem_cursor` Firestore state is no longer needed — each collection gets a discrete job.

### 7. TTL & Cleanup

Each job type declares a default TTL:

| Job Type | Default TTL | Rationale |
|----------|-------------|-----------|
| `import` | 1 hour | User only needs progress during import; results are the memories themselves |
| `rem_cycle` | 24 hours | Auditing window for daily cycle health |

A scheduled cleanup function runs periodically (e.g., every 6 hours) and deletes jobs where `completed_at + ttl_hours < now`.

### 8. File Structure

```
src/services/
  job.service.ts              # JobService — Firestore CRUD for job state
  job.service.spec.ts         # Unit tests
  job.types.ts                # Job, JobStep, JobError, JobStatus, JobType types
  import-job.worker.ts        # Import job executor (refactored from import.service.ts)
  import-job.worker.spec.ts   # Unit tests

src/clients/svc/v1/
  jobs.ts                     # JobsResource (get, cancel, poll)
  jobs.spec.ts                # Unit tests

docs/
  openapi.yaml                # Add job endpoints + schemas
```

### 9. State Machine

```
                    ┌──────────┐
                    │ pending  │
                    └────┬─────┘
                         │ (worker picks up)
                    ┌────▼─────┐
              ┌─────│ running  │─────┐
              │     └────┬─────┘     │
              │          │           │
         (cancel    (all steps  (any step
          requested)  succeed)   fails)
              │          │           │
         ┌────▼─────┐   │    ┌──────▼──────────┐
         │cancelled │   │    │completed_with_   │
         └──────────┘   │    │errors            │
                        │    └─────────────────┘
                   ┌────▼─────┐
                   │completed │
                   └──────────┘

  Future:
    running → paused → running (pause/resume)
    failed (terminal — top-level unrecoverable error)
```

---

## Benefits

- **Non-blocking UX**: Import returns immediately with a `job_id`. Chat platform can show a progress bar.
- **Observable**: Every step is tracked with timestamps and errors. Easy to debug failures.
- **Resilient**: Partial failures preserve successful work. Failed chunks can be identified.
- **Extensible**: New job types (bulk delete, export, re-indexing) plug into the same infrastructure.
- **No new infra**: Uses existing Firestore + Cloud Run. REST polling works with existing Cloudflare CDN.
- **REM observability**: Each collection cycle becomes a discrete, observable job.

---

## Trade-offs

- **Polling latency**: 3s interval means up to 3s delay in progress updates. Acceptable for bulk operations that take minutes. Mitigated by configurable interval.
- **Firestore writes per step**: Each step update is a Firestore write. For a 50-chunk import, that's ~100 writes (step start + step complete). At Firestore pricing ($0.18/100K writes), this is negligible. Could batch updates if needed.
- **Cloud Run Job cold starts**: First job execution may have a cold start delay. Mitigated by keeping the container image small.
- **No real-time push**: Consumers must poll. For most job durations (seconds to minutes), this is fine. SSE/WebSocket can be added later if needed.
- **Breaking change to import API**: `POST /memories/import` changes from sync 200 to async 202. Consumers must update to poll. Only consumer is agentbase.me (we control it).

---

## Dependencies

- **Firestore** (remember project) — job state storage (already a dependency)
- **Cloud Run Jobs** (GCP) — job execution (new, but same GCP project)
- **Cloud Scheduler** (GCP) — REM daily cron (already used for hourly REM)
- **JobService** depends on: Firestore
- **ImportJobWorker** depends on: JobService, MemoryService, RelationshipService, HaikuClient
- **No new npm dependencies**

---

## Testing Strategy

- **Unit: JobService** — create, getStatus, updateProgress, addStep, updateStep, complete, cancel, isCancelled, cleanupExpired. Mock Firestore.
- **Unit: ImportJobWorker** — mock JobService + MemoryService + RelationshipService + HaikuClient. Verify step creation, progress updates, cancellation check, partial failure handling, completed_with_errors status.
- **Unit: SVC client jobs resource** — mock fetch, verify correct URLs/methods/bodies for get, cancel, poll.
- **Unit: poll helper** — verify interval, timeout, onProgress callback, terminal status resolution.
- **Integration** — end-to-end: create import job, execute worker, poll status, verify terminal state matches created memories.
- **Edge cases** — empty items, single-chunk import (1 step), cancellation mid-execution, all steps fail (→ `failed`), TTL cleanup.

---

## Migration Path

1. **Add job types and JobService** to remember-core (new files, no breaking changes)
2. **Refactor ImportService** into ImportJobWorker (breaking change to import API)
3. **Add job endpoints** to remember-rest-service OpenAPI spec
4. **Add JobsResource** to SVC client SDK
5. **Update agentbase.me** to use async import: call import → get job_id → poll with progress bar
6. **Update REM cron** from hourly round-robin to daily per-collection job creation
7. **Deploy Cloud Run Job** container for import + REM execution
8. **Remove old RemCursorState** Firestore schema after migration

---

## Future Considerations

- **Webhooks**: Server pushes job state changes to a consumer-provided URL. Good for server-to-server integrations.
- **Global job queue with priority**: Rate limiting and fair scheduling across users.
- **Concurrency limits**: Max N running jobs per user to prevent resource abuse.
- **Auto-retry**: Failed jobs automatically retry with exponential backoff (configurable per job type).
- **Pause/resume**: State machine already supports it. Worker checks for `paused` status between steps.
- **ETA estimation**: Track step durations per job type in a metadata collection. Use historical averages to estimate time remaining.
- **`POST /api/svc/v1/jobs` generic endpoint**: Create any job type through a single endpoint (P1).
- **Bulk delete, bulk export, re-indexing, deduplication report**: Future job types that plug into the same infrastructure.

---

**Status**: Design Specification
**Recommendation**: Implement as a new milestone in remember-core. Start with JobService + job types, then migrate ImportService, then add SVC client SDK support.
**Related Documents**:
- agent/drafts/jobs.draft.md (original draft)
- agent/clarifications/clarification-5-job-tracking-system.md (requirements)
- agent/design/local.import-service.md (current import design — will be superseded)
- agent/design/local.rem-background-relationships.md (REM design — cursor system replaced by jobs)
- agent/design/core-sdk.architecture.md (service layer pattern)
