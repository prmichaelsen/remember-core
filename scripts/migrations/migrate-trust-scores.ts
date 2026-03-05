#!/usr/bin/env node
/**
 * Migrate trust_score values from float 0-1 to integer 1-5.
 *
 * Scans all Weaviate Memory_ collections via the Firestore collection registry,
 * reads each memory's trust_score, and writes back the normalized integer value.
 *
 * Float semantics (old): 0 = private/secret, 1 = public/open
 * Integer semantics (new): 1 = Public, 5 = Secret (higher = more confidential)
 *
 * Usage:
 *   ENVIRONMENT=production node --import tsx/esm scripts/migrations/migrate-trust-scores.ts
 *
 * Options:
 *   --dry-run  Print what would change without writing (default: false)
 *
 * Requirements:
 *   - WEAVIATE_REST_URL set
 *   - WEAVIATE_API_KEY set (if using cloud)
 *   - EMBEDDINGS_API_KEY set
 *   - GOOGLE_APPLICATION_CREDENTIALS set (for Firestore)
 *
 * Safe to re-run: Yes (idempotent — already-migrated integers are skipped)
 */

import { initWeaviateClient, getWeaviateClient } from '../../src/database/weaviate/client.js';
import { queryDocuments } from '../../src/database/firestore/init.js';
import { getCollectionRegistryPath } from '../../src/database/firestore/paths.js';
import { normalizeTrustScore, isValidTrustLevel } from '../../src/types/trust.types.js';

interface MigrationStats {
  collections_processed: number;
  memories_scanned: number;
  memories_migrated: number;
  memories_skipped: number;
  errors: number;
  distribution: Record<number, number>;
}

const dryRun = process.argv.includes('--dry-run');

async function migrateTrustScores() {
  console.log(`=== Trust Score Migration (float → integer) ===${dryRun ? ' [DRY RUN]' : ''}\n`);

  const stats: MigrationStats = {
    collections_processed: 0,
    memories_scanned: 0,
    memories_migrated: 0,
    memories_skipped: 0,
    errors: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
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

    // Only process Memory_ collections
    if (!collectionName.startsWith('Memory_')) {
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

      // Cursor-based pagination
      const batchSize = 100;
      let afterCursor: string | undefined = undefined;
      let collectionMigrated = 0;
      let collectionSkipped = 0;

      while (true) {
        const results = await collection.query.fetchObjects({
          limit: batchSize,
          ...(afterCursor ? { after: afterCursor } : {}),
          returnProperties: ['doc_type', 'trust_score'],
        });

        if (results.objects.length === 0) break;

        afterCursor = results.objects[results.objects.length - 1].uuid;

        for (const obj of results.objects) {
          // Only process memory and relationship doc types
          if (obj.properties.doc_type !== 'memory' && obj.properties.doc_type !== 'relationship') continue;

          stats.memories_scanned++;
          const currentTrust = obj.properties.trust_score as number | undefined | null;

          // Skip if already a valid integer trust level
          if (currentTrust != null && isValidTrustLevel(currentTrust)) {
            stats.memories_skipped++;
            collectionSkipped++;
            stats.distribution[currentTrust]++;
            continue;
          }

          // Normalize float → integer
          const newTrust = normalizeTrustScore(currentTrust);
          stats.distribution[newTrust]++;

          if (!dryRun) {
            try {
              await collection.data.update({
                id: obj.uuid,
                properties: { trust_score: newTrust },
              });
              stats.memories_migrated++;
              collectionMigrated++;
            } catch (error) {
              console.error(`  ❌ Error migrating ${obj.uuid} (trust_score=${currentTrust} → ${newTrust}):`, error);
              stats.errors++;
            }
          } else {
            stats.memories_migrated++;
            collectionMigrated++;
            console.log(`  [dry-run] ${obj.uuid}: ${currentTrust} → ${newTrust}`);
          }

          if (stats.memories_migrated % 100 === 0 && stats.memories_migrated > 0) {
            console.log(`  Migrated ${stats.memories_migrated} memories total...`);
          }
        }

        if (results.objects.length < batchSize) break;
      }

      stats.collections_processed++;
      console.log(`  ✓ ${collectionName}: ${collectionMigrated} migrated, ${collectionSkipped} already integer\n`);
    } catch (error) {
      console.error(`  ❌ Error processing ${collectionName}:`, error);
      stats.errors++;
    }
  }

  console.log('=== Migration Complete ===');
  console.log(`Collections processed: ${stats.collections_processed}`);
  console.log(`Memories scanned: ${stats.memories_scanned}`);
  console.log(`Memories migrated: ${stats.memories_migrated}`);
  console.log(`Memories skipped (already integer): ${stats.memories_skipped}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`\nTrust level distribution:`);
  console.log(`  1 (Public):       ${stats.distribution[1]}`);
  console.log(`  2 (Internal):     ${stats.distribution[2]}`);
  console.log(`  3 (Confidential): ${stats.distribution[3]}`);
  console.log(`  4 (Restricted):   ${stats.distribution[4]}`);
  console.log(`  5 (Secret):       ${stats.distribution[5]}`);

  if (dryRun) {
    console.log('\n📝 This was a dry run. No data was modified.');
    console.log('   Run without --dry-run to apply changes.');
  }

  if (stats.errors > 0) {
    console.log('\n⚠️  Some errors occurred. Check logs above for details.');
    process.exit(1);
  }
}

// Run migration
migrateTrustScores()
  .then(() => {
    console.log('\n✓ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
