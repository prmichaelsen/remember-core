#!/usr/bin/env node
/**
 * Backfill memory index for all existing memories.
 *
 * Scans all Weaviate collections via the Firestore collection registry
 * and writes UUID → collection_name index entries to Firestore.
 *
 * Usage:
 *   ENVIRONMENT=production node --import tsx/esm scripts/migrations/backfill-memory-index.ts
 *
 * Requirements:
 *   - WEAVIATE_REST_URL set
 *   - WEAVIATE_API_KEY set (if using cloud)
 *   - EMBEDDINGS_API_KEY set
 *   - GOOGLE_APPLICATION_CREDENTIALS set (for Firestore)
 *
 * Safe to re-run: Yes (idempotent — uses Firestore set())
 */

import { initWeaviateClient, getWeaviateClient } from '../../src/database/weaviate/client.js';
import { queryDocuments } from '../../src/database/firestore/init.js';
import { getCollectionRegistryPath } from '../../src/database/firestore/paths.js';
import { MemoryIndexService } from '../../src/services/memory-index.service.js';

interface BackfillStats {
  collections_processed: number;
  memories_indexed: number;
  errors: number;
}

const logger = {
  debug: (msg: string) => console.log(`  ${msg}`),
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(`  ⚠️  ${msg}`),
  error: (msg: string) => console.error(`  ❌ ${msg}`),
};

async function backfillMemoryIndex() {
  console.log('=== Backfill Memory Index Migration ===\n');

  const stats: BackfillStats = {
    collections_processed: 0,
    memories_indexed: 0,
    errors: 0,
  };

  // Initialize Weaviate client
  await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.EMBEDDINGS_API_KEY!,
  });

  const client = getWeaviateClient();
  const indexService = new MemoryIndexService(logger);

  // Get all collections from Firestore registry
  const path = getCollectionRegistryPath();
  const registryEntries = await queryDocuments(path, {
    orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
  });

  console.log(`Found ${registryEntries.length} collections in registry\n`);

  for (const entry of registryEntries) {
    const collectionName = entry.data.collection_name as string;

    // Only process Memory_ collections
    if (!collectionName.startsWith('Memory_')) {
      console.log(`Skipping ${collectionName} (not a memory collection)`);
      continue;
    }

    console.log(`Processing ${collectionName}...`);

    try {
      const exists = await client.collections.exists(collectionName);
      if (!exists) {
        console.log(`  ⚠️  Collection not found in Weaviate, skipping`);
        continue;
      }

      const collection = client.collections.get(collectionName);

      // Fetch all memories in batches
      const batchSize = 100;
      let hasMore = true;
      let collectionCount = 0;

      while (hasMore) {
        const results = await collection.query.fetchObjects({
          limit: batchSize,
          filters: collection.filter.byProperty('doc_type').equal('memory'),
        });

        if (results.objects.length === 0) {
          hasMore = false;
          break;
        }

        // Index each memory
        for (const obj of results.objects) {
          try {
            await indexService.index(obj.uuid, collectionName);
            stats.memories_indexed++;
            collectionCount++;

            if (stats.memories_indexed % 100 === 0) {
              console.log(`  Indexed ${stats.memories_indexed} memories total...`);
            }
          } catch (error) {
            console.error(`  ❌ Error indexing memory ${obj.uuid}:`, error);
            stats.errors++;
          }
        }

        if (results.objects.length < batchSize) {
          hasMore = false;
        }
      }

      stats.collections_processed++;
      console.log(`  ✓ Completed ${collectionName}: ${collectionCount} memories indexed\n`);
    } catch (error) {
      console.error(`  ❌ Error processing ${collectionName}:`, error);
      stats.errors++;
    }
  }

  console.log('=== Backfill Complete ===');
  console.log(`Collections processed: ${stats.collections_processed}`);
  console.log(`Memories indexed: ${stats.memories_indexed}`);
  console.log(`Errors: ${stats.errors}`);

  if (stats.errors > 0) {
    console.log('\n⚠️  Some errors occurred. Check logs above for details.');
    process.exit(1);
  }
}

// Run migration
backfillMemoryIndex()
  .then(() => {
    console.log('\n✓ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
