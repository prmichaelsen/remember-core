# Task 96: Backfill Migration Script

**Milestone**: [M18 - Memory Index Lookup Table](../../milestones/milestone-18-memory-index-lookup.md)
**Estimated Time**: 3-4 hours
**Dependencies**: [Task 93: MemoryIndexService](task-93-memory-index-service.md)
**Status**: Not Started

---

## Objective

Create a migration script that scans all existing Weaviate collections and writes index entries to Firestore for every memory. After this runs, all memories are indexed and the legacy fallback is no longer needed.

---

## Context

New memories created after task-94 are automatically indexed. But existing memories pre-date the index. This one-time script backfills those entries so `getById()` works for all memories without fallback.

---

## Steps

### 1. Create migration script

Create `scripts/migrations/backfill-memory-index.ts`:

- Use the collection registry (Firestore `collection_registry`) to enumerate all Weaviate collections
- For each collection, list all memory objects (paginated)
- For each memory, write index entry via `MemoryIndexService.index(uuid, collectionName)`
- Use Firestore batch writes for efficiency (up to 500 per batch)
- Log progress: collections processed, memories indexed, errors

### 2. Handle all collection types

- `Memory_users_*` — user collections
- `Memory_groups_*` — group collections
- `Memory_spaces_public` — space collection

### 3. Add idempotency

- Use Firestore `set()` (not `create()`) so re-running is safe
- Skip memories that already have index entries (optional optimization)

### 4. Add npm script

Add to `package.json`:

```json
"migrate:backfill-memory-index": "node --import tsx/esm scripts/migrations/backfill-memory-index.ts"
```

### 5. Add basic tests for script logic

Create `scripts/migrations/backfill-memory-index.spec.ts` (or colocate if pattern allows):

- Test that script correctly enumerates collections
- Test batch write logic
- Test idempotency (re-run doesn't duplicate)

---

## Verification

- [ ] `scripts/migrations/backfill-memory-index.ts` exists
- [ ] Script enumerates all collection types (users, groups, spaces)
- [ ] Script writes index entries via batch writes
- [ ] Script is idempotent (safe to re-run)
- [ ] npm script `migrate:backfill-memory-index` added to package.json
- [ ] Script logs progress (collections, memories, errors)
- [ ] Build passes

---

## Expected Output

**Files Created**:
- `scripts/migrations/backfill-memory-index.ts`

**Files Modified**:
- `package.json` — add migration npm script

---

**Next Task**: [Task 97: Deprecate MemoryResolutionService](task-97-deprecate-memory-resolution-service.md)
**Related Design Docs**: [agent/design/local.memory-index-lookup.md](../../design/local.memory-index-lookup.md)
