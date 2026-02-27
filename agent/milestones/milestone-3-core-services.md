# Milestone 3: Core Services

**Goal**: Extract business logic from remember-mcp's 22 tool handlers into reusable service classes that both MCP and REST adapters can call
**Duration**: 2 weeks
**Dependencies**: M1 - Types & Models, M2 - Database & Configuration
**Status**: Not Started

---

## Overview

This is the most substantial milestone. The remember-mcp tool handlers each contain inline business logic that should live in core services. This milestone extracts that logic into proper service classes following the core-sdk patterns already scaffolded (base.service.ts, service interfaces).

Two existing services port directly (PreferencesService, ConfirmationTokenService). The remaining logic is currently scattered across 22 tool files and needs to be consolidated into MemoryService, RelationshipService, and SpaceService.

---

## Deliverables

### 1. Collection Utilities (port existing)
- Composite ID generation/parsing (format: userId.memoryId)
- Tracking array management (space_ids, group_ids — immutable operations)
- Dot notation utilities

### 2. Existing Services (port with refactor)
- PreferencesService: getPreferences, updatePreferences, createPreferences (Firestore-backed)
- ConfirmationTokenService: createRequest, validateToken, confirmRequest, denyRequest, retractRequest (5-min expiry)

### 3. MemoryService (extract from 6 tool handlers)
- create() — validate input, build object, insert to Weaviate
- search() — hybrid vector/keyword search with alpha parameter
- findSimilar() — vector similarity from existing memory
- query() — filtered retrieval with pagination
- update() — partial updates, version increment
- delete() — soft delete (deleted_at, deleted_by, deletion_reason)

### 4. RelationshipService (extract from 4 tool handlers)
- create(), update(), search(), delete()
- doc_type discriminator in same collection as memories

### 5. SpaceService (extract from 7 tool handlers)
- publish() — composite ID, copy to space collection, tracking arrays
- retract() — remove from space, update tracking
- revise() — sync changes to published copies
- confirm/deny — integrate with ConfirmationTokenService
- search/query — search across published memories

### 6. Service Tests
- Unit tests for all services with mocked Weaviate and Firestore
- Integration test scaffold for e2e validation

---

## Success Criteria

- [ ] All 22 MCP tool handlers can be rewritten as thin adapters calling core services
- [ ] REST routes can call the same core services
- [ ] Services follow core-sdk patterns (base.service.ts, service interfaces)
- [ ] Unit tests pass with >80% coverage on services
- [ ] No MCP or REST dependencies in service code

---

## Key Files to Create

```
src/
├── collections/
│   ├── index.ts                    (barrel exports)
│   ├── composite-ids.ts            (ID generation/parsing)
│   ├── tracking-arrays.ts          (space_ids/group_ids management)
│   └── dot-notation.ts             (dot notation utils)
└── services/
    ├── index.ts                    (barrel exports)
    ├── memory.service.ts           (6 operations)
    ├── relationship.service.ts     (4 operations)
    ├── space.service.ts            (7 operations)
    ├── preferences.service.ts      (3 operations)
    └── confirmation-token.service.ts (5 operations)
```

---

## Tasks

1. [Task 8: Port Collection Utilities and Existing Services](../tasks/milestone-3-core-services/task-8-collection-utils-existing-services.md) - composite-ids, tracking-arrays, PreferencesService, ConfirmationTokenService
2. [Task 9: Create MemoryService](../tasks/milestone-3-core-services/task-9-memory-service.md) - Extract from 6 memory tool handlers
3. [Task 10: Create RelationshipService and SpaceService](../tasks/milestone-3-core-services/task-10-relationship-space-services.md) - Extract from 11 tool handlers
4. [Task 11: Service Tests and Validation](../tasks/milestone-3-core-services/task-11-service-tests.md) - Unit tests, integration scaffold

---

## Testing Requirements

- [ ] Collection utility unit tests (composite ID round-trip, tracking array immutability)
- [ ] PreferencesService tests (get defaults, update merge, create)
- [ ] ConfirmationTokenService tests (lifecycle, expiry, invalid tokens)
- [ ] MemoryService tests (CRUD, search, soft delete)
- [ ] RelationshipService tests (CRUD, doc_type discrimination)
- [ ] SpaceService tests (publish flow, retract, revise, confirm/deny)

---

## Documentation Requirements

- [ ] Service interface documentation (JSDoc on all public methods)
- [ ] Usage examples showing MCP and REST calling same service

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Tool handler logic is tightly coupled to MCP response format | High | Medium | Separate data transformation from business logic |
| Weaviate query patterns differ across tools | Medium | Medium | Create shared query builder in MemoryService |
| Service interfaces change during extraction | Medium | High | Design interfaces first, implement second |

---

**Next Milestone**: [Milestone 4: Integration & Packaging](milestone-4-integration-and-packaging.md)
**Blockers**: None
**Notes**: This is the highest-effort milestone. The 22 remember-mcp tools map to 5 core services.
