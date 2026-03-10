# Task 202: Barrel Exports & Integration

**Milestone**: [M41 - Follow-Up Notification Scheduler](../../milestones/milestone-41-follow-up-notification-scheduler.md)
**Design Reference**: [Follow-Up Notification Scheduling](/home/prmichaelsen/.acp/projects/agentbase.me/agent/design/local.follow-up-notification-scheduling.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 201
**Status**: Not Started

---

## Objective

Export `FollowUpSchedulerService` and `scanAndNotifyFollowUps` from the services barrel so remember-rest-service can wire it into a Cloud Scheduler endpoint.

---

## Context

The pattern matches how `scheduleRemJobs` is exported from `src/services/index.ts` and consumed by remember-rest-service as a cron endpoint. The REST service will create a `POST /api/internal/follow-up-scan` endpoint (or similar) that Cloud Scheduler calls every minute.

---

## Steps

### 1. Update Services Barrel

In `src/services/index.ts`, add exports:

```typescript
export {
  FollowUpSchedulerService,
  scanAndNotifyFollowUps,
} from './follow-up-scheduler.service.js';
```

### 2. Verify Build

Run `npm run build` to ensure the new exports compile and are included in `dist/`.

### 3. Document REST Integration

Add a note to the milestone doc specifying how remember-rest-service should wire this:

- Create a NestJS controller endpoint (e.g., `POST /api/internal/follow-up-scan`)
- Inject `FollowUpSchedulerService` deps (WeaviateClient, EventBus, Logger, collectionEnumerator)
- Call `scanAndNotifyFollowUps(deps)` and return the result
- Configure GCP Cloud Scheduler to call this endpoint every minute

This wiring is a remember-rest-service task (not in remember-core scope).

---

## Verification

- [ ] `FollowUpSchedulerService` exported from `@prmichaelsen/remember-core/services`
- [ ] `scanAndNotifyFollowUps` exported from `@prmichaelsen/remember-core/services`
- [ ] `npm run build` succeeds
- [ ] No circular dependency issues

---

**Next Task**: [Task 203: Unit Tests](task-203-unit-tests.md)
