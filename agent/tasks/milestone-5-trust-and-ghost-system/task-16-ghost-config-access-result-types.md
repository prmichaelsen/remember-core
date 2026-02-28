# Task 16: Port Ghost Config and Access Result Types

**Milestone**: [M5 - Trust & Ghost System](../../milestones/milestone-5-trust-and-ghost-system.md)
**Estimated Time**: 2 hours
**Dependencies**: M1 types complete
**Status**: Not Started

---

## Objective

Port the GhostConfig, TrustEnforcementMode, AccessResult types from remember-mcp into remember-core. Update AuthContext with GhostModeContext. Add ghost/comment to ContentType.

---

## Steps

### 1. Create `src/types/ghost-config.types.ts`

Port from `remember-mcp/src/types/ghost-config.ts`:
- `TrustEnforcementMode` — `'query' | 'prompt' | 'hybrid'`
- `GhostConfig` interface — 8 fields (enabled, public_ghost_enabled, default_friend_trust, default_public_trust, per_user_trust, blocked_users, enforcement_mode)
- `DEFAULT_GHOST_CONFIG` constant

### 2. Create `src/types/access-result.types.ts`

Port from `remember-mcp/src/types/access-result.ts`:
- 6 individual interfaces: AccessGranted, AccessInsufficientTrust, AccessBlocked, AccessNoPermission, AccessNotFound, AccessDeleted
- `AccessResult` union type
- `AccessResultStatus` string union
- Import `Memory` from memory.types.js

### 3. Update `src/types/auth.types.ts`

Add `GhostModeContext` interface (from v3.13.0):
- `owner_user_id: string`
- `accessor_user_id: string`
- `accessor_trust_level: number`
Add `ghostMode?: GhostModeContext` to AuthContext

### 4. Update `src/types/index.ts`

Add barrel exports for new types.

---

## Verification

- [ ] `npm run build` succeeds
- [ ] All existing 142 tests pass
- [ ] New types exported from `@prmichaelsen/remember-core/types`

---

**Source Files**: `remember-mcp/src/types/ghost-config.ts`, `remember-mcp/src/types/access-result.ts`, `remember-mcp/src/types/auth.ts`
**Next Task**: [Task 17](task-17-trust-enforcement-validator-services.md)
