# Task 9: Create MemoryService

**Milestone**: [M3 - Core Services](../../milestones/milestone-3-core-services.md)
**Estimated Time**: 6-8 hours
**Dependencies**: Task 1 (Memory types), Task 4 (Weaviate client), Task 7 (filter utilities)
**Status**: Not Started

---

## Objective
Extract the memory CRUD and search business logic from the 6 memory MCP tool handlers into a unified MemoryService class in `remember-core`.

---

## Context
The remember-mcp tool handlers contain inline business logic that should be service methods:
- `src/tools/create-memory.ts` → MemoryService.create()
- `src/tools/search-memory.ts` → MemoryService.search() (hybrid vector/keyword search)
- `src/tools/find-similar.ts` → MemoryService.findSimilar()
- `src/tools/query-memory.ts` → MemoryService.query() (filtered retrieval)
- `src/tools/update-memory.ts` → MemoryService.update()
- `src/tools/delete-memory.ts` → MemoryService.delete() (soft delete)

Each tool currently handles: input validation, Weaviate operations, filter building, result formatting, error handling.

---

## Steps

### 1. Read Source Files
Read all 6 memory tool files from remember-mcp via `gh api`

### 2. Identify Common Patterns
Identify common patterns across tools (validation, Weaviate calls, error handling)

### 3. Design MemoryService Interface
Design MemoryService interface extending base.service.ts

### 4. Create MemoryService File
Create `src/services/memory.service.ts` with all 6 operations

### 5. Implement create()
Validate input, build object, insert to Weaviate collection

### 6. Implement search()
Hybrid search with alpha parameter, filter building, result ranking

### 7. Implement findSimilar()
Vector similarity search from existing memory

### 8. Implement query()
Filtered retrieval with pagination

### 9. Implement update()
Partial updates, version increment

### 10. Implement delete()
Soft delete (set deleted_at, deleted_by, deletion_reason)

### 11. Update Services Barrel Exports
Update `src/services/index.ts` barrel exports

### 12. Write Unit Tests
Write unit tests with mocked Weaviate client

---

## Verification
- [ ] All 6 CRUD+search operations implemented
- [ ] Soft delete preserves data with deleted_at timestamp
- [ ] Search supports hybrid (semantic + keyword) with alpha control
- [ ] Filters applied correctly (content type, tags, weight, trust, date, location)
- [ ] Collection isolation per user (Memory_users_{userId})
- [ ] Unit tests pass with mocked Weaviate
- [ ] No MCP-specific code in service

---

## Expected Output

**Key Files Created**:
- `src/services/memory.service.ts`: Unified MemoryService with all 6 CRUD+search operations

---

## Notes
- Each tool currently handles: input validation, Weaviate operations, filter building, result formatting, error handling
- Service must maintain collection isolation per user (Memory_users_{userId})
- No MCP-specific code should appear in the service layer
- Soft delete preserves data rather than removing it

---

**Next Task**: [Task 10: Create RelationshipService and SpaceService](task-10-relationship-space-services.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
