# Task 124: Switch Dedupe Strategy from Content Hash to Source ID

**Status**: Not Started
**Milestone**: M22 — Content Hash Deduplication
**Estimated Time**: 2-4 hours
**Dependencies**: task-118, task-119, task-120, task-121, task-122
**Created**: 2026-03-06

---

## Objective

Replace content-hash-based deduplication with `original_memory_id`-based deduplication. Since all duplicates in the system are created through explicit publish/share operations (which already set `original_memory_id`), the content hash is unnecessary complexity. Two users independently creating identical memories is not a realistic scenario worth engineering for.

## Context

M22 implemented two complementary dedupe mechanisms:
1. `content_hash` (SHA-256) — exact content match deduplication
2. `original_memory_id` — origin link tracking for diverged copies

In practice, `original_memory_id` alone is sufficient because duplicates only enter the system through publish/share flows, which already set this field. Content hashing adds write overhead and schema complexity for a case that doesn't meaningfully occur.

## Steps

### 1. Update deduplication logic

- Modify `dedupeByContentHash` in `src/utils/dedupe.ts` (or rename/replace it)
- Group by `original_memory_id` instead of `content_hash`
- Keep the same precedence rules (space > group > personal)
- Keep `also_in` metadata on winners

### 2. Remove content hash computation on write

- Remove `computeContentHash` calls from `MemoryService.create()` and `MemoryService.update()`
- Delete `computeContentHash` utility and its tests
- Remove `content_hash` from `COMMON_MEMORY_PROPERTIES` / `ALL_MEMORY_PROPERTIES` / `Memory` type

### 3. Remove content hash from schema

- Remove `content_hash` property definition from Weaviate schema constants
- No need for a migration — existing `content_hash` values can be left in place (Weaviate ignores undefined properties on read)

### 4. Delete backfill script

- Remove `scripts/migrations/backfill-content-hash.ts` (never needed to run if hash is removed)

### 5. Update tests

- Update dedupe unit tests to group by `original_memory_id` instead of `content_hash`
- Remove `content_hash`-specific tests
- Ensure `SpaceService.search()` integration still works with new dedupe logic
- Memories without `original_memory_id` (originals) should never be deduped

### 6. Update design document

- Update `agent/design/local.content-hash-dedupe.md` to reflect the simplified approach
- Or rename to `local.source-id-dedupe.md`

## Verification

- [ ] Deduplication groups by `original_memory_id` instead of `content_hash`
- [ ] `computeContentHash` removed from write path
- [ ] `content_hash` removed from type definitions and schema
- [ ] Backfill script deleted
- [ ] Precedence rules still work (space > group > personal)
- [ ] `also_in` metadata still attached to winners
- [ ] Original memories (no `original_memory_id`) are never deduped
- [ ] All tests passing
- [ ] Design doc updated
