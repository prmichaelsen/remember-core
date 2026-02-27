# Task 2: Port Preferences and Space Types

**Milestone**: [M1 - Types & Models](../../milestones/milestone-1-types-and-models.md)
**Estimated Time**: 2 hours
**Dependencies**: Task 1 (Memory types referenced by Space types)
**Status**: Not Started

---

## Objective
Port user preferences type definitions (6 categories) and space/published memory types from `remember-mcp` into `remember-core`.

---

## Context
Source files:
- `remember-mcp/src/types/preferences.ts` — UserPreferences with 6 category interfaces (Templates, Search, Location, Privacy, Notifications, Display)
- `remember-mcp/src/types/space-memory.ts` — SpaceMemory, published memory interfaces with author/attribution fields

---

## Steps

### 1. Read Preferences Source
Read `remember-mcp/src/types/preferences.ts` via `gh api`

### 2. Read Space Memory Source
Read `remember-mcp/src/types/space-memory.ts` via `gh api`

### 3. Create Preferences Types
Create `src/types/preferences.types.ts` with all 6 preference categories and defaults

### 4. Create Space Types
Create `src/types/space.types.ts` with SpaceMemory and published memory types

### 5. Update Barrel Exports
Update `src/types/index.ts` barrel exports

### 6. Verify Compilation
Verify types compile

---

## Verification
- [ ] All 6 preference categories defined (Templates, Search, Location, Privacy, Notifications, Display)
- [ ] Default preference values exported
- [ ] SpaceMemory type includes published_at, revised_at, author_id, ghost_id, attribution
- [ ] All types exported from src/types/index.ts
- [ ] `npx tsc --noEmit` passes

---

## Expected Output

**Key Files Created**:
- `src/types/preferences.types.ts`: UserPreferences with 6 category interfaces and defaults
- `src/types/space.types.ts`: SpaceMemory and published memory types
- `src/types/index.ts`: Updated barrel exports

---

## Notes
- Depends on Task 1 because Space types reference Memory types
- 6 preference categories: Templates, Search, Location, Privacy, Notifications, Display

---

**Next Task**: [Task 3: Port Constants and LLM Types](task-3-constants-llm-types.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
