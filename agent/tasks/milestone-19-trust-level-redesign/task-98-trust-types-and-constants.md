# Task 98: Trust Types and Constants

**Milestone**: M19 — Trust Level Redesign
**Status**: not_started
**Estimated Hours**: 2–3
**Dependencies**: None (first task in milestone)

---

## Objective

Create the foundational `TrustLevel` type system with integer 1–5 values and named labels. Update `GhostConfig` types to use integer trust values.

## Context

Currently trust is a float 0–1 with threshold constants like `TRUST_THRESHOLDS.FULL_ACCESS = 1.0`. We're replacing this with a discrete integer enum and updating all type definitions that reference trust values.

## Steps

### 1. Create TrustLevel type

In `src/types/` (new file or extend existing trust types):

```typescript
export const TrustLevel = {
  PUBLIC: 1,
  INTERNAL: 2,
  CONFIDENTIAL: 3,
  RESTRICTED: 4,
  SECRET: 5,
} as const;

export type TrustLevel = (typeof TrustLevel)[keyof typeof TrustLevel];

export const TRUST_LABELS: Record<TrustLevel, string> = {
  1: 'Public',
  2: 'Internal',
  3: 'Confidential',
  4: 'Restricted',
  5: 'Secret',
};
```

### 2. Update GhostConfig types

In `src/types/ghost-config.types.ts`:
- `default_friend_trust`: change from float to `TrustLevel` (default: 2)
- `default_public_trust`: change from float to `TrustLevel` (default: 1)
- `per_user_trust`: `Record<string, TrustLevel>`

### 3. Update Memory type trust field

- `memory.trust` (or `trust_score`): change type annotation from `number` (float) to `TrustLevel`

### 4. Remove old TRUST_THRESHOLDS

- Delete `TRUST_THRESHOLDS` constant from `trust-enforcement.service.ts`
- Replace all references with `TrustLevel.*`

### 5. Update AccessResult types

- `required_trust` and `actual_trust` in `insufficient_trust` status: change to `TrustLevel`
- Remove `attempts_remaining` concept (escalation simplification happens in task-100)

## Verification

- [ ] `TrustLevel` type exported from types barrel
- [ ] `TRUST_LABELS` mapping complete for all 5 levels
- [ ] `GhostConfig` uses integer trust values
- [ ] `Memory.trust` typed as `TrustLevel`
- [ ] Old `TRUST_THRESHOLDS` constant removed
- [ ] TypeScript compiles (other files may have errors — resolved in subsequent tasks)
