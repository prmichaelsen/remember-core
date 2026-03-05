# Task 113: Unit Tests

**Objective**: Unit tests for ModerationService and SpaceService moderation integration
**Milestone**: M21 — Content Moderation
**Status**: Not Started
**Estimated Hours**: 2-3

---

## Context

Tests are colocated with source files using `.spec.ts` suffix. ModerationService tests mock HTTP responses; SpaceService tests use the mock ModerationClient.

---

## Steps

### 1. ModerationService tests

File: `src/services/moderation.service.spec.ts`

Test cases:
- **Pass verdict**: mock Haiku returning `{"pass": true}`, verify result
- **Fail verdict**: mock Haiku returning `{"pass": false, "reason": "...", "category": "hate_speech"}`, verify result
- **JSON parse error**: mock Haiku returning non-JSON, verify fail-closed
- **API error (non-200)**: mock fetch returning 500, verify fail-closed with generic message
- **Network error**: mock fetch throwing, verify fail-closed
- **Cache hit**: call moderate twice with same content, verify only one fetch
- **Cache miss**: call moderate with different content, verify two fetches
- **Cache eviction**: fill cache to max, verify oldest entry evicted

Mock approach: mock global `fetch` (or inject fetch function).

### 2. Mock ModerationClient in SpaceService tests

File: update existing `src/services/space.service.spec.ts` (or `src/services/__tests__/space.service.spec.ts`)

Test cases:
- **Publish passes moderation**: mock client returns pass, verify publish succeeds
- **Publish blocked by moderation**: mock client returns fail, verify ValidationError thrown with category + moderation context
- **Revise passes moderation**: mock client returns pass, verify revise succeeds
- **Revise blocked by moderation**: mock client returns fail, verify ValidationError thrown
- **No moderationClient**: verify publish/revise work normally (backward compat)
- **Moderation API error (fail-closed)**: mock client returns rejection, verify publish blocked

### 3. Ensure existing tests still pass

All existing SpaceService tests should use `createMockModerationClient()` (passing by default) or no moderationClient at all. Verify no regressions.

---

## Verification

- [ ] ModerationService: 8+ test cases covering pass, fail, errors, cache
- [ ] SpaceService: 6+ test cases covering publish/revise moderation
- [ ] All existing tests still pass
- [ ] Tests colocated with source files (`.spec.ts`)
- [ ] `npx jest --config config/jest.config.js` passes

---

## Dependencies

- task-111 (ModerationService)
- task-112 (SpaceService integration)
