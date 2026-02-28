# Task 31: Ghost/Trust Use Cases + searchAsGhost

**Milestone**: M7 — Web Client SDK
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 27 (WebSDKContext)

---

## Objective

Implement ghost config, trust management, access checking, and the `searchAsGhost` compound operation that resolves trust context automatically.

## Context

The svc-tier REST API requires callers to resolve `ghost_context` themselves and pass `{ accessor_trust_level, owner_user_id }` in search inputs. The web SDK resolves this internally from the GhostConfigProvider, providing a single `searchAsGhost(ctx, { owner_user_id, query })` that handles everything.

## Steps

1. Create `src/web/ghost.ts` with 8 functions:

   **Ghost config management**:
   - `getGhostConfig(ctx)` → `Result<{ success, config, message }>`
   - `updateGhostConfig(ctx, input)` → `Result<{ success, config, message }>`

   **Trust management**:
   - `setUserTrust(ctx, input)` → `Result<{ success, message }>`
   - `removeUserTrust(ctx, input)` → `Result<{ success, message }>`
   - `blockUser(ctx, input)` → `Result<{ success, message }>`
   - `unblockUser(ctx, input)` → `Result<{ success, message }>`

   **Access checking**:
   - `checkAccess(ctx, input)` → `Result<{ accessible, trust_tier, reason? }>`

   **Compound operation (web-tier only)**:
   - `searchAsGhost(ctx, input)` → `Result<PaginatedResult<RedactedMemory>>`
     - Resolves accessor trust level from GhostConfigProvider
     - Builds `ghost_context: { accessor_trust_level, owner_user_id }`
     - Calls `ctx.memoryService.search()` with ghost_context
     - Applies `formatMemoryForPrompt()` for content redaction
     - Returns trust-filtered, redacted results

2. Add `RedactedMemory` to `src/web/types.ts`

3. Ghost config/trust functions delegate to `ghost-config-handler.service.ts`

4. `searchAsGhost` is the key differentiation — combines:
   - `resolveAccessorTrustLevel()` from access-control.service
   - `buildTrustFilter()` from trust-enforcement.service
   - `formatMemoryForPrompt()` for redaction
   - `checkMemoryAccess()` for access validation

## Verification

- [ ] All 8 functions implemented and typed
- [ ] `searchAsGhost` resolves trust level without caller providing it
- [ ] `searchAsGhost` returns redacted content based on trust tier
- [ ] Ghost config operations validate inputs (self-trust rejection, etc.)
- [ ] Trust tier enum matches OpenAPI: full_access, partial_access, summary_only, metadata_only, existence_only
- [ ] Build passes

## Files

- Create: `src/web/ghost.ts`
- Modify: `src/web/types.ts` (add RedactedMemory)
