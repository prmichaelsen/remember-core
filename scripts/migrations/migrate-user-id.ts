#!/usr/bin/env node
/**
 * Migrate stale user_id properties on memories in a collection.
 *
 * After a Firebase project migration, the collection name was updated to the
 * new UID but individual memory documents may still have the old user_id.
 * This script finds mismatched documents and updates them.
 *
 * Usage:
 *   set -a && source .env.prod.local && set +a && \
 *   ENVIRONMENT=production node --import tsx/esm scripts/migrations/migrate-user-id.ts \
 *     --collection Memory_users_geTmbcAMyhYUyeIfQj0ZRFmorhA2 \
 *     --new-user-id geTmbcAMyhYUyeIfQj0ZRFmorhA2 \
 *     [--dry-run]
 */

import { initWeaviateClient } from '../../src/database/weaviate/client.js';

function parseArgs() {
  const args = process.argv.slice(2);
  let collection = '';
  let newUserId = '';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--collection' && args[i + 1]) collection = args[++i];
    else if (args[i] === '--new-user-id' && args[i + 1]) newUserId = args[++i];
    else if (args[i] === '--dry-run') dryRun = true;
  }

  if (!collection || !newUserId) {
    console.error('Usage: ... --collection <name> --new-user-id <uid> [--dry-run]');
    process.exit(1);
  }

  return { collection, newUserId, dryRun };
}

async function migrate() {
  const { collection: collectionName, newUserId, dryRun } = parseArgs();

  console.log(`Collection:   ${collectionName}`);
  console.log(`New user_id:  ${newUserId}`);
  console.log(`Mode:         ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log();

  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  const collection = client.collections.get(collectionName);

  // Fetch all objects, page through them
  let totalScanned = 0;
  let mismatched = 0;
  let updated = 0;
  const staleIds = new Set<string>();

  for await (const obj of collection.iterator({ returnProperties: ['user_id', 'doc_type'] })) {
    totalScanned++;
    const userId = (obj.properties as any).user_id;

    if (userId && userId !== newUserId) {
      mismatched++;
      staleIds.add(userId);

      if (dryRun) {
        console.log(`  [DRY RUN] ${obj.uuid} — user_id: "${userId}" → "${newUserId}"`);
      } else {
        await collection.data.update({
          id: obj.uuid,
          properties: { user_id: newUserId },
        });
        updated++;
        console.log(`  [UPDATED] ${obj.uuid} — user_id: "${userId}" → "${newUserId}"`);
      }
    }

    if (totalScanned % 100 === 0) {
      console.log(`  ... scanned ${totalScanned} objects`);
    }
  }

  console.log(`\nDone.`);
  console.log(`  Total scanned:  ${totalScanned}`);
  console.log(`  Mismatched:     ${mismatched}`);
  console.log(`  Updated:        ${updated}`);
  if (staleIds.size > 0) {
    console.log(`  Stale user_ids: ${[...staleIds].join(', ')}`);
  } else {
    console.log(`  ✅ All documents already have correct user_id.`);
  }

  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
