# Task 76: ImportJobWorker

**Milestone**: [M16 - Job Tracking System](../../milestones/milestone-16-job-tracking-system.md)
**Estimated Time**: 4-6 hours
**Dependencies**: [Task 75](task-75-job-types-and-service.md)
**Status**: Not Started

---

## Objective

Refactor `ImportService` into an `ImportJobWorker` that executes import operations as job steps, reporting progress through `JobService`. Each chunk becomes a step with individual success/failure tracking.

---

## Context

The current `ImportService.import()` is synchronous — it blocks until all chunks are processed. The job system requires it to be step-aware: register steps upfront, process each with progress updates, check cancellation between steps, and report partial failures.

The existing `chunkByTokens()` utility and HaikuClient integration remain unchanged. The refactoring is about orchestration, not chunking logic.

---

## Steps

### 1. Create ImportJobWorker (`src/services/import-job.worker.ts`)

```typescript
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

  async execute(jobId: string, userId: string, params: ImportJobParams): Promise<void>
}
```

### 2. Implement execute() flow

1. Chunk all items, flatten into a single ordered step list
2. Register all steps via `jobService.addStep()` (status: pending)
3. Process each chunk:
   - Check `jobService.isCancelled()` before each step
   - Mark step running → create memory → mark step completed
   - On error: mark step failed with `JobError`, continue to next step
   - Update overall progress via `jobService.updateProgress()`
4. After all chunks: generate parent summaries per item, create relationships
5. Complete job:
   - If all steps succeeded: `completed`
   - If any failed: `completed_with_errors`
   - If cancelled: `cancelled`
   - Store `ImportResult`-shaped data in `job.result`

### 3. Preserve existing chunkByTokens and estimateTokens

These stay in `import.service.ts` (or move to a shared utility). `ImportJobWorker` imports them. The original `ImportService` class can remain for backward compatibility or be deprecated.

### 4. Create unit tests (`src/services/import-job.worker.spec.ts`)

Mock JobService, MemoryService, RelationshipService, HaikuClient. Test:
- Happy path: 3 items × 2 chunks = 6 steps, all complete
- Cancellation: cancel after step 2, job status cancelled, remaining steps skipped
- Partial failure: 1 chunk fails, job status completed_with_errors, failed step has error
- All fail: every chunk fails, job status failed
- Single item, single chunk: 1 step
- Empty items: job completes immediately with 0 steps
- Progress updates: verify progress goes 0 → 17 → 33 → ... → 100

---

## Verification

- [ ] `ImportJobWorker` class with `execute()` method
- [ ] Steps registered before processing begins
- [ ] Cancellation checked between each step
- [ ] Partial failure produces `completed_with_errors`
- [ ] Progress updated after each step
- [ ] Parent summaries and relationships created after chunks
- [ ] All unit tests pass
- [ ] `npm run build` compiles cleanly

---

## Expected Output

**Files Created**:
- `src/services/import-job.worker.ts`
- `src/services/import-job.worker.spec.ts`

---

**Next Task**: [Task 77: OpenAPI spec and job REST endpoints](task-77-openapi-spec-job-endpoints.md)
**Related Design Docs**: [Job Tracking System](../../design/local.job-tracking-system.md), [Import Service](../../design/local.import-service.md)
