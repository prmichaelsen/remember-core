# Task 1: Port Core Memory Types

**Milestone**: [M1 - Types & Models](../../milestones/milestone-1-types-and-models.md)
**Estimated Time**: 2-3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective
Port the core Memory, Relationship, and MemoryContext interfaces plus search-related types from `remember-mcp/src/types/memory.ts` into `remember-core/src/types/`.

---

## Context
The `remember-mcp` repo defines all data types inline. These types are transport-agnostic and needed by both MCP and REST consumers. Source files:
- `remember-mcp/src/types/memory.ts` — Memory, Relationship, MemoryContext, SearchFilters, SearchOptions, SearchResult interfaces

---

## Steps

### 1. Read Source Types
Read `remember-mcp/src/types/memory.ts` via `gh api` to get the exact type definitions

### 2. Create Memory and Relationship Types
Create `src/types/memory.types.ts` with Memory and Relationship interfaces

### 3. Create Search Types
Create `src/types/search.types.ts` with SearchFilters, SearchOptions, SearchResult

### 4. Create Context Types
Create `src/types/context.types.ts` with MemoryContext and related metadata types

### 5. Update Barrel Exports
Update `src/types/index.ts` barrel exports

### 6. Verify Compilation
Verify types compile with `npx tsc --noEmit`

---

## Verification
- [ ] Memory interface includes all 60+ fields (content, tracking, metadata, significance, location, access, soft-delete)
- [ ] Relationship interface includes n-way connections
- [ ] MemoryContext includes conversation, participants, source, environment
- [ ] SearchFilters, SearchOptions, SearchResult properly typed
- [ ] All types exported from src/types/index.ts
- [ ] `npx tsc --noEmit` passes

---

## Expected Output

**Key Files Created**:
- `src/types/memory.types.ts`: Memory and Relationship interfaces
- `src/types/search.types.ts`: SearchFilters, SearchOptions, SearchResult types
- `src/types/context.types.ts`: MemoryContext and related metadata types
- `src/types/index.ts`: Updated barrel exports

---

## Notes
- Source file is `remember-mcp/src/types/memory.ts`
- These types are transport-agnostic and shared across MCP and REST consumers

---

**Next Task**: [Task 2: Port Preferences and Space Types](task-2-preferences-space-types.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
