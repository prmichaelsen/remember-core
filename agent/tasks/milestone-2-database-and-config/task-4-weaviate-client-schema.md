# Task 4: Port Weaviate Client and Schema

**Milestone**: [M2 - Database & Configuration](../../milestones/milestone-2-database-and-config.md)
**Estimated Time**: 3-4 hours
**Dependencies**: Task 1 (schema references Memory types)
**Status**: Not Started

---

## Objective
Port Weaviate client initialization, connection management, and v2 collection schema definitions from `remember-mcp` into `remember-core`.

---

## Context
Source files:
- `remember-mcp/src/weaviate/client.ts` — Weaviate client init (local + cloud), OpenAI API key for embeddings
- `remember-mcp/src/weaviate/schema.ts` — Collection schema management
- `remember-mcp/src/weaviate/space-schema.ts` — Space-specific schema
- `remember-mcp/src/schema/v2-collections.ts` — 60+ property definitions, 3 collection types (user, space, group)

---

## Steps

### 1. Read All Weaviate Source Files
Read all Weaviate source files from remember-mcp via `gh api`

### 2. Create Weaviate Client Module
Create `src/database/weaviate/client.ts` with connection initialization

### 3. Create Schema Management Module
Create `src/database/weaviate/schema.ts` with collection schema management

### 4. Create V2 Collections Definitions
Create `src/database/weaviate/v2-collections.ts` with full property definitions

### 5. Create Barrel Exports
Create `src/database/weaviate/index.ts` barrel exports

### 6. Add Weaviate Dependency
Add `weaviate-client` to package.json dependencies

### 7. Verify Compilation
Verify compilation

---

## Verification
- [ ] Weaviate client connects to both local and cloud instances
- [ ] 3 collection types defined (user, space, group)
- [ ] 60+ properties defined per collection
- [ ] Schema management functions work (create, check, update)
- [ ] Exports clean from src/database/weaviate/index.ts

---

## Expected Output

**Key Files Created**:
- `src/database/weaviate/client.ts`: Weaviate client initialization and connection management
- `src/database/weaviate/schema.ts`: Collection schema management
- `src/database/weaviate/v2-collections.ts`: Full property definitions for 3 collection types
- `src/database/weaviate/index.ts`: Barrel exports

---

## Notes
- Source includes both local and cloud connection modes
- OpenAI API key needed for embeddings integration
- 60+ property definitions across 3 collection types (user, space, group)

---

**Next Task**: [Task 5: Port Firestore Initialization and Paths](task-5-firestore-initialization.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
