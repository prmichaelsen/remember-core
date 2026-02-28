# Task 28: Memory Use Cases

**Milestone**: M7 — Web Client SDK
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 27 (WebSDKContext)

---

## Objective

Implement the memory CRUD and search use-case functions that wrap `MemoryService` operations with `Result<T, E>` error handling.

## Context

These are mostly thin wrappers around MemoryService that add consistent error handling via `tryCatch`. The key value-add is standardized `Result` responses and input types aligned with the OpenAPI `CreateMemoryInput`, `SearchMemoryInput`, etc. schemas.

The search functions do NOT include `ghost_context` in their inputs — the web tier resolves ghost context internally via `searchAsGhost` in the ghost module (Task 31).

## Steps

1. Create `src/web/memories.ts` with 6 functions:
   - `createMemory(ctx, input)` → `Result<{ memory_id, created_at }>`
   - `searchMemories(ctx, input)` → `Result<PaginatedResult<MemorySearchResult>>`
   - `findSimilarMemories(ctx, input)` → `Result<{ similar_memories, total }>`
   - `queryMemories(ctx, input)` → `Result<{ memories, total }>`
   - `updateMemory(ctx, input)` → `Result<{ memory_id, updated_at, version, updated_fields }>`
   - `deleteMemory(ctx, input)` → `Result<{ memory_id, deleted_at, orphaned_relationship_ids }>`

2. Each function:
   - Accepts `WebSDKContext` + typed input matching OpenAPI schemas
   - Wraps service call in `tryCatch` or manual try/catch → `err()`
   - Returns `ok(data)` on success
   - Adds `hasMore` to paginated results

3. Create `src/web/types.ts` with shared types:
   - `PaginatedResult<T>` (items, total, limit, offset, hasMore)
   - `MemorySearchResult`, `SimilarMemory`, `RelevantMemory`

## Verification

- [ ] All 6 functions implemented and typed
- [ ] Input types match OpenAPI schemas (snake_case)
- [ ] All return `Result<T, WebSDKError>`
- [ ] `hasMore` computed correctly on paginated results
- [ ] Service errors caught and wrapped as `WebSDKError`
- [ ] Build passes

## Files

- Create: `src/web/memories.ts`, `src/web/types.ts`
