# Task 32: Profile Compound Use Cases

**Milestone**: M7 — Web Client SDK
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 28 (memories), Task 30 (spaces)

---

## Objective

Implement the profile compound operations that combine memory CRUD with space publishing into single calls. These are web-tier-only operations not available in the svc tier.

## Context

agentbase.me's `ProfileMemoryService` (~150 lines) manually orchestrates: create profile memory → publish to 'profiles' space → confirm → parse composite ID. The web SDK collapses this to `createAndPublishProfile()`.

## Steps

1. Create `src/web/profiles.ts` with 4 functions:

   - `createAndPublishProfile(ctx, input)`:
     - Creates memory with `content_type: 'profile'`, formatted content from display_name + bio
     - Publishes to 'profiles' space via `publishToSpace()` (auto-confirmed)
     - Returns `Result<{ memory_id, space_id, composite_id }>`
     - Enforces singleton: one profile per user (check for existing profile first)

   - `searchProfiles(ctx, input)`:
     - Searches 'profiles' space via `searchSpace()`
     - Parses composite IDs to extract user_id
     - Returns `Result<PaginatedResult<ProfileSearchResult>>`

   - `retractProfile(ctx, input)`:
     - Retracts from 'profiles' space via `retractFromSpace()` (auto-confirmed)
     - Optionally soft-deletes the underlying memory
     - Returns `Result<{ retracted: true }>`

   - `updateAndRepublishProfile(ctx, input)`:
     - Updates memory content via `updateMemory()`
     - Revises in 'profiles' space via `reviseInSpace()` (auto-confirmed)
     - Returns `Result<{ memory_id, composite_id }>`

2. Add `ProfileSearchResult` to `src/web/types.ts` (if not already there)

3. Profile content formatting:
   - Build content string from `display_name`, `bio`, `tags`
   - Set `content_type: 'profile'` (or appropriate type)
   - Set tags from input

## Verification

- [ ] All 4 functions implemented and typed
- [ ] `createAndPublishProfile` creates memory + publishes in 1 call
- [ ] Singleton enforcement (error if profile already exists)
- [ ] `searchProfiles` extracts user_id from composite IDs
- [ ] `retractProfile` retracts + confirms in 1 call
- [ ] `updateAndRepublishProfile` updates + revises in 1 call
- [ ] Build passes

## Files

- Create: `src/web/profiles.ts`
- Modify: `src/web/types.ts` (add ProfileSearchResult if needed)
