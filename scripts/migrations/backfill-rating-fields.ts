#!/usr/bin/env node
/**
 * Backfill rating fields on existing memories.
 *
 * Sets rating_sum=0, rating_count=0, rating_bayesian=3.0 on all memories
 * that have null/undefined rating_bayesian. This ensures the rating_min
 * SearchFilter works correctly on pre-M20 memories.
 *
 * Usage:
 *   set -a && source .env.prod.local && set +a && \
 *   ENVIRONMENT=production node --import tsx/esm scripts/migrations/backfill-rating-fields.ts \
 *     [--dry-run]
 *
 * Processes all Memory_ collections from the collection registry.
 */

import { initWeaviateClient } from '../../src/database/weaviate/client.js';
import { reconcileCollectionProperties } from '../../src/database/weaviate/v2-collections.js';
import { queryDocuments } from '../../src/database/firestore/init.js';
import { getCollectionRegistryPath } from '../../src/database/firestore/paths.js';
import { configure } from 'weaviate-client';

const dryRun = process.argv.includes('--dry-run');

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

  const RATING_PROPERTIES = [
    { name: 'rating_sum', dataType: configure.dataType.INT },
    { name: 'rating_count', dataType: configure.dataType.INT },
    { name: 'rating_bayesian', dataType: configure.dataType.NUMBER },
  ];

  for (const collectionName of memoryCollections) {
    console.log(`Processing ${collectionName}...`);

    // Ensure rating properties exist on this collection
    const added = await reconcileCollectionProperties(client, collectionName, RATING_PROPERTIES);
    if (added > 0) {
      console.log(`  Reconciled: added ${added} missing rating properties`);
    }

    const collection = client.collections.get(collectionName);

    let scanned = 0;
    let updated = 0;

    for await (const obj of collection.iterator({
      returnProperties: ['rating_bayesian'],
    })) {
      scanned++;
      const props = obj.properties as Record<string, unknown>;

      // Skip if already has rating_bayesian set
      if (props.rating_bayesian != null) {
        continue;
      }

      if (dryRun) {
        updated++;
      } else {
        await collection.data.update({
          id: obj.uuid,
          properties: {
            rating_sum: 0,
            rating_count: 0,
            rating_bayesian: 3.0,
          },
        });
        updated++;
      }
    }

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
