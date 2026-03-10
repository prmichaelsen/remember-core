# Task 201: FollowUpSchedulerService

**Milestone**: [M41 - Follow-Up Notification Scheduler](../../milestones/milestone-41-follow-up-notification-scheduler.md)
**Design Reference**: [Follow-Up Notification Scheduling](/home/prmichaelsen/.acp/projects/agentbase.me/agent/design/local.follow-up-notification-scheduling.md)
**Estimated Time**: 4 hours
**Dependencies**: Task 200
**Status**: Not Started

---

## Objective

Implement the `FollowUpSchedulerService` that scans Weaviate for memories with due `follow_up_at` dates, emits batched `memory.follow_up_due` webhook events, and marks memories as notified.

---

## Context

This is the core logic of the follow-up notification system. It follows the same pattern as `RemService.runCycle()` — a pure service class with injected dependencies (Weaviate client, EventBus, Logger). The service is called by a thin entry-point function (`scanAndNotifyFollowUps()`) that Cloud Scheduler invokes every minute.

The `FollowUpDueData` webhook event type already exists in `src/webhooks/events.ts`.

---

## Steps

### 1. Create FollowUpSchedulerService

Create `src/services/follow-up-scheduler.service.ts`:

```typescript
interface FollowUpSchedulerDeps {
  weaviateClient: WeaviateClient;
  eventBus: EventBus;
  logger: Logger;
  collectionEnumerator: () => AsyncIterable<string>;
}
```

### 2. Implement scanAndNotify()

The main method:

1. **Enumerate collections** — iterate all Weaviate memory collections via `collectionEnumerator`
2. **Query per collection** — filter for memories where:
   - `follow_up_at <= now` (DATE comparison)
   - `follow_up_notified_at IS NULL`
3. **Build webhook payloads** — for each due memory, construct `FollowUpDueData`:
   - `memory_id`, `title`, `owner_id`, `follow_up_at`, `content_preview` (truncated content, ~200 chars), `space_ids`, `group_ids`
4. **Emit via EventBus** — use existing `eventBus.emit()` with `actor: { type: 'system', id: 'follow-up-scheduler' }`
5. **Mark as notified** — on successful emit, update the memory: set `follow_up_notified_at` to `new Date().toISOString()`
6. **Return summary** — `{ scanned: number, notified: number, failed: number }`

### 3. Implement Retry/Failure Tracking

Per the design doc, failures are tracked per-memory:

- Use a Firestore document at `follow_up_failures/{memory_id}` with `{ attempts: number, last_attempt_at: string }`
- On emit failure: increment `attempts`, set `last_attempt_at`
- On emit success: delete the failure doc (if exists)
- If `attempts >= 3`: skip the memory in future scans
- The scanner query should also check the failure doc before attempting delivery

**Alternative (simpler)**: Use an in-memory Map for the current scan cycle. Since the scanner runs every minute, failures naturally retry on next cycle. Add a `follow_up_failure_count` integer property to Weaviate schema instead of Firestore. Increment on failure, skip when >= 3. This avoids a Firestore dependency.

Choose the simpler Weaviate-field approach unless the design owner prefers Firestore.

### 4. Create Entry Point Function

Export a top-level function (like `scheduleRemJobs()`):

```typescript
export async function scanAndNotifyFollowUps(
  deps: FollowUpSchedulerDeps,
): Promise<{ scanned: number; notified: number; failed: number }> {
  const service = new FollowUpSchedulerService(deps);
  return service.scanAndNotify();
}
```

---

## Verification

- [ ] Scanner finds memories with `follow_up_at <= now` and `follow_up_notified_at` null
- [ ] Scanner skips memories where `follow_up_notified_at` is already set
- [ ] `memory.follow_up_due` events emitted with correct `FollowUpDueData` shape
- [ ] `follow_up_notified_at` set on memory after successful emit
- [ ] Failed deliveries increment retry counter
- [ ] Memories with >= 3 failures are skipped
- [ ] Empty scan (no due memories) returns `{ scanned: 0, notified: 0, failed: 0 }`
- [ ] TypeScript compiles without errors

---

## Key Design Decisions

### Retry Strategy

| Decision | Choice | Rationale |
|---|---|---|
| Failure tracking | Weaviate field (`follow_up_failure_count`) | Simpler than Firestore doc per memory, co-located with the data being queried |
| Max retries | 3 cycles | Prevents infinite retry, matches design doc spec |
| Retry interval | Next scheduler cycle (1 minute) | Natural retry via cron cadence |

---

**Next Task**: [Task 202: Barrel Exports & Integration](task-202-barrel-exports-integration.md)
