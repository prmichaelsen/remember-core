# Task 8: Port Collection Utilities and Existing Services

**Milestone**: [M3 - Core Services](../../milestones/milestone-3-core-services.md)
**Estimated Time**: 4-5 hours
**Dependencies**: Task 1 (types), Task 5 (Firestore init)
**Status**: Not Started

---

## Objective
Port the collection management utilities (composite-ids, tracking-arrays) and the existing service classes (PreferencesDatabaseService, ConfirmationTokenService, CredentialsProvider, SpaceConfigService) from `remember-mcp` into `remember-core`.

---

## Context
These are already well-structured in remember-mcp and need minimal refactoring:
- `remember-mcp/src/collections/composite-ids.ts` — generateCompositeId, parseCompositeId, isCompositeId (format: userId.memoryId)
- `remember-mcp/src/collections/tracking-arrays.ts` — addToSpaceIds, removeFromSpaceIds, getPublishedLocations (immutable operations)
- `remember-mcp/src/collections/dot-notation.ts` — Dot notation utilities
- `remember-mcp/src/services/preferences-database.service.ts` — Static class: getPreferences, updatePreferences, createPreferences (Firestore-backed)
- `remember-mcp/src/services/confirmation-token.service.ts` — Two-phase operation: createRequest, validateToken, confirmRequest, denyRequest, retractRequest (Firestore-backed, 5-min expiry)
- `remember-mcp/src/services/credentials-provider.ts` — StubCredentialsProvider (class implementing CredentialsProvider interface), createCredentialsProvider() factory function, credentialsProvider singleton instance
- `remember-mcp/src/services/space-config.service.ts` — SpaceConfig interface (write_mode, moderation settings), DEFAULT_SPACE_CONFIG constant, getSpaceConfig/setSpaceConfig async functions (Firestore-backed)

---

## Steps

### 1. Read Source Files
Read all collection and service source files from remember-mcp via `gh api`

### 2. Create Composite IDs Module
Create `src/collections/composite-ids.ts`

### 3. Create Tracking Arrays Module
Create `src/collections/tracking-arrays.ts`

### 4. Create Dot Notation Module
Create `src/collections/dot-notation.ts`

### 5. Create Collections Barrel Exports
Create `src/collections/index.ts` barrel exports

### 6. Refactor PreferencesDatabaseService
Refactor PreferencesDatabaseService to extend base.service.ts pattern

### 7. Create PreferencesService
Create `src/services/preferences.service.ts`

### 8. Refactor ConfirmationTokenService
Refactor ConfirmationTokenService to extend base.service.ts pattern

### 9. Create ConfirmationTokenService
Create `src/services/confirmation-token.service.ts`

### 10. Create CredentialsProvider
Create `src/services/credentials-provider.ts`
- Port CredentialsProvider interface and StubCredentialsProvider class
- Port createCredentialsProvider() factory function
- Export credentialsProvider singleton instance

### 11. Create SpaceConfigService
Create `src/services/space-config.service.ts`
- Port SpaceConfig interface (write_mode, moderation settings)
- Port DEFAULT_SPACE_CONFIG constant
- Port getSpaceConfig(spaceOrGroupId) async function (reads from Firestore)
- Port setSpaceConfig(spaceOrGroupId, config) async function (writes to Firestore)

### 12. Update Services Barrel Exports
Update `src/services/index.ts` barrel exports

### 13. Write Unit Tests
Write unit tests for collection utilities and services

---

## Verification
- [ ] Composite ID generation/parsing round-trips correctly
- [ ] Tracking arrays maintain immutability
- [ ] PreferencesService reads/writes Firestore correctly
- [ ] ConfirmationTokenService lifecycle works (create → validate → confirm/deny)
- [ ] 5-minute token expiry enforced
- [ ] CredentialsProvider interface and StubCredentialsProvider work correctly
- [ ] credentialsProvider singleton is properly exported
- [ ] SpaceConfig reads/writes Firestore correctly via getSpaceConfig/setSpaceConfig
- [ ] DEFAULT_SPACE_CONFIG provides sensible defaults
- [ ] All exports available from barrel files
- [ ] Unit tests pass

---

## Expected Output

**Key Files Created**:
- `src/collections/composite-ids.ts`: Composite ID generation, parsing, and validation
- `src/collections/tracking-arrays.ts`: Immutable tracking array operations
- `src/collections/dot-notation.ts`: Dot notation utilities
- `src/collections/index.ts`: Barrel exports for collections
- `src/services/preferences.service.ts`: Firestore-backed preferences service
- `src/services/confirmation-token.service.ts`: Two-phase confirmation token service
- `src/services/credentials-provider.ts`: CredentialsProvider interface, StubCredentialsProvider class, factory function, and singleton
- `src/services/space-config.service.ts`: SpaceConfig interface, defaults, and Firestore-backed get/set functions

---

## Notes
- These are already well-structured in remember-mcp and need minimal refactoring
- PreferencesService and ConfirmationTokenService should extend the base.service.ts pattern
- ConfirmationTokenService uses a 5-minute expiry window
- CredentialsProvider uses a stub implementation with a factory function and singleton pattern
- SpaceConfigService manages per-space configuration (write_mode, moderation) backed by Firestore

---

**Next Task**: [Task 9: Create MemoryService](task-9-memory-service.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
