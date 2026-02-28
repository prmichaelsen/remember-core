# Task 45: Tests for All Client Modules

**Milestone**: M9 — Client SDKs
**Status**: Not Started
**Estimated Hours**: 4
**Dependencies**: Task 42, Task 43, Task 44

---

## Objective

Ensure comprehensive test coverage for all client SDK modules. Fill gaps from earlier tasks and add integration-style tests.

## Steps

1. Verify existing colocated tests pass:
   - `src/clients/http.spec.ts` (from Task 38)
   - `src/clients/response.spec.ts` (from Task 38)
   - `src/clients/svc/v1/memories.spec.ts` (from Task 39)
   - `src/clients/svc/v1/spaces.spec.ts` (from Task 40)
   - `src/clients/svc/v1/trust.spec.ts` (from Task 41)
   - `src/clients/svc/v1/index.spec.ts` (from Task 42)
   - `src/app/profiles.spec.ts` (from Task 43)
   - `src/app/index.spec.ts` (from Task 43)

2. Add any missing test coverage:
   - `src/clients/svc/v1/relationships.spec.ts` — if not covered in Task 39
   - `src/clients/svc/v1/confirmations.spec.ts` — if not covered in Task 40
   - `src/clients/svc/v1/preferences.spec.ts` — if not covered in Task 41
   - `src/clients/svc/v1/health.spec.ts` — if not covered in Task 41
   - `src/app/ghost.spec.ts` — if not covered in Task 43

3. Run full test suite: `npm test`
   - All new + existing tests must pass
   - No regressions in existing test suites

## Verification

- [ ] All colocated tests pass
- [ ] No resource group left untested
- [ ] Mock fetch pattern consistent across all test files
- [ ] `npm test` passes with 0 failures
