# Task 47: Fix Composite ID to Use Weaviate-Valid UUID v5

**Milestone**: [M8 - Bug Fixes](../milestones/milestone-8-bug-fixes.md)
**Estimated Time**: 2-4 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Replace the dot-delimited composite ID (`{userId}.{memoryId}`) with a deterministic UUID v5 as the Weaviate object ID. Weaviate strictly requires UUID v3/v4/v5 for object IDs and rejects arbitrary strings.

---

## Context

The current `generateCompositeId()` in `src/collections/composite-ids.ts` produces IDs like `user1.mem1` and these are passed directly as Weaviate object IDs in `src/services/space.service.ts`. Weaviate rejects these because they are not valid UUIDs.

**Research findings**:
- Weaviate only accepts UUID v3, v4, or v5 as object IDs
- No arbitrary string IDs are supported (open feature request, not implemented)
- The Weaviate JS client provides `generateUuid5()` for deterministic UUID generation
- UUID v5 is a SHA-1 hash of input string + namespace, same input always produces the same UUID

---

## Steps

### 1. Update `generateCompositeId()` to Return UUID v5

In `src/collections/composite-ids.ts`:
- Import `generateUuid5` from `weaviate-client` (or implement UUID v5 generation)
- Keep the logical composite string (`{userId}.{memoryId}`) as input
- Return `generateUuid5("{userId}.{memoryId}")` — a valid UUID
- Alternatively, add a separate `generateCompositeUuid()` function that wraps the existing composite string in UUID v5, keeping `generateCompositeId()` for the logical ID

### 2. Update `parseCompositeId()` Strategy

Since UUID v5 is a one-way hash, you cannot reverse a UUID back to `{userId}.{memoryId}`. Options:
- Store the original `composite_id` string as a Weaviate property alongside the UUID-based object ID
- Use `composite_id` property for lookups that need to extract userId/memoryId
- Use the UUID for Weaviate insert/update/delete operations

### 3. Update `space.service.ts` Weaviate Operations

In `src/services/space.service.ts`:
- Where composite IDs are used as Weaviate `id` fields (lines ~741, 755, 795, etc.), convert to UUID v5
- Keep the composite string in a `composite_id` property on the Weaviate object for reverse lookups
- Update fetch/update/delete operations to use the UUID v5 ID

### 4. Update Tests

- Update `src/collections/__tests__/composite-ids.spec.ts` (or colocated spec) to expect UUID format
- Update `src/services/__tests__/space.service.spec.ts` to match new ID format
- Verify determinism: same input always produces the same UUID

### 5. Consider Migration

- Existing Weaviate objects may have dot-delimited IDs
- Determine if migration is needed or if this is greenfield (no production data yet)

---

## Verification

- [ ] `generateCompositeId()` (or new function) returns a valid UUID v5 string
- [ ] Same userId + memoryId always produce the same UUID
- [ ] Weaviate insert/update/delete operations succeed with UUID v5 IDs
- [ ] Composite string still stored as a searchable property on Weaviate objects
- [ ] `parseCompositeId()` can still extract userId and memoryId from the string property
- [ ] All existing tests updated and passing
- [ ] No dots or arbitrary strings used as Weaviate object IDs

---

## Expected Output

**Files Modified**:
- `src/collections/composite-ids.ts` — UUID v5 generation
- `src/collections/composite-ids.spec.ts` — Updated tests
- `src/services/space.service.ts` — Weaviate operations use UUID v5
- `src/services/space.service.spec.ts` — Updated assertions

---

## Resources

- [Weaviate UUID Requirements](https://docs.weaviate.io/weaviate/concepts/data) — Object ID format docs
- [Weaviate JS Client `generateUuid5`](https://weaviate.io/developers/weaviate/client-libraries/typescript) — Deterministic UUID utility
- [UUID v5 spec (RFC 4122)](https://www.rfc-editor.org/rfc/rfc4122) — SHA-1 namespace-based UUIDs

---

## Notes

- UUID v5 is deterministic — no need to store a mapping table
- The Weaviate JS client already ships `generateUuid5`, so no new dependencies needed
- The logical composite ID string should still be stored as a property for human readability and component extraction
- Underscores, dashes, or other delimiter changes do NOT solve this — Weaviate requires UUIDs, period

---

**Next Task**: N/A
**Related Design Docs**: N/A
**Estimated Completion Date**: TBD
