#!/usr/bin/env node
/**
 * Backfill content_hash on existing memories.
 *
 * Computes SHA-256(normalized content + sorted references) for all memories
 * that have null/undefined content_hash.
 *
 * Usage:
 *   set -a && source .env.prod.local && set +a && \
 *   ENVIRONMENT=production node --import tsx/esm scripts/migrations/backfill-content-hash.ts \
 *     [--dry-run]
 *
 * Processes all Memory_ collections from the collection registry.
 */

import { initWeaviateClient } from '../../src/database/weaviate/client.js';
import { reconcileCollectionProperties } from '../../src/database/weaviate/v2-collections.js';
import { queryDocuments } from '../../src/database/firestore/init.js';
import { getCollectionRegistryPath } from '../../src/database/firestore/paths.js';
import { computeContentHash } from '../../src/utils/content-hash.js';
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

  const CONTENT_HASH_PROPERTIES = [
    { name: 'content_hash', dataType: configure.dataType.TEXT },
  ];

  for (const collectionName of memoryCollections) {
    console.log(`Processing ${collectionName}...`);

    // Ensure content_hash property exists on this collection
    const added = await reconcileCollectionProperties(client, collectionName, CONTENT_HASH_PROPERTIES);
    if (added > 0) {
      console.log(`  Reconciled: added content_hash property`);
    }

    const collection = client.collections.get(collectionName);

    let scanned = 0;
    let updated = 0;

    for await (const obj of collection.iterator({
      returnProperties: ['content', 'references', 'content_hash', 'doc_type'],
    })) {
      scanned++;
      const props = obj.properties as Record<string, unknown>;

      // Skip relationships — only hash memories
      if (props.doc_type === 'relationship') continue;

      // Skip if already has content_hash
      if (props.content_hash) continue;

      const content = (props.content as string) ?? '';
      const references = (props.references as string[] | undefined) ?? [];

      if (!content) continue;

      const hash = computeContentHash(content, references);

      if (dryRun) {
        updated++;
      } else {
        await collection.data.update({
          id: obj.uuid,
          properties: { content_hash: hash },
        });
        updated++;
      }

      if (scanned % 100 === 0) {
        process.stdout.write(`\r  Scanned: ${scanned}, Updated: ${updated}`);
      }
    }

    console.log(`\r  Scanned: ${scanned}, Updated: ${updated}`);
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
