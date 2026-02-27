# Milestone 1: Types & Models

**Goal**: Port all transport-agnostic type definitions, interfaces, and constants from `remember-mcp` (v3.8.0) into `remember-core`
**Duration**: 1 week
**Dependencies**: None (first milestone)
**Status**: Not Started

---

## Overview

This milestone establishes the foundational type system that both MCP and REST adapters will depend on. It ports types from `remember-mcp/src/types/`, `remember-mcp/src/constants/`, and `remember-mcp/src/llm/` into the core-sdk TypeScript structure already scaffolded in `src/types/`.

These types are 100% transport-agnostic — they define the data model for memories, relationships, preferences, and search without any dependency on MCP or REST.

---

## Deliverables

### 1. Core Memory Types
- Memory interface (60+ fields: content, tracking, metadata, significance, location, access, soft-delete)
- Relationship interface (n-way connections with doc_type discriminator)
- MemoryContext interface (conversation, participants, source, environment metadata)

### 2. Search Types
- SearchFilters (content type, tags, weight, trust, date, location, soft-delete)
- SearchOptions (limit, offset, alpha for hybrid search)
- SearchResult (ranked results with scores)

### 3. Preference Types
- UserPreferences with 6 category interfaces (Templates, Search, Location, Privacy, Notifications, Display)
- Default preference values

### 4. Space & Published Memory Types
- SpaceMemory interface (published_at, revised_at, author_id, ghost_id, attribution)
- Published memory tracking fields

### 5. Auth Types
- GroupPermissions, GroupMembership, UserCredentials, AuthContext interfaces
- WriteMode type literal, CredentialsProvider interface

### 6. Constants & LLM Types
- 41 content type definitions for memory classification
- LLM types placeholder (upstream file is currently empty)

---

## Success Criteria

- [ ] All types from remember-mcp/src/types/ ported to remember-core
- [ ] Types compile cleanly with `npx tsc --noEmit` (strict mode)
- [ ] No MCP or transport-specific types in core
- [ ] All types exported from src/types/index.ts
- [ ] Content type constants exported from src/constants/index.ts

---

## Key Files to Create

```
src/
├── types/
│   ├── index.ts              (barrel exports)
│   ├── memory.types.ts       (Memory, Relationship)
│   ├── context.types.ts      (MemoryContext)
│   ├── search.types.ts       (SearchFilters, SearchOptions, SearchResult)
│   ├── preferences.types.ts  (UserPreferences, 6 categories, defaults)
│   ├── space.types.ts        (SpaceMemory, published memory)
│   ├── llm.types.ts          (LLM types placeholder)
│   └── auth.types.ts         (auth/permissions types)
└── constants/
    ├── index.ts              (barrel exports)
    └── content-types.ts      (41 content type definitions)
```

---

## Tasks

1. [Task 1: Port Core Memory Types](../tasks/milestone-1-types-and-models/task-1-core-memory-types.md) - Memory, Relationship, MemoryContext, search types
2. [Task 2: Port Preferences and Space Types](../tasks/milestone-1-types-and-models/task-2-preferences-space-types.md) - 6 preference categories, SpaceMemory
3. [Task 3: Port Constants and LLM Types](../tasks/milestone-1-types-and-models/task-3-constants-llm-types.md) - 41 content types, LLM types placeholder

---

## Testing Requirements

- [ ] All types compile with strict TypeScript (no `any` types)
- [ ] Barrel exports resolve correctly

---

## Documentation Requirements

- [ ] JSDoc comments on all exported interfaces
- [ ] Type usage examples in comments

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| remember-mcp types have hidden MCP dependencies | Medium | Low | Review each type for transport coupling before porting |
| Type breaking changes affect remember-mcp consumers | High | Medium | Maintain backward-compatible type signatures |

---

**Next Milestone**: [Milestone 2: Database & Configuration](milestone-2-database-and-config.md)
**Blockers**: None
**Notes**: Source types are in remember-mcp v3.8.0 on GitHub at prmichaelsen/remember-mcp
