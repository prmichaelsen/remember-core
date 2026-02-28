# Task 29: Relationship Use Cases

**Milestone**: M7 — Web Client SDK
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: Task 27 (WebSDKContext)

---

## Objective

Implement the relationship CRUD and search use-case functions wrapping `RelationshipService`.

## Context

These are thin wrappers around RelationshipService with `Result<T, E>` error handling. Input/output types align with OpenAPI `CreateRelationshipInput`, `SearchRelationshipInput`, etc.

## Steps

1. Create `src/web/relationships.ts` with 4 functions:
   - `createRelationship(ctx, input)` → `Result<{ relationship_id, memory_ids, created_at }>`
   - `searchRelationships(ctx, input)` → `Result<PaginatedResult<RelationshipSearchResult>>`
   - `updateRelationship(ctx, input)` → `Result<{ relationship_id, updated_at, version, updated_fields }>`
   - `deleteRelationship(ctx, input)` → `Result<{ relationship_id, memories_updated }>`

2. Add `RelationshipSearchResult` to `src/web/types.ts`

3. Each function wraps service call with `tryCatch` → `Result`

## Verification

- [ ] All 4 functions implemented and typed
- [ ] Input types match OpenAPI schemas
- [ ] `PaginatedResult` with `hasMore` for search
- [ ] Build passes

## Files

- Create: `src/web/relationships.ts`
- Modify: `src/web/types.ts` (add RelationshipSearchResult)
