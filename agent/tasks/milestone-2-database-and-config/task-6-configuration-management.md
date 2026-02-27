# Task 6: Port Configuration Management

**Milestone**: [M2 - Database & Configuration](../../milestones/milestone-2-database-and-config.md)
**Estimated Time**: 2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective
Port environment configuration loading, validation, and debug level management from `remember-mcp` into `remember-core`.

---

## Context
Source files:
- `remember-mcp/src/config.ts` — Environment variable loading (WEAVIATE_REST_URL, WEAVIATE_API_KEY, OPENAI_EMBEDDINGS_API_KEY, FIREBASE_*, REMEMBER_MCP_DEBUG_LEVEL), validation, debug level enum (NONE, ERROR, WARN, INFO, DEBUG, TRACE)

---

## Steps

### 1. Read Configuration Source File
Read `remember-mcp/src/config.ts` via `gh api`

### 2. Create Environment Configuration Module
Create `src/config/environment.ts` with env var loading and validation

### 3. Create Debug Level Module
Create `src/config/debug.ts` with debug level enum and management

### 4. Update Barrel Exports
Update `src/config/index.ts` barrel exports (already exists from scaffolding)

### 5. Apply Core SDK Patterns
Use config patterns from installed core-sdk patterns

### 6. Verify Compilation
Verify compilation

---

## Verification
- [ ] All required env vars validated on startup
- [ ] Debug levels work (NONE through TRACE)
- [ ] Config exported as typed object
- [ ] Missing env vars produce clear error messages

---

## Expected Output

**Key Files Created**:
- `src/config/environment.ts`: Environment variable loading and validation
- `src/config/debug.ts`: Debug level enum and management
- `src/config/index.ts`: Updated barrel exports

---

## Notes
- Environment variables include: WEAVIATE_REST_URL, WEAVIATE_API_KEY, OPENAI_EMBEDDINGS_API_KEY, FIREBASE_*, REMEMBER_MCP_DEBUG_LEVEL
- Debug level enum: NONE, ERROR, WARN, INFO, DEBUG, TRACE
- Config index.ts already exists from scaffolding and needs updating

---

**Next Task**: [Task 7: Port Utility Modules](task-7-utility-modules.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
