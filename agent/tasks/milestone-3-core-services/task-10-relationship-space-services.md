# Task 10: Create RelationshipService and SpaceService

**Milestone**: [M3 - Core Services](../../milestones/milestone-3-core-services.md)
**Estimated Time**: 6-8 hours
**Dependencies**: Task 8 (collection utils, confirmation tokens), Task 9 (MemoryService patterns)
**Status**: Not Started

---

## Objective
Extract relationship CRUD and space operation business logic from MCP tool handlers into RelationshipService and SpaceService classes.

---

## Context
Relationship tools (4):
- `tools/create-relationship.ts` → RelationshipService.create()
- `tools/update-relationship.ts` → RelationshipService.update()
- `tools/search-relationship.ts` → RelationshipService.search()
- `tools/delete-relationship.ts` → RelationshipService.delete()

Space tools (7):
- `tools/publish.ts` → SpaceService.publish() (phase 1: generate confirmation token)
- `tools/retract.ts` → SpaceService.retract()
- `tools/revise.ts` → SpaceService.revise() (sync content changes)
- `tools/confirm.ts` → SpaceService.confirm() (phase 2: execute pending action)
- `tools/deny.ts` → SpaceService.deny()
- `tools/search-space.ts` → SpaceService.search()
- `tools/query-space.ts` → SpaceService.query()

---

## Steps

### 1. Read Source Files
Read all 11 tool files from remember-mcp via `gh api`

### 2. Create RelationshipService
Create `src/services/relationship.service.ts` with 4 operations

### 3. Create SpaceService
Create `src/services/space.service.ts` with 7 operations

### 4. Implement RelationshipService Operations
Implement CRUD + search on doc_type discriminated records

### 5. Implement SpaceService Publish Flow
Implement composite ID generation, copy to space collection, tracking array updates

### 6. Implement SpaceService Retract
Remove from space, update tracking arrays

### 7. Implement SpaceService Revise
Sync changes from private to published copy

### 8. Wire SpaceService Confirm/Deny
Wire SpaceService confirm/deny to ConfirmationTokenService

### 9. Update Services Barrel Exports
Update `src/services/index.ts` barrel exports

### 10. Write Unit Tests
Write unit tests for RelationshipService and SpaceService

---

## Verification
- [ ] Relationships stored with doc_type discriminator in same collection as memories
- [ ] Publish creates composite ID and copies to space collection
- [ ] Retract removes from space and updates tracking arrays
- [ ] Revise syncs content changes to all published copies
- [ ] Confirm/deny integrates with ConfirmationTokenService
- [ ] Space search works across published memories
- [ ] Unit tests pass

---

## Expected Output

**Key Files Created**:
- `src/services/relationship.service.ts`: RelationshipService with 4 CRUD+search operations
- `src/services/space.service.ts`: SpaceService with 7 publish/retract/revise/confirm/deny/search/query operations

---

## Notes
- Relationships are stored with doc_type discriminator in the same collection as memories
- SpaceService publish flow uses composite ID generation and copies to space collection
- SpaceService confirm/deny integrates with ConfirmationTokenService from Task 8
- Revise syncs content changes from private to all published copies

---

**Next Task**: [Task 11: Service Tests and Validation](task-11-service-tests.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
