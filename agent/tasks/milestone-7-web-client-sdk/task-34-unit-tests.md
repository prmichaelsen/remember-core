# Task 34: Unit Tests

**Milestone**: M7 — Web Client SDK
**Status**: Not Started
**Estimated Hours**: 4
**Dependencies**: Tasks 28-33 (all use-case modules)

---

## Objective

Create comprehensive unit tests for all web SDK modules. Target 40-60 tests across 5-7 test suites.

## Context

Tests should mock `WebSDKContext` with the existing in-memory Weaviate mock and stub service providers. Focus on verifying:
- Result type correctness (ok vs err paths)
- Auto-confirmation in space operations
- searchAsGhost trust resolution
- Profile compound operation orchestration
- Browser guard behavior
- Error wrapping

## Steps

1. Create test suites:

   - `src/web/__tests__/result.spec.ts` (~8 tests):
     - `ok()` creates `{ ok: true, data }`, `err()` creates `{ ok: false, error }`
     - `tryCatch` wraps success, `tryCatch` wraps thrown error
     - `mapOk` transforms data, `isOk` type guard
     - Result narrows with `if (result.ok)` pattern

   - `src/web/__tests__/guard.spec.ts` (~3 tests):
     - Throws when `window` defined (mock global)
     - Does not throw when `window` undefined
     - Error message mentions credentials

   - `src/web/__tests__/memories.spec.ts` (~8 tests):
     - createMemory returns ok with memory_id
     - searchMemories returns paginated with hasMore
     - findSimilarMemories returns similar_memories
     - queryMemories returns memories with relevance
     - updateMemory returns updated_fields
     - deleteMemory returns orphaned_relationship_ids
     - Service error wrapped as WebSDKError

   - `src/web/__tests__/spaces.spec.ts` (~10 tests):
     - publishToSpace auto-confirms and returns composite_id
     - retractFromSpace auto-confirms
     - reviseInSpace auto-confirms
     - moderateSpace passes through
     - searchSpace returns hasMore
     - Token generation failure returns err
     - Confirmation failure returns err with details

   - `src/web/__tests__/ghost.spec.ts` (~8 tests):
     - searchAsGhost resolves trust level automatically
     - searchAsGhost returns redacted content
     - setUserTrust rejects self-trust
     - blockUser rejects self-block
     - checkAccess returns trust_tier

   - `src/web/__tests__/profiles.spec.ts` (~8 tests):
     - createAndPublishProfile creates + publishes in 1 call
     - Singleton enforcement returns conflict error
     - searchProfiles extracts user_id from composite IDs
     - retractProfile retracts + confirms
     - updateAndRepublishProfile updates + revises

2. Create `src/web/__tests__/helpers.ts`:
   - `createMockWebSDKContext()` — builds mock context with in-memory services
   - Reuse existing `createMockCollection` from `testing/weaviate-mock.ts`

## Verification

- [ ] 40+ tests across 5-7 suites
- [ ] All suites pass
- [ ] Mock context properly isolates tests
- [ ] Both ok and err paths tested for each use case
- [ ] Auto-confirmation tested in space operations
- [ ] searchAsGhost compound flow tested
- [ ] Build passes with tests included

## Files

- Create: `src/web/__tests__/result.spec.ts`, `guard.spec.ts`, `memories.spec.ts`, `spaces.spec.ts`, `ghost.spec.ts`, `profiles.spec.ts`, `helpers.ts`
