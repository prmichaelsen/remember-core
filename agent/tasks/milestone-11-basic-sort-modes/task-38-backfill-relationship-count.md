# Task 38: Backfill relationship_count for Existing Memories

**Milestone**: [M11 - Basic Sort Modes](../../milestones/milestone-11-basic-sort-modes.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 37 (relationship_count property must exist)
**Status**: Not Started

---

## Objective

Create a migration script to populate `relationship_count` for all existing memories by reading their `relationships` array length. This ensures the denormalized property matches the source of truth.

---

## Context

Existing memories don't have `relationship_count` set. Before enabling density sorting, we need to backfill this property for all memories across all user collections.

The script must handle:
- Multiple collections (Memory_users_{userId})
- Large collections (10k+ memories)
- Progress logging
- Error handling
- Idempotency (safe to re-run)

---

## Steps

### 1. Create Migration Script

Create `scripts/migrations/backfill-relationship-count.ts`:

```typescript
import { WeaviateClient } from 'weaviate-client';
import { initWeaviateClient } from '../src/database/weaviate/client.js';
import { getCollectionName } from '../src/utils/collection.js';

interface BackfillStats {
  collections_processed: number;
  memories_updated: number;
  errors: number;
}

async function backfillRelationshipCount() {
  const stats: BackfillStats = {
    collections_processed: 0,
    memories_updated: 0,
    errors: 0,
  };

  // Initialize Weaviate client
  await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY!,
    openaiApiKey: process.env.EMBEDDINGS_API_KEY!,
  });

  const client = WeaviateClient.getInstance();

  // Get all collections (you may need to adapt this based on your setup)
  const collections = await client.collections.listAll();

  for (const collectionInfo of collections) {
    if (!collectionInfo.name.startsWith('Memory_users_')) {
      continue; // Skip non-user collections
    }

    console.log(`Processing collection: ${collectionInfo.name}`);
    const collection = client.collections.get(collectionInfo.name);

    // Fetch all memories in batches
    let offset = 0;
    const batchSize = 100;
    let hasMore = true;

    while (hasMore) {
      const results = await collection.query.fetchObjects({
        limit: batchSize,
        offset,
        filters: collection.filter.byProperty('doc_type').equal('memory'),
      });

      if (results.objects.length === 0) {
        hasMore = false;
        break;
      }

      // Update each memory
      for (const obj of results.objects) {
        try {
          const relationships = obj.properties.relationships as string[] || [];
          const count = relationships.length;

          await collection.data.update({
            id: obj.uuid,
            properties: {
              relationship_count: count,
            },
          });

          stats.memories_updated++;

          if (stats.memories_updated % 100 === 0) {
            console.log(`  Updated ${stats.memories_updated} memories...`);
          }
        } catch (error) {
          console.error(`Error updating memory ${obj.uuid}:`, error);
          stats.errors++;
        }
      }

      offset += batchSize;
    }

    stats.collections_processed++;
    console.log(`Completed ${collectionInfo.name}: ${stats.memories_updated} memories updated`);
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`Collections processed: ${stats.collections_processed}`);
  console.log(`Memories updated: ${stats.memories_updated}`);
  console.log(`Errors: ${stats.errors}`);
}

// Run migration
backfillRelationshipCount()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
```

### 2. Add npm Script

Update `package.json`:

```json
{
  "scripts": {
    "migrate:backfill-relationship-count": "tsx scripts/migrations/backfill-relationship-count.ts"
  }
}
```

### 3. Document Usage

Create `scripts/migrations/README.md` if it doesn't exist:

```markdown
# Migrations

## backfill-relationship-count

Populates `relationship_count` for all existing memories.

**Usage**:
```bash
npm run migrate:backfill-relationship-count
```

**Requirements**:
- WEAVIATE_REST_URL set
- WEAVIATE_API_KEY set
- EMBEDDINGS_API_KEY set

**Safe to re-run**: Yes, idempotent
```

### 4. Test on Development Data

Run against development/staging before production:

```bash
# Set to dev environment
export WEAVIATE_REST_URL=https://dev-weaviate.example.com
npm run migrate:backfill-relationship-count
```

---

## Verification

- [ ] Script created at `scripts/migrations/backfill-relationship-count.ts`
- [ ] npm script added to package.json
- [ ] Script runs without errors on test data
- [ ] Progress logging works (logs every 100 memories)
- [ ] All memories have `relationship_count` set
- [ ] relationship_count matches relationships.length
- [ ] Can re-run script safely (idempotent)
- [ ] Handles errors gracefully (doesn't crash on single failure)

---

## Expected Output

**Console Output**:
```
Processing collection: Memory_users_abc123
  Updated 100 memories...
  Updated 200 memories...
  Updated 300 memories...
Completed Memory_users_abc123: 347 memories updated

Processing collection: Memory_users_def456
  Updated 100 memories...
Completed Memory_users_def456: 152 memories updated

=== Backfill Complete ===
Collections processed: 2
Memories updated: 499
Errors: 0
```

---

## Common Issues and Solutions

### Issue 1: Weaviate connection timeout
**Symptom**: Script fails with connection error
**Solution**: Check WEAVIATE_REST_URL is correct and Weaviate is accessible. Verify API key is valid.

### Issue 2: Out of memory for large collections
**Symptom**: Script crashes with heap error
**Solution**: Reduce batchSize from 100 to 50 or 25. Process collections one at a time if needed.

### Issue 3: Some memories missing relationship_count
**Symptom**: Verification shows nulls
**Solution**: Re-run script (it's idempotent). Check for errors in console output.

---

## Notes

- Run during low-traffic period for production
- Estimated time: ~1 hour for 100k memories
- Monitor memory usage during execution
- Keep logs for audit trail
- Can be run multiple times safely

---

**Next Task**: [task-39-maintain-relationship-count.md](task-39-maintain-relationship-count.md)
**Related Design Docs**: [memory-sorting-algorithms.md](../../design/memory-sorting-algorithms.md)
