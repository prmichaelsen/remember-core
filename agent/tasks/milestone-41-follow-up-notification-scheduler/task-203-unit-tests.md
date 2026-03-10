# Task 203: Unit Tests

**Milestone**: [M41 - Follow-Up Notification Scheduler](../../milestones/milestone-41-follow-up-notification-scheduler.md)
**Design Reference**: [Follow-Up Notification Scheduling](/home/prmichaelsen/.acp/projects/agentbase.me/agent/design/local.follow-up-notification-scheduling.md)
**Estimated Time**: 3 hours
**Dependencies**: Task 201
**Status**: Not Started

---

## Objective

Comprehensive unit tests for `FollowUpSchedulerService` covering scanning, webhook emission, deduplication, and retry/failure handling.

---

## Context

Tests follow the colocated `.spec.ts` pattern. Mock Weaviate client and EventBus. The test structure mirrors `rem-job.worker.spec.ts` as a reference for mocking patterns.

---

## Steps

### 1. Create Test File

Create `src/services/follow-up-scheduler.service.spec.ts`.

### 2. Test Cases

#### Scanning
- Finds memories with `follow_up_at <= now` and `follow_up_notified_at` null
- Skips memories where `follow_up_notified_at` is already set
- Skips memories where `follow_up_at` is in the future
- Handles empty collections (no due memories)
- Handles multiple collections with mixed due/not-due memories

#### Webhook Emission
- Emits `memory.follow_up_due` event with correct `FollowUpDueData` shape
- `content_preview` is truncated to ~200 chars
- `actor` is `{ type: 'system', id: 'follow-up-scheduler' }`
- Multiple due memories emit multiple events

#### Deduplication & Rescheduling
- Already-notified memories (`follow_up_notified_at >= follow_up_at`) are not emitted
- `follow_up_notified_at` is set on the memory after successful emit
- Re-running scan after notification finds no new due memories
- Rescheduled follow-up (`follow_up_at` updated to new future date after notification) triggers re-notification when new date arrives
- Rescheduled follow-up resets failure counter

#### Retry/Failure
- Failed emit increments failure counter on memory
- Memory with >= 3 failures is skipped
- Successful emit after prior failures resets counter
- Partial failure (some emit, some fail) reports correct counts

#### Entry Point
- `scanAndNotifyFollowUps()` returns `{ scanned, notified, failed }` summary
- Zero-result scan returns `{ scanned: 0, notified: 0, failed: 0 }`

### 3. Mock Setup

```typescript
// Mock Weaviate to return configurable memories per collection
// Mock EventBus.emit() to succeed or fail as configured
// Mock collection enumerator to yield test collection names
```

---

## Verification

- [ ] All test cases pass (`npx jest --config config/jest.config.js follow-up-scheduler`)
- [ ] Tests cover scanning, emission, dedup, retry, and entry point
- [ ] No skipped or pending tests
- [ ] Test file colocated at `src/services/follow-up-scheduler.service.spec.ts`

---

**Related**: `src/services/rem-job.worker.spec.ts` (reference for mock patterns)
