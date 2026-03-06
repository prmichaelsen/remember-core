#!/usr/bin/env node
/**
 * Backfill content_hash on existing memories.
 *
 * Computes SHA-256(normalized content + sorted references) for all memories.
 * Safe to re-run (idempotent — same content produces the same hash).
 *
 * Usage:
 *   set -a && source .env.prod.local && set +a && \
 *   ENVIRONMENT=production node --import tsx/esm scripts/migrations/backfill-content-hash.ts \
 *     [--dry-run]
 *
 * Processes all Memory_ collections from the collection registry.
 */

import { initWeaviateClient, getWeaviateClient } from '../../src/database/weaviate/client.js';
import { reconcileCollectionProperties } from '../../src/database/weaviate/v2-collections.js';
import { queryDocuments } from '../../src/database/firestore/init.js';
import { getCollectionRegistryPath } from '../../src/database/firestore/paths.js';
import { computeContentHash } from '../../src/utils/content-hash.js';
import { configure } from 'weaviate-client';

const dryRun = process.argv.includes('--dry-run');

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

interface BackfillStats {
  collections_processed: number;
  memories_updated: number;
  errors: number;
}

const CONTENT_HASH_PROPERTIES = [
  { name: 'content_hash', dataType: configure.dataType.TEXT },
];

async function backfill() {
  console.log('\n  ╔══════════════════════════════════════════╗');
  console.log('  ║     Backfill Content Hash Migration      ║');
  console.log(`  ╚══════════════════════════════════════════╝`);
  console.log(`\n  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  const stats: BackfillStats = {
    collections_processed: 0,
    memories_updated: 0,
    errors: 0,
  };

  // Get all collections from registry
  const registryPath = getCollectionRegistryPath();
  const collections = await queryDocuments(registryPath, {
    orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
  });

  const memoryCollections = collections
    .map((doc) => doc.data.collection_name as string)
    .filter((name) => name.startsWith('Memory_'));

  console.log(`  Found ${memoryCollections.length} memory collections.\n`);

  await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  const client = getWeaviateClient();

  for (const collectionName of memoryCollections) {
    const shortName = collectionName.replace('Memory_', '');

    try {
      const exists = await client.collections.exists(collectionName);
      if (!exists) {
        console.log(`  ⊘ ${shortName} — not found in Weaviate, skipped`);
        continue;
      }

      // Ensure content_hash property exists on this collection
      const added = await reconcileCollectionProperties(client, collectionName, CONTENT_HASH_PROPERTIES);
      if (added > 0) {
        console.log(`  ℹ ${shortName} — reconciled: added content_hash property`);
      }

      const collection = client.collections.get(collectionName);
      const aggregate = await collection.aggregate.overAll();
      const totalCount = aggregate.totalCount ?? 0;

      if (totalCount === 0) {
        console.log(`  ⊘ ${shortName} — empty collection, skipped`);
        continue;
      }

      const batchSize = 100;
      let afterCursor: string | undefined = undefined;
      let collectionCount = 0;

      process.stdout.write(progressBar(0, totalCount, shortName));

      while (true) {
        const results = await collection.query.fetchObjects({
          limit: batchSize,
          ...(afterCursor ? { after: afterCursor } : {}),
          returnProperties: ['content', 'references', 'doc_type'],
          includeVector: true,
        });

        if (results.objects.length === 0) break;

        afterCursor = results.objects[results.objects.length - 1].uuid;

        for (const obj of results.objects) {
          const props = obj.properties as Record<string, unknown>;

          // Skip relationships — only hash memories
          if (props.doc_type === 'relationship') continue;

          const content = (props.content as string) ?? '';
          const references = (props.references as string[] | undefined) ?? [];

          if (!content) continue;

          const hash = computeContentHash(content, references);

          try {
            if (!dryRun) {
              await collection.data.update({
                id: obj.uuid,
                properties: { content_hash: hash },
                vectors: (obj.vectors as any).default,
              });
            }

            stats.memories_updated++;
            collectionCount++;
            clearLine();
            process.stdout.write(progressBar(collectionCount, totalCount, shortName));
          } catch (error) {
            stats.errors++;
          }
        }

        if (results.objects.length < batchSize) break;
      }

      clearLine();
      console.log(`  ✓ ${shortName} — ${collectionCount} memories hashed`);
      stats.collections_processed++;
    } catch (error) {
      clearLine();
      console.log(`  ✗ ${shortName} — error: ${error instanceof Error ? error.message : error}`);
      stats.errors++;
    }
  }

  console.log('\n  === Backfill Complete ===');
  console.log(`  Collections processed: ${stats.collections_processed}`);
  console.log(`  Memories updated: ${stats.memories_updated}`);
  console.log(`  Errors: ${stats.errors}`);
  if (dryRun) {
    console.log(`  (DRY RUN — no changes written)`);
  }

  if (stats.errors > 0) {
    console.log('\n  ⚠️  Some errors occurred. Check logs above for details.');
    process.exit(1);
  }

  process.exit(0);
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
