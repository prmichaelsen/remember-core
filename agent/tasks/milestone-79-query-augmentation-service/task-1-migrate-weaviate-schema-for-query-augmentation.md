# Task 1: Migrate Weaviate Schema for Query Augmentation

**Milestone**: [M79 - Query Augmentation Service](../../milestones/milestone-79-query-augmentation-service.md)
**Design Reference**: [M79 Design](../../milestones/milestone-79-query-augmentation-service.md)
**Estimated Time**: 2-4 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Ensure all existing Weaviate Memory collections have the `synthetic_queries`, `queries_generated_at`, and `queries_generation_status` properties required by the query augmentation service (remember-query-augmenter), which is already deployed to Cloud Run but cannot process memories because these fields are missing from live collections.

---

## Context

The remember-query-augmenter service has been deployed to GCP Cloud Run (scheduler + worker) and successfully executes, but fails to count unprocessed memories because the Weaviate collections are missing the `queries_generated_at` property used in filter queries.

The TypeScript types and Weaviate schema definitions already include these fields:
- `src/types/memory.types.ts` (lines 179-182): `synthetic_queries`, `queries_generated_at`, `queries_generation_status`
- `src/database/weaviate/v2-collections.ts` (lines 200-203): Schema property definitions with correct data types

A `reconcileCollectionProperties()` function exists in `v2-collections.ts` (line 393) that can add missing properties to existing collections. The `ensureUserCollection()` function (line 416) calls it when collections are accessed. However, this only runs when a user's collection is actively accessed — it hasn't been triggered for all existing collections yet.

**Error from production logs**:
```
Failed to count unprocessed memories
collection: Memory_users_TAPJ9NyOWzWMdSXVJlcT7yR7WKE2
error: "no such prop with name 'queries_generated_at' found in class..."
```

---

## Steps

### 1. Create Migration Script

Create `scripts/migrations/add-query-augmentation-properties.ts` that:

1. Connects to Weaviate using production credentials
2. Lists all `Memory_*` collections
3. For each collection, calls `reconcileCollectionProperties()` with the three new properties:
   - `synthetic_queries` (TEXT_ARRAY)
   - `queries_generated_at` (DATE)
   - `queries_generation_status` (TEXT)
4. Logs which collections were updated and how many properties were added
5. Reports summary (collections checked, properties added, errors)

```typescript
// Pseudocode
const collections = await client.collections.listAll();
const memoryCollections = collections.filter(c => c.name.startsWith('Memory_'));

for (const col of memoryCollections) {
  const added = await reconcileCollectionProperties(client, col.name, [
    { name: 'synthetic_queries', dataType: 'textArray' },
    { name: 'queries_generated_at', dataType: 'date' },
    { name: 'queries_generation_status', dataType: 'text' },
  ]);
  console.log(`${col.name}: added ${added} properties`);
}
```

### 2. Run Migration Against Production Weaviate

Execute the migration script against the production Weaviate instance:

```bash
tsx scripts/migrations/add-query-augmentation-properties.ts
```

Verify all collections now have the three new properties.

### 3. Verify Query Augmenter Can Now Process

After migration, trigger the remember-query-augmenter scheduler:

```bash
gcloud run jobs execute remember-query-augmenter-scheduler \
  --region=us-central1 --project=com-f5-parm --wait
```

Check logs to confirm:
- No more "no such prop" errors
- Scheduler successfully counts unprocessed memories
- Worker jobs are triggered (if unprocessed memories exist)

### 4. Verify Search Includes synthetic_queries

Confirm that `MemoryService.search()` and `SpaceService.search()` already include `synthetic_queries` in the properties they return. The hybrid search in Weaviate automatically indexes all text properties, so `synthetic_queries` content will be searchable once populated.

Check that `ALL_MEMORY_PROPERTIES` in `client.ts` includes `synthetic_queries`.

---

## Verification

- [ ] Migration script created at `scripts/migrations/add-query-augmentation-properties.ts`
- [ ] All existing Memory_* collections have `synthetic_queries` property (TEXT_ARRAY)
- [ ] All existing Memory_* collections have `queries_generated_at` property (DATE)
- [ ] All existing Memory_* collections have `queries_generation_status` property (TEXT)
- [ ] remember-query-augmenter scheduler runs without "no such prop" errors
- [ ] remember-query-augmenter can count unprocessed memories per collection
- [ ] `ALL_MEMORY_PROPERTIES` includes `synthetic_queries`
- [ ] Hybrid search naturally includes synthetic_queries text in search results
- [ ] All existing tests continue to pass

---

## Expected Output

### Files Created
- `scripts/migrations/add-query-augmentation-properties.ts` - One-time migration script

### Files Modified
- None (schema definitions already exist in code)

---

## Key Design Decisions

### Schema

| Decision | Choice | Rationale |
|---|---|---|
| Property types | TEXT_ARRAY, DATE, TEXT | Matches existing schema definitions in v2-collections.ts |
| Migration approach | Script using reconcileCollectionProperties() | Reuses existing infrastructure, idempotent |
| Search integration | No code changes needed | Weaviate hybrid search auto-indexes all text properties |

---

## Notes

- This is a **blocking prerequisite** for the deployed remember-query-augmenter service
- The migration is idempotent — safe to re-run (reconcileCollectionProperties skips existing properties)
- New collections created after this point will automatically get these properties via ensureUserCollection()
- The `synthetic_queries` field is automatically included in Weaviate's hybrid search (BM25 + vector)
- No remember-core version bump needed — schema definitions already exist in published code

---

**Next Task**: task-2 (TBD - potentially search integration verification or import integration)
**Related Design Docs**: [M79 Milestone](../../milestones/milestone-79-query-augmentation-service.md)
