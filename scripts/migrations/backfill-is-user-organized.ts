#!/usr/bin/env node
/**
 * Backfill is_user_organized on existing memories.
 *
 * Sets is_user_organized=false on all memories that have null/undefined
 * is_user_organized. This ensures the organize feed filter (equal(false))
 * catches pre-M64 memories without relying on Weaviate isNull indexing.
 *
 * Usage:
 *   set -a && source .env.prod.local && set +a && \
 *   ENVIRONMENT=production node --import tsx/esm scripts/migrations/backfill-is-user-organized.ts \
 *     [--dry-run]
 *
 * Processes all Memory_ collections from the collection registry.
 * Safe to re-run: Yes (idempotent — skips memories already set).
 */

import { initWeaviateClient } from '../../src/database/weaviate/client.js';
import { reconcileCollectionProperties } from '../../src/database/weaviate/v2-collections.js';
import { queryDocuments } from '../../src/database/firestore/init.js';
import { getCollectionRegistryPath } from '../../src/database/firestore/paths.js';
import { configure } from 'weaviate-client';

const dryRun = process.argv.includes('--dry-run');

const BAR_WIDTH = 30;

function progressBar(current: number, total: number, label: string, extra = '') {
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(pct * BAR_WIDTH);
  const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
  const pctStr = (pct * 100).toFixed(0).padStart(3);
  process.stdout.write(`\r  ${bar} ${pctStr}% ${label}${extra}`);
}

async function backfill() {
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  // Get all collections from registry
  const registryPath = getCollectionRegistryPath();
  const collections = await queryDocuments(registryPath, {
    orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
  });

  const memoryCollections = collections
    .map((doc) => doc.data.collection_name as string)
    .filter((name) => name.startsWith('Memory_'));

  console.log(`Found ${memoryCollections.length} memory collections.\n`);

  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  let totalScanned = 0;
  let totalUpdated = 0;

  const ORGANIZED_PROPERTY = [
    { name: 'is_user_organized', dataType: configure.dataType.BOOLEAN },
  ];

  for (let ci = 0; ci < memoryCollections.length; ci++) {
    const collectionName = memoryCollections[ci];
    console.log(`[${ci + 1}/${memoryCollections.length}] ${collectionName}`);

    // Ensure is_user_organized property exists on this collection
    const added = await reconcileCollectionProperties(client, collectionName, ORGANIZED_PROPERTY);
    if (added > 0) {
      console.log(`  Reconciled: added is_user_organized property`);
    }

    const collection = client.collections.get(collectionName);

    // Get total count for progress bar
    const { totalCount } = await collection.aggregate.overAll();
    const total = totalCount ?? 0;

    let scanned = 0;
    let updated = 0;

    for await (const obj of collection.iterator()) {
      scanned++;
      const props = obj.properties as Record<string, unknown>;

      // Only process memory documents
      if (props.doc_type !== 'memory') {
        progressBar(scanned, total, `${scanned}/${total}`, ` (${updated} updated)`);
        continue;
      }

      // Skip if already has is_user_organized set
      if (props.is_user_organized != null) {
        progressBar(scanned, total, `${scanned}/${total}`, ` (${updated} updated)`);
        continue;
      }

      if (dryRun) {
        updated++;
      } else {
        await collection.data.update({
          id: obj.uuid,
          properties: {
            is_user_organized: false,
          },
        });
        updated++;
      }

      progressBar(scanned, total, `${scanned}/${total}`, ` (${updated} updated)`);
    }

    // Clear progress line and print summary
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    console.log(`  Scanned: ${scanned}, Updated: ${updated}`);
    totalScanned += scanned;
    totalUpdated += updated;
  }

  console.log(`\nDone.`);
  console.log(`  Total scanned: ${totalScanned}`);
  console.log(`  Total updated: ${totalUpdated}`);
  if (dryRun) {
    console.log(`  (DRY RUN — no changes written)`);
  }

  process.exit(0);
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
