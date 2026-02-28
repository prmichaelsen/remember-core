# Task 30: Space Use Cases (Collapsed Confirmations)

**Milestone**: M7 — Web Client SDK
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 27 (WebSDKContext)

---

## Objective

Implement space publishing, retraction, revision, moderation, search, and query use-case functions. The key value-add: publish/retract/revise collapse the two-phase confirmation flow into a single call.

## Context

The svc-tier REST API requires 3 calls to publish: `POST /spaces/publish` → get token → `POST /confirmations/{token}/confirm`. The web SDK collapses this by calling SpaceService.publish() to get the token, then immediately calling SpaceService.confirm() internally. The consumer never sees confirmation tokens.

## Steps

1. Create `src/web/spaces.ts` with 7 functions:

   **Collapsed operations (auto-confirm)**:
   - `publishToSpace(ctx, input)` → calls SpaceService.publish() + SpaceService.confirm()
     - Returns `Result<{ composite_id, published_to, space_ids, group_ids, results }>`
   - `retractFromSpace(ctx, input)` → calls SpaceService.retract() + SpaceService.confirm()
     - Returns `Result<{ retracted_from, results }>`
   - `reviseInSpace(ctx, input)` → calls SpaceService.revise() + SpaceService.confirm()
     - Returns `Result<{ revised_at, memory_id }>`

   **Direct operations**:
   - `moderateSpace(ctx, input)` → calls SpaceService.moderate()
     - Returns `Result<{ memory_id, action, moderation_status, moderated_by, moderated_at, location }>`
   - `searchSpace(ctx, input)` → calls SpaceService.search()
     - Returns `Result<{ spaces_searched, groups_searched, memories, total, offset, limit, hasMore }>`
   - `querySpace(ctx, input)` → calls SpaceService.query()
     - Returns `Result<{ question, spaces_queried, memories, total }>`

2. Add `SpaceSearchResult`, `LocationResult` to `src/web/types.ts`

3. Collapsed functions must handle:
   - Token generation failure → return `err`
   - Confirmation failure → return `err` with partial results if available
   - Both steps succeed → return `ok` with merged result

## Verification

- [ ] All 7 functions implemented and typed
- [ ] publish/retract/revise auto-confirm without exposing tokens
- [ ] Partial failure in two-phase operations returns meaningful error
- [ ] Search/query results include `hasMore`
- [ ] Moderation requires no confirmation
- [ ] Build passes

## Files

- Create: `src/web/spaces.ts`
- Modify: `src/web/types.ts` (add SpaceSearchResult, LocationResult)
