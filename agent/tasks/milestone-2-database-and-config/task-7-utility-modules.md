# Task 7: Port Utility Modules

**Milestone**: [M2 - Database & Configuration](../../milestones/milestone-2-database-and-config.md)
**Estimated Time**: 2-3 hours
**Dependencies**: Task 6 (logger uses debug level config)
**Status**: Not Started

---

## Objective
Port logger, error handler, Weaviate filter builder, auth helpers, and debug utilities from `remember-mcp` into `remember-core`.

---

## Context
Source files:
- `remember-mcp/src/utils/logger.ts` — Structured logging with context
- `remember-mcp/src/utils/error-handler.ts` — Error handling utilities
- `remember-mcp/src/utils/weaviate-filters.ts` — Dynamic Weaviate where-filter building (content type, tags, weight, trust, date, location, soft-delete)
- `remember-mcp/src/utils/auth-helpers.ts` — Auth permission helpers (`canModerate`, `canModerateAny`)
- `remember-mcp/src/utils/debug.ts` — Debug level config
- `remember-mcp/src/utils/test-data-generator.ts` — Test helper

---

## Steps

### 1. Read All Utils Source Files
Read all utils source files from remember-mcp via `gh api`

### 2. Create Structured Logger
Create `src/utils/logger.ts` with structured logging

### 3. Create Error Handler
Create `src/utils/error-handler.ts` with error handling utilities

### 4. Create Weaviate Filter Builder
Create `src/utils/filters.ts` with Weaviate filter builder

### 5. Create Auth Helpers
Create `src/utils/auth-helpers.ts` with group moderation permission checks:
- `canModerate(groupMemberships, groupId)` — checks if user has moderation permission for a specific group
- `canModerateAny(groupMemberships)` — checks if user has moderation permission for any group

### 6. Create Barrel Exports
Create `src/utils/index.ts` barrel exports

### 7. Move Test Data Generator
Move test-data-generator to `src/testing/` (already scaffolded)

### 8. Verify Compilation
Verify compilation

---

## Verification
- [ ] Logger respects debug levels
- [ ] Error handler provides consistent error formatting
- [ ] Filter builder supports all filter types (content type, tags, weight, trust, date, location, soft-delete)
- [ ] Auth helpers correctly check moderation permissions per-group and across all groups
- [ ] Test data generator available in testing module

---

## Expected Output

**Key Files Created**:
- `src/utils/logger.ts`: Structured logging with context
- `src/utils/error-handler.ts`: Error handling utilities
- `src/utils/filters.ts`: Dynamic Weaviate where-filter builder
- `src/utils/auth-helpers.ts`: Group moderation permission checks (`canModerate`, `canModerateAny`)
- `src/utils/index.ts`: Barrel exports
- `src/testing/test-data-generator.ts`: Test helper (moved from utils)

---

## Notes
- Logger depends on debug level config from Task 6
- Weaviate filter builder supports dynamic where-filter building for: content type, tags, weight, trust, date, location, soft-delete
- Test data generator is separated into the testing module rather than utils

---

**Next Task**: [Task 8: Port Collection Utilities and Existing Services](../milestone-3-core-services/task-8-collection-utils-existing-services.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
