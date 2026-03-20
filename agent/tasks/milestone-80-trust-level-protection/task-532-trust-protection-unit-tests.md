# Task 532: Unit tests for trust level protection

**Milestone**: M80 — Trust Level Protection
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: task-531

---

## Objective

Add comprehensive unit tests for the new trust level protection behavior. Tests are colocated with source (`.spec.ts` suffix).

---

## Steps

### 1. Update existing memory.service.spec.ts tests

- Update "applies custom weight and trust" test → verify trust_score is always 5 regardless
- Remove any test that creates memories with custom trust
- Remove any test that updates trust via `update()`
- Add test: "create always sets trust_score to SECRET (5)"
- Add test: "create ignores trust in input" (if someone passes it via `as any`)

### 2. New tests for requestSetTrustLevel

In existing `memory.service.spec.ts` or new section:

- `requestSetTrustLevel` returns token with correct payload
- `requestSetTrustLevel` throws on invalid trust level (0, 6, 2.5)
- `requestSetTrustLevel` throws on memory not found
- `requestSetTrustLevel` throws on unauthorized (different user)
- `requestSetTrustLevel` throws on deleted memory
- `requestSetTrustLevel` throws if already at requested level
- `requestSetTrustLevel` throws if confirmationTokenService not configured

### 3. New tests for confirmSetTrustLevel

- `confirmSetTrustLevel` applies trust change and bumps version
- `confirmSetTrustLevel` throws on invalid token
- `confirmSetTrustLevel` throws on expired token
- `confirmSetTrustLevel` throws on wrong action type
- `confirmSetTrustLevel` verifies ownership before applying

### 4. Run full test suite

- `npx jest --config config/jest.config.js`
- Verify no regressions

---

## Verification

- [ ] All new tests pass
- [ ] No existing test regressions
- [ ] Coverage includes create-defaults-to-SECRET, request, confirm, error paths
- [ ] Tests use colocated `.spec.ts` pattern
