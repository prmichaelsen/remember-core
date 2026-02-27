# Task 8: Port Collection Utilities and Existing Services

**Milestone**: [M3 - Core Services](../../milestones/milestone-3-core-services.md)
**Estimated Time**: 4-5 hours
**Dependencies**: Task 1 (types), Task 5 (Firestore init)
**Status**: Not Started

---

## Objective
Port the collection management utilities (composite-ids, tracking-arrays) and the two existing service classes (PreferencesDatabaseService, ConfirmationTokenService) from `remember-mcp` into `remember-core`.

---

## Context
These are already well-structured in remember-mcp and need minimal refactoring:
- `remember-mcp/src/collections/composite-ids.ts` — generateCompositeId, parseCompositeId, isCompositeId (format: userId.memoryId)
- `remember-mcp/src/collections/tracking-arrays.ts` — addToSpaceIds, removeFromSpaceIds, getPublishedLocations (immutable operations)
- `remember-mcp/src/collections/dot-notation.ts` — Dot notation utilities
- `remember-mcp/src/services/preferences-database.service.ts` — Static class: getPreferences, updatePreferences, createPreferences (Firestore-backed)
- `remember-mcp/src/services/confirmation-token.service.ts` — Two-phase operation: createRequest, validateToken, confirmRequest, denyRequest, retractRequest (Firestore-backed, 5-min expiry)

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

### 10. Update Services Barrel Exports
Update `src/services/index.ts` barrel exports

### 11. Write Unit Tests
Write unit tests for collection utilities

---

## Verification
- [ ] Composite ID generation/parsing round-trips correctly
- [ ] Tracking arrays maintain immutability
- [ ] PreferencesService reads/writes Firestore correctly
- [ ] ConfirmationTokenService lifecycle works (create → validate → confirm/deny)
- [ ] 5-minute token expiry enforced
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

---

## Notes
- These are already well-structured in remember-mcp and need minimal refactoring
- Both services should extend the base.service.ts pattern
- ConfirmationTokenService uses a 5-minute expiry window

---

**Next Task**: [Task 9: Create MemoryService](task-9-memory-service.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
