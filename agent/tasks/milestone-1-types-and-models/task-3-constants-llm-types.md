# Task 3: Port Constants and LLM Types

**Milestone**: [M1 - Types & Models](../../milestones/milestone-1-types-and-models.md)
**Estimated Time**: 1-2 hours
**Dependencies**: Task 1 (content types referenced by Memory interface)
**Status**: Not Started

---

## Objective
Port the 45+ content type constants, LLM-related types, and any shared enums/unions from `remember-mcp` into `remember-core`.

---

## Context
Source files:
- `remember-mcp/src/constants/content-types.ts` — 45+ content type definitions used for memory classification
- `remember-mcp/src/llm/types.ts` — LLM-related type definitions

---

## Steps

### 1. Read Content Types Source
Read `remember-mcp/src/constants/content-types.ts` via `gh api`

### 2. Read LLM Types Source
Read `remember-mcp/src/llm/types.ts` via `gh api`

### 3. Create Content Type Constants
Create `src/constants/content-types.ts` with all content type definitions

### 4. Create LLM Types
Create `src/types/llm.types.ts` with LLM-related types

### 5. Create Constants Barrel Export
Create `src/constants/index.ts` barrel export

### 6. Update Types Barrel Export
Update `src/types/index.ts` to include LLM types

### 7. Verify Compilation
Verify all types compile

---

## Verification
- [ ] All 45+ content types ported
- [ ] Content types usable as discriminators for Memory.type field
- [ ] LLM types properly defined
- [ ] Constants exported from src/constants/index.ts
- [ ] `npx tsc --noEmit` passes

---

## Expected Output

**Key Files Created**:
- `src/constants/content-types.ts`: All 45+ content type definitions
- `src/types/llm.types.ts`: LLM-related type definitions
- `src/constants/index.ts`: Constants barrel export
- `src/types/index.ts`: Updated barrel exports

---

## Notes
- Depends on Task 1 because content types are referenced by the Memory interface
- Content types serve as discriminators for the Memory.type field

---

**Next Task**: [Task 4: Port Weaviate Client and Schema](../milestone-2-database-and-config/task-4-weaviate-client-schema.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
