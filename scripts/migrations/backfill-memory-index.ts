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
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const BAR_WIDTH = 30;

function progressBar(current: number, total: number, label: string): string {
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(pct * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const pctStr = (pct * 100).toFixed(0).padStart(3);
  return `  ${bar} ${pctStr}% ${current}/${total} ${label}`;
}

function clearLine() {
  process.stdout.write('\r\x1b[K');
}

async function backfillMemoryIndex() {
  console.log('\n  ╔══════════════════════════════════════════╗');
  console.log('  ║     Backfill Memory Index Migration      ║');
  console.log('  ╚══════════════════════════════════════════╝\n');

  const stats: BackfillStats = {
    collections_processed: 0,
    memories_indexed: 0,
    errors: 0,
  };

  process.stdout.write('  Connecting to Weaviate...');
  await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.EMBEDDINGS_API_KEY!,
  });
  clearLine();
  console.log('  ✓ Connected to Weaviate');

  const client = getWeaviateClient();
  const indexService = new MemoryIndexService(logger);

  process.stdout.write('  Loading collection registry...');
  const path = getCollectionRegistryPath();
  const registryEntries = await queryDocuments(path, {
    orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
  });
  clearLine();

  const memoryCollections = registryEntries.filter(
    (e) => (e.data.collection_name as string).startsWith('Memory_')
  );
  const skipped = registryEntries.length - memoryCollections.length;
  console.log(`  ✓ Found ${memoryCollections.length} memory collections (${skipped} non-memory skipped)\n`);

  for (let ci = 0; ci < memoryCollections.length; ci++) {
    const collectionName = memoryCollections[ci].data.collection_name as string;
    const shortName = collectionName.replace('Memory_', '');

    try {
      const exists = await client.collections.exists(collectionName);
      if (!exists) {
        console.log(`  ⊘ ${shortName} — not found in Weaviate, skipped`);
        continue;
      }

      const collection = client.collections.get(collectionName);
      const batchSize = 100;
      let afterCursor: string | undefined = undefined;
      let collectionCount = 0;

      process.stdout.write(progressBar(0, 0, shortName));

      while (true) {
        const results = await collection.query.fetchObjects({
          limit: batchSize,
          ...(afterCursor ? { after: afterCursor } : {}),
          returnProperties: ['doc_type'],
        });

        if (results.objects.length === 0) break;

        afterCursor = results.objects[results.objects.length - 1].uuid;

        for (const obj of results.objects) {
          if (obj.properties.doc_type !== 'memory') continue;
          try {
            await indexService.index(obj.uuid, collectionName);
            stats.memories_indexed++;
            collectionCount++;
            clearLine();
            process.stdout.write(progressBar(collectionCount, collectionCount, shortName));
          } catch (error) {
            stats.errors++;
          }
        }

        if (results.objects.length < batchSize) break;
      }

      clearLine();
      console.log(`  ✓ ${shortName} — ${collectionCount} memories indexed`);
      stats.collections_processed++;
    } catch (error) {
      clearLine();
      console.log(`  ✗ ${shortName} — error: ${error instanceof Error ? error.message : error}`);
      stats.errors++;
    }
  }

  console.log('');
  console.log('  ┌─────────────────────────────────┐');
  console.log(`  │ Collections: ${String(stats.collections_processed).padStart(6)}              │`);
  console.log(`  │ Indexed:     ${String(stats.memories_indexed).padStart(6)}              │`);
  console.log(`  │ Errors:      ${String(stats.errors).padStart(6)}              │`);
  console.log('  └─────────────────────────────────┘');

  if (stats.errors > 0) {
    console.log('\n  ⚠ Some errors occurred during backfill.\n');
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
