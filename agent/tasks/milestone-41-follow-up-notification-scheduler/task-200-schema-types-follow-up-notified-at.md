# Task 200: Schema & Types — follow_up_notified_at

**Milestone**: [M41 - Follow-Up Notification Scheduler](../../milestones/milestone-41-follow-up-notification-scheduler.md)
**Design Reference**: [Follow-Up Notification Scheduling](/home/prmichaelsen/.acp/projects/agentbase.me/agent/design/local.follow-up-notification-scheduling.md)
**Estimated Time**: 1 hour
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add `follow_up_notified_at` and `follow_up_targets` fields to the Weaviate memory schema and TypeScript memory types. `follow_up_notified_at` tracks whether a follow-up webhook has been delivered. `follow_up_targets` specifies who to notify (default: owner only).

---

## Context

The `follow_up_at` field already exists in the schema (`src/database/weaviate/v2-collections.ts` line 128) and memory types (`src/types/memory.types.ts` line 149). Two new fields:
- `follow_up_notified_at` — delivery tracking, set after successful webhook delivery. Scanner skips memories where `follow_up_notified_at >= follow_up_at` (supports reschedule/snooze).
- `follow_up_targets` — who to notify. Format: `user:<id>` or `group:<group_id>`. Empty/null defaults to owner only.

---

## Steps

### 1. Add Weaviate Schema Property

In `src/database/weaviate/v2-collections.ts`, add `follow_up_notified_at` as a DATE field next to the existing `follow_up_at`:

```typescript
{ name: 'follow_up_notified_at', dataType: configure.dataType.DATE },
{ name: 'follow_up_targets', dataType: configure.dataType.TEXT_ARRAY },
```

### 2. Update Memory Types

In `src/types/memory.types.ts`, add to the Memory interface near the existing `follow_up_at`:

```typescript
follow_up_notified_at?: string; // ISO 8601 — set after successful webhook delivery
follow_up_targets?: string[];   // e.g. ["user:abc", "group:xyz"]. Empty = owner only.
```

### 3. Update MemoryService Create Input

In `src/services/memory.service.ts`, ensure the new field defaults to `null` in the create path (alongside the existing `follow_up_at` default):

```typescript
follow_up_notified_at: null,
follow_up_targets: [],
```

---

## Verification

- [ ] `follow_up_notified_at` property exists in `v2-collections.ts` schema definition
- [ ] `follow_up_targets` property exists in `v2-collections.ts` schema definition
- [ ] Both fields exist in Memory type interface
- [ ] MemoryService create sets `follow_up_notified_at` to `null` and `follow_up_targets` to `[]` by default
- [ ] TypeScript compiles without errors (`npm run typecheck`)
- [ ] Existing tests still pass (`npm test`)

---

**Next Task**: [Task 201: FollowUpSchedulerService](task-201-follow-up-scheduler-service.md)
