# Task 530: Remove trust from create/update + hardcode SECRET

**Milestone**: M80 — Trust Level Protection
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: None

---

## Objective

Remove the `trust` field from `CreateMemoryInput` and `UpdateMemoryInput`, hardcode all new memories to `TrustLevel.SECRET` (5), and make `update()` reject trust changes.

---

## Steps

### 1. Update `CreateMemoryInput` (memory.service.ts)
- Remove `trust?: number` field from interface
- In `MemoryService.create()`, change line 549 from:
  ```typescript
  trust_score: normalizeTrustScore(input.trust ?? TrustLevel.INTERNAL),
  ```
  to:
  ```typescript
  trust_score: TrustLevel.SECRET,
  ```

### 2. Update `UpdateMemoryInput` (memory.service.ts)
- Remove `trust?: number` field from interface
- In `MemoryService.update()`, remove lines 1558-1561 (the trust update block)

### 3. Update existing tests
- Find all tests that set `trust` on `CreateMemoryInput` — remove or update assertions
- Find all tests that set `trust` on `UpdateMemoryInput` — update to expect errors or remove
- Verify all tests that check `trust_score` on created memories expect `5` (SECRET)

### 4. Check callers
- Search for `.create({` and `trust:` to find any internal callers passing trust
- Update callers to remove `trust` param (REM, ImportService, MoodSync, etc.)

---

## Verification

- [ ] `CreateMemoryInput` has no `trust` field
- [ ] `MemoryService.create()` always sets `trust_score: 5`
- [ ] `UpdateMemoryInput` has no `trust` field
- [ ] `MemoryService.update()` does not handle trust
- [ ] All existing tests pass with updated assertions
- [ ] `npm run build` succeeds (no TypeScript errors from removed field)
