#!/usr/bin/env node
/**
 * Backfill member_count for all existing relationships.
 *
 * Populates the denormalized member_count property by reading the
 * related_memory_ids array length for each relationship across all user collections.
 *
 * Usage:
 *   ENVIRONMENT=production node --import tsx/esm scripts/migrations/backfill-member-count.ts
 *
 * Requirements:
 *   - WEAVIATE_REST_URL set
 *   - WEAVIATE_API_KEY set (if using cloud)
 *   - EMBEDDINGS_API_KEY set
 *   - GOOGLE_APPLICATION_CREDENTIALS set (for Firestore collection registry)
 *
 * Safe to re-run: Yes (idempotent)
 */

import { initWeaviateClient, getWeaviateClient } from '../../src/database/weaviate/client.js';
import { queryDocuments } from '../../src/database/firestore/init.js';
import { getCollectionRegistryPath } from '../../src/database/firestore/paths.js';

interface BackfillStats {
  collections_processed: number;
  relationships_updated: number;
  errors: number;
}

async function backfillMemberCount() {
  console.log('=== Backfill member_count Migration ===\n');

  const stats: BackfillStats = {
    collections_processed: 0,
    relationships_updated: 0,
    errors: 0,
  };

  // Initialize Weaviate client
  await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.EMBEDDINGS_API_KEY!,
  });

  const client = getWeaviateClient();

  // Get all collections from Firestore registry
  const path = getCollectionRegistryPath();
  const registryEntries = await queryDocuments(path, {
    orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
  });

  console.log(`Found ${registryEntries.length} collections in registry\n`);

  for (const entry of registryEntries) {
    const collectionName = entry.data.collection_name as string;
    const collectionType = entry.data.collection_type as string;

    // Only process user collections (relationships live in user collections)
    if (collectionType !== 'users') {
      console.log(`Skipping ${collectionName} (type: ${collectionType})`);
      continue;
    }

    console.log(`Processing ${collectionName}...`);

    try {
      const collection = client.collections.get(collectionName);

      // Check if collection exists in Weaviate
      const exists = await client.collections.exists(collectionName);
      if (!exists) {
        console.log(`  ⚠️  Collection not found in Weaviate, skipping`);
        continue;
      }

      // Fetch all documents in batches
      let afterCursor: string | undefined = undefined;
      const batchSize = 100;
      let collectionCount = 0;

      while (true) {
        const results = await collection.query.fetchObjects({
          limit: batchSize,
          ...(afterCursor ? { after: afterCursor } : {}),
        });

        if (results.objects.length === 0) {
          break;
        }

        // Track cursor for next page
        afterCursor = results.objects[results.objects.length - 1].uuid;

        // Update each relationship
        for (const obj of results.objects) {
          if (obj.properties.doc_type !== 'relationship') continue;
          try {
            const relatedMemoryIds = (obj.properties.related_memory_ids as string[]) || [];
            const memoryIds = (obj.properties.memory_ids as string[]) || [];

            // Use whichever array exists (v2 or v1 compat)
            const count = relatedMemoryIds.length > 0 ? relatedMemoryIds.length : memoryIds.length;

            await collection.data.update({
              id: obj.uuid,
              properties: {
                member_count: count,
              },
            });

            stats.relationships_updated++;
            collectionCount++;

            if (stats.relationships_updated % 100 === 0) {
              console.log(`  Updated ${stats.relationships_updated} relationships total...`);
            }
          } catch (error) {
            console.error(`  ❌ Error updating relationship ${obj.uuid}:`, error);
            stats.errors++;
          }
        }

        if (results.objects.length < batchSize) {
          break;
        }
      }

      stats.collections_processed++;
      console.log(`  ✓ Completed ${collectionName}: ${collectionCount} relationships updated\n`);
    } catch (error) {
      console.error(`  ❌ Error processing ${collectionName}:`, error);
      stats.errors++;
    }
  }

  console.log('=== Backfill Complete ===');
  console.log(`Collections processed: ${stats.collections_processed}`);
  console.log(`Relationships updated: ${stats.relationships_updated}`);
  console.log(`Errors: ${stats.errors}`);

  if (stats.errors > 0) {
    console.log('\n⚠️  Some errors occurred. Check logs above for details.');
    process.exit(1);
  }
}

// Run migration
backfillMemberCount()
  .then(() => {
    console.log('\n✓ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
