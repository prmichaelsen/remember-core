# Milestone 41: Follow-Up Notification Scheduler

**Goal**: Implement a per-minute scheduler that scans for due `follow_up_at` memories and fires batched `memory.follow_up_due` webhook events to registered tenants
**Duration**: ~1 week
**Dependencies**: None (webhook infrastructure already exists)
**Status**: Not Started

---

## Overview

Memories in remember-core can have a `follow_up_at` field (ISO 8601 datetime) that indicates when the user wants to be reminded. Currently this field is inert — it's stored but never processed. This milestone adds a scheduler that runs every minute via GCP Cloud Scheduler, scans for due follow-ups, fires batched webhook events, and marks them as notified to prevent duplicates.

The scheduler follows the same pattern as `scheduleRemJobs()` — a pure function called by a thin Cloud Run endpoint, keeping business logic in remember-core.

---

## Deliverables

### 1. Schema Update
- `follow_up_notified_at` DATE field added to Weaviate memory schema
- `follow_up_targets` TEXT[] field added to Weaviate memory schema (e.g. `["user:abc", "group:xyz"]`, default empty = owner only)
- Memory types updated with new fields

### 2. FollowUpSchedulerService
- Weaviate query: `follow_up_at <= now AND (follow_up_notified_at IS NULL OR follow_up_at > follow_up_notified_at)`
- Batched webhook emission via existing EventBus
- Sets `follow_up_notified_at` on successful delivery
- Retry tracking: stops after 3 consecutive failed cycles per memory

### 3. Scheduler Entry Point
- `scanAndNotifyFollowUps()` exported function (like `scheduleRemJobs()`)
- Called by Cloud Scheduler via Cloud Run endpoint (wired in remember-rest-service)

### 4. Tests
- Unit tests for scanner query logic, webhook emission, dedup, retry/failure

---

## Success Criteria

- [ ] `follow_up_notified_at` and `follow_up_targets` fields exist in Weaviate schema
- [ ] Memories with `follow_up_at <= now` and no `follow_up_notified_at` (or `follow_up_at > follow_up_notified_at`) are detected
- [ ] `memory.follow_up_due` webhook events fire for due memories
- [ ] `follow_up_notified_at` is set after successful webhook delivery
- [ ] Duplicate notifications prevented (already-notified memories skipped unless rescheduled)
- [ ] Failed deliveries retry up to 3 cycles then stop
- [ ] All tests pass

---

## Key Files to Create

```
src/services/
├── follow-up-scheduler.service.ts      # FollowUpSchedulerService
└── follow-up-scheduler.service.spec.ts # Unit tests
```

---

## Tasks

1. [Task 200: Schema & Types — follow_up_notified_at](../tasks/milestone-41-follow-up-notification-scheduler/task-200-schema-types-follow-up-notified-at.md) - Add field to Weaviate schema and memory types
2. [Task 201: FollowUpSchedulerService](../tasks/milestone-41-follow-up-notification-scheduler/task-201-follow-up-scheduler-service.md) - Scanner, webhook emission, dedup, retry
3. [Task 202: Barrel Exports & Integration](../tasks/milestone-41-follow-up-notification-scheduler/task-202-barrel-exports-integration.md) - Export from services barrel, wire entry point
4. [Task 203: Unit Tests](../tasks/milestone-41-follow-up-notification-scheduler/task-203-unit-tests.md) - Comprehensive test coverage

---

## Testing Requirements

- [ ] Scanner finds due memories and skips already-notified ones
- [ ] Webhook events match `FollowUpDueData` shape
- [ ] `follow_up_notified_at` set only after HTTP 200 from webhook
- [ ] Retry counter increments on failure, stops at 3
- [ ] Empty scan (no due memories) is a no-op

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Weaviate DATE filter edge cases | Medium | Low | Test with various timezone offsets and null values |
| High volume of due follow-ups | Low | Low | Batch webhook calls, expected volume <5/day per user |

---

**Next Milestone**: TBD
**Blockers**: None
**Notes**: The `memory.follow_up_due` event type and `FollowUpDueData` interface already exist in `src/webhooks/events.ts`. The `follow_up_at` field already exists in Weaviate schema. This milestone adds the missing scheduler and tracking field.
