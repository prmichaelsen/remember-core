# Task 18: Port Access Control, Ghost Config, and Escalation Services

**Milestone**: [M5 - Trust & Ghost System](../../milestones/milestone-5-trust-and-ghost-system.md)
**Estimated Time**: 4 hours
**Dependencies**: Task 17 (trust services)
**Status**: Not Started

---

## Objective

Port the AccessControlService, GhostConfigService, EscalationService, and GhostConfigHandler from remember-mcp. These handle memory access checks, ghost persona configuration CRUD, trust escalation prevention, and ghost config orchestration.

---

## Steps

### 1. Create `src/services/access-control.service.ts`

Port from `remember-mcp/src/services/access-control.ts`:
- `checkMemoryAccess(memory_id, accessor_user_id)` → returns `AccessResult` discriminated union
- Resolution order: not_found → deleted → owner (granted) → no_permission → blocked → insufficient_trust → granted
- Owner self-access always returns `{ status: 'granted', access_level: 'owner' }`
- Trust penalty (-0.1) applied on insufficient trust
- Block after 3 failed attempts on same memory
- `formatAccessResult(result)` — user-friendly message for each status variant
- Accept dependencies via constructor: collection, escalationService, logger

### 2. Create `src/services/ghost-config.service.ts`

Port from `remember-mcp/src/services/ghost-config.service.ts`:
- Firestore-backed CRUD for GhostConfig at `users/{userId}/ghost_config`
- `getConfig(userId)` → returns GhostConfig (with DEFAULT_GHOST_CONFIG fallback)
- `updateConfig(userId, updates)` → partial update
- `setUserTrust(ownerId, accessorId, level)` → update per_user_trust map
- `blockUser(ownerId, targetId)` → add to blocked_users array
- `unblockUser(ownerId, targetId)` → remove from blocked_users array
- `resolveTrustLevel(ownerId, accessorId)` → blocked → per-user → friend default → public default → null
- `isBlocked(ownerId, accessorId)` → boolean check
- Accept Firestore client and Logger via constructor (DI pattern)

### 3. Create `src/services/escalation.service.ts`

Port from `remember-mcp/src/services/escalation.service.ts`:
- Track failed access attempts per (accessor, memory) pair
- `recordFailedAttempt(ownerId, accessorId, memoryId)` → increment count, apply -0.1 trust penalty
- `isBlocked(accessorId, memoryId)` → true if attempts >= 3
- `resetBlock(ownerId, accessorId, memoryId, reason)` → clear block, reset counter
- `getAttemptCount(accessorId, memoryId)` → current count
- `AccessAttemptLog` interface for audit records
- `MemoryBlock` interface for block records
- Accept Firestore client and Logger via constructor

### 4. Create `src/services/ghost-config-handler.service.ts`

Port orchestration logic from `remember-mcp/src/tools/ghost-config.ts` (business logic only, no MCP transport):
- `handleGetConfig(userId)` → get + validate
- `handleUpdateConfig(userId, updates)` → validate + update
- `handleSetTrust(ownerId, accessorId, level)` → validate range + set
- `handleBlockUser(ownerId, targetId)` → validate + block
- Accept GhostConfigService and Logger via constructor

### 5. Create permission resolution utilities

Add to `src/services/access-control.service.ts` or a separate `permission-resolver.ts`:
- `canRevise(userId, memory, credentialsFetcher?)` → boolean
- `canOverwrite(userId, memory, credentialsFetcher?)` → boolean
- Handles all 3 write modes: owner_only, group_editors, anyone
- Null fallbacks for owner_id → author_id, write_mode → 'owner_only'

### 6. Update `src/services/index.ts`

Add barrel exports for all 4 new services and permission utilities.

---

## Verification

- [ ] `npm run build` succeeds
- [ ] All existing tests pass
- [ ] AccessControlService returns correct AccessResult for each resolution path
- [ ] GhostConfigService CRUD operations work with Firestore mock
- [ ] EscalationService applies -0.1 penalty and blocks after 3 attempts
- [ ] GhostConfigHandler validates inputs before delegating
- [ ] canRevise/canOverwrite handle all write modes correctly

---

**Source Files**: `remember-mcp/src/services/access-control.ts`, `remember-mcp/src/services/ghost-config.service.ts`, `remember-mcp/src/services/escalation.service.ts`, `remember-mcp/src/tools/ghost-config.ts`
**Related Design Docs**: [access-control-result.md](../../design/access-control-result.md), [ghost-persona-system.md](../../design/ghost-persona-system.md), [memory-acl-schema.md](../../design/memory-acl-schema.md)
**Next Task**: [Task 19](task-19-schema-content-types-auth-updates.md)
