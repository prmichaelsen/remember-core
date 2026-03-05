# Task 100: Access Control and Escalation Simplification

**Milestone**: M19 — Trust Level Redesign
**Status**: not_started
**Estimated Hours**: 2–3
**Dependencies**: Task 98 (TrustLevel types)

---

## Objective

Update access-control.service.ts to use integer TrustLevel. Simplify escalation by dropping the -0.1 penalty — escalation becomes deny -> deny -> block.

## Context

The current escalation penalty (-0.1) was always cosmetic — it appeared in the response's `actual_trust` field but never mutated stored trust in GhostConfig. With integer trust levels, fractional penalties don't make sense. Simplify to: first two denials are informational, third triggers a block.

## Steps

### 1. Update checkMemoryAccess()

- Use `TrustLevel` for trust comparisons
- No logic change to the access flow itself

### 2. Simplify handleInsufficientTrust()

Remove penalty calculation. New behavior:

```typescript
async function handleInsufficientTrust(...): Promise<AccessResult> {
  const attempt = await escalationStore.incrementAttempts(...);

  if (attempt.count >= MAX_ATTEMPTS_BEFORE_BLOCK) {
    // Block
    await escalationStore.setBlock(...);
    return { status: 'blocked', ... };
  }

  return {
    status: 'insufficient_trust',
    memory_id: memoryId,
    required_trust: requiredTrust,  // TrustLevel integer
    actual_trust: actualTrust,      // TrustLevel integer (no penalty subtraction)
    attempts_remaining: MAX_ATTEMPTS_BEFORE_BLOCK - attempt.count,
  };
}
```

### 3. Remove TRUST_PENALTY constant

Delete `export const TRUST_PENALTY = 0.1`.

### 4. Update resolveAccessorTrustLevel()

Return `TrustLevel` integer instead of float. `GhostConfig` values are already integers after task-98.

### 5. Update suggestTrustLevel() in trust-validator

Map content types to integer levels:
- journal/memory/event → `TrustLevel.RESTRICTED` (4)
- system/audit/action/history → `TrustLevel.CONFIDENTIAL` (3)
- invoice/contract → `TrustLevel.CONFIDENTIAL` (3)
- email/conversation/meeting → `TrustLevel.CONFIDENTIAL` (3)
- ghost → `TrustLevel.RESTRICTED` (4)
- default → `TrustLevel.INTERNAL` (2)

Tag overrides:
- `'private'` / `'secret'` → `TrustLevel.SECRET` (5)
- `'public'` → `TrustLevel.PUBLIC` (1)

### 6. Update validateTrustAssignment()

Check integer 1–5 range instead of float 0–1.

### 7. Update formatAccessResultMessage()

Use `TRUST_LABELS[level]` instead of `.toFixed(2)` for trust display.

## Verification

- [ ] `TRUST_PENALTY` constant removed
- [ ] `handleInsufficientTrust` no longer subtracts penalty
- [ ] Escalation flow: deny → deny → block (3 attempts)
- [ ] `resolveAccessorTrustLevel` returns TrustLevel integer
- [ ] `suggestTrustLevel` returns TrustLevel integer with correct mappings
- [ ] `validateTrustAssignment` validates integer 1–5
- [ ] Tag overrides: 'public' → 1, 'private'/'secret' → 5
