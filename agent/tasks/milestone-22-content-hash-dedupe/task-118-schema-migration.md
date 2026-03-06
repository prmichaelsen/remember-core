# Task 118: Schema Migration — content_hash and source_memory_id

**Milestone**: [M22 - Content Hash Deduplication](../../milestones/milestone-22-content-hash-dedupe.md)
**Estimated Time**: 3-4 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add `content_hash` (string) and `source_memory_id` (string, nullable) properties to all Weaviate memory collections and update TypeScript type definitions.

---

## Context

Content hash deduplication requires two new properties on every memory object. These must be added to the Weaviate schema, the collection property lists, and the Memory TypeScript types. This is the foundational task — all other M22 tasks depend on it.

---

## Steps

### 1. Update Memory Types

Add `content_hash` and `source_memory_id` to the Memory interface in `src/types/memory.types.ts`.

```typescript
content_hash?: string;        // SHA-256 of normalized content + sorted references
source_memory_id?: string;    // UUID of original memory (set on publish/share)
```

### 2. Update Weaviate Collection Schema

Add properties to the collection definition in `src/database/weaviate/v2-collections.ts` (or equivalent schema file). Both should be `text` type, filterable.

### 3. Update Weaviate Client Property List

Add `content_hash` and `source_memory_id` to the property list in `src/database/weaviate/client.ts` so they are included in query results.

### 4. Create Backfill Script

Create a migration script that:
- Iterates all memories across all collections
- Computes `content_hash` for each memory (SHA-256 of normalized content + sorted references)
- Updates each memory with the computed hash
- Reports progress (batch processing with progress bar)

### 5. Test Schema Changes

- Verify new properties are created on collection initialization
- Verify properties are returned in query results
- Verify backfill script works on test data

---

## Verification

- [ ] `content_hash` and `source_memory_id` in Memory TypeScript interface
- [ ] Properties added to Weaviate collection schema definition
- [ ] Properties included in client property list
- [ ] Backfill script created and tested
- [ ] Existing tests still pass (no regressions)
- [ ] New properties are filterable in Weaviate

---

**Next Task**: [Task 119: Hash Computation on Write](task-119-hash-computation.md)
**Related Design Docs**: [Content Hash Deduplication](../../design/local.content-hash-dedupe.md)
