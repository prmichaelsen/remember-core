# Task 200: Schema & Types — follow_up_notified_at

**Milestone**: [M41 - Follow-Up Notification Scheduler](../../milestones/milestone-41-follow-up-notification-scheduler.md)
**Design Reference**: [Follow-Up Notification Scheduling](/home/prmichaelsen/.acp/projects/agentbase.me/agent/design/local.follow-up-notification-scheduling.md)
**Estimated Time**: 1 hour
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add `follow_up_notified_at` field to the Weaviate memory schema and TypeScript memory types. This field tracks whether a follow-up webhook has been delivered, preventing duplicate notifications.

---

## Context

The `follow_up_at` field already exists in the schema (`src/database/weaviate/v2-collections.ts` line 128) and memory types (`src/types/memory.types.ts` line 149). The new `follow_up_notified_at` field is the delivery-tracking counterpart — set after successful webhook delivery, used by the scanner to skip already-notified memories.

---

## Steps

### 1. Add Weaviate Schema Property

In `src/database/weaviate/v2-collections.ts`, add `follow_up_notified_at` as a DATE field next to the existing `follow_up_at`:

```typescript
{ name: 'follow_up_notified_at', dataType: configure.dataType.DATE },
```

### 2. Update Memory Types

In `src/types/memory.types.ts`, add to the Memory interface near the existing `follow_up_at`:

```typescript
follow_up_notified_at?: string; // ISO 8601 — set after successful webhook delivery
```

### 3. Update MemoryService Create Input

In `src/services/memory.service.ts`, ensure the new field defaults to `null` in the create path (alongside the existing `follow_up_at` default):

```typescript
follow_up_notified_at: null,
```

---

## Verification

- [ ] `follow_up_notified_at` property exists in `v2-collections.ts` schema definition
- [ ] `follow_up_notified_at` field exists in Memory type interface
- [ ] MemoryService create sets `follow_up_notified_at` to `null` by default
- [ ] TypeScript compiles without errors (`npm run typecheck`)
- [ ] Existing tests still pass (`npm test`)

---

**Next Task**: [Task 201: FollowUpSchedulerService](task-201-follow-up-scheduler-service.md)
