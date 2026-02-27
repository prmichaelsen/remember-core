# Task 3: Port Constants and LLM Types

**Milestone**: [M1 - Types & Models](../../milestones/milestone-1-types-and-models.md)
**Estimated Time**: 1-2 hours
**Dependencies**: Task 1 (content types referenced by Memory interface)
**Status**: Not Started

---

## Objective
Port the 41 content type constants, LLM-related types, and any shared enums/unions from `remember-mcp` into `remember-core`.

---

## Context
Source files:
- `remember-mcp/src/constants/content-types.ts` — 41 content type definitions used for memory classification
- `remember-mcp/src/llm/types.ts` — LLM types file (currently an empty placeholder with 0 bytes; no content to port yet)

---

## Steps

### 1. Read Content Types Source
Read `remember-mcp/src/constants/content-types.ts` via `gh api`

### 2. Read LLM Types Source
Read `remember-mcp/src/llm/types.ts` via `gh api`
> **Note**: This file is currently an empty placeholder (0 bytes). There is nothing to port yet.

### 3. Create Content Type Constants
Create `src/constants/content-types.ts` with all content type definitions

### 4. Create LLM Types Placeholder
Create `src/types/llm.types.ts` as an empty placeholder file. The upstream source (`remember-mcp/src/llm/types.ts`) has no content yet, so there is nothing to port. This file should be created to establish the expected file structure for future use.

### 5. Create Constants Barrel Export
Create `src/constants/index.ts` barrel export

### 6. Update Types Barrel Export
Update `src/types/index.ts` to include LLM types

### 7. Verify Compilation
Verify all types compile

---

## Verification
- [ ] All 41 content types ported
- [ ] Content types usable as discriminators for Memory.type field
- [ ] LLM types placeholder file created (upstream source is empty; nothing to port yet)
- [ ] Constants exported from src/constants/index.ts
- [ ] `npx tsc --noEmit` passes

---

## Expected Output

**Key Files Created**:
- `src/constants/content-types.ts`: All 41 content type definitions
- `src/types/llm.types.ts`: LLM types placeholder (upstream source is empty; to be populated when `remember-mcp/src/llm/types.ts` gains content)
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
