# Task 99: Trust Enforcement Service Rewrite

**Milestone**: M19 — Trust Level Redesign
**Status**: not_started
**Estimated Hours**: 3–4
**Dependencies**: Task 98 (TrustLevel types)

---

## Objective

Rewrite `trust-enforcement.service.ts` to use integer TrustLevel 1–5. Remove the trust=1.0 existence-only special case. Update all formatting, labeling, and filter functions.

## Context

The current service uses float comparisons with threshold constants. With discrete integers, `formatMemoryForPrompt()` becomes a clean switch statement. The `trust=1.0` guard for cross-user access is no longer needed — level 5 (Secret) naturally requires accessor level 5 to see.

## Steps

### 1. Rewrite formatMemoryForPrompt()

Replace float tier comparisons with integer switch:

```typescript
switch (accessorLevel) {
  case TrustLevel.SECRET:    // Full access — all content
  case TrustLevel.RESTRICTED: // Partial — redact sensitive fields
  case TrustLevel.CONFIDENTIAL: // Summary only
  case TrustLevel.INTERNAL:  // Metadata only
  case TrustLevel.PUBLIC:    // Existence only
}
```

Remove the `if (!isSelfAccess && memory.trust >= 1.0)` guard entirely.

### 2. Update buildTrustFilter()

Change from `lessOrEqual(float)` to `lessOrEqual(int)`. Logic is the same, just integer values.

### 3. Update getTrustLevelLabel()

Replace float threshold comparisons with direct lookup: `TRUST_LABELS[level]`.

### 4. Update getTrustInstructions()

Replace float comparisons with switch on TrustLevel.

### 5. Update redactSensitiveFields()

No logic change needed — still redacts the same fields. Update signature if `_trust` param type changes.

### 6. Update isTrustSufficient()

Signature stays the same conceptually: `accessorTrust >= memoryTrust`. Just typed as `TrustLevel` now.

### 7. Update resolveEnforcementMode()

No change needed — this is about enforcement mode, not trust values.

## Verification

- [ ] `formatMemoryForPrompt()` uses integer switch, no float comparisons
- [ ] Trust=1.0 existence-only guard removed
- [ ] `getTrustLevelLabel()` returns correct labels for all 5 levels
- [ ] `getTrustInstructions()` returns correct instructions for all 5 levels
- [ ] `buildTrustFilter()` uses integer values
- [ ] No references to old `TRUST_THRESHOLDS` remain
