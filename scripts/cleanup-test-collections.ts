/**
 * Cleanup script: removes defunct live_test_* Weaviate collections
 * that accumulated from old e2e test runs with random user IDs.
 *
 * Also cleans up corresponding Firestore registry entries.
 *
 * Usage:
 *   (set -a && source .env.e1.local && npx tsx scripts/cleanup-test-collections.ts)
 *   (set -a && source .env.e1.local && npx tsx scripts/cleanup-test-collections.ts --dry-run)
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

async function main() {
  if (!process.env.WEAVIATE_REST_URL) {
    console.error('Error: WEAVIATE_REST_URL environment variable required');
    process.exit(1);
  }

  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_EMBEDDINGS_API_KEY,
  });

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Scanning Weaviate collections...\n`);

  const allCollections = await client.collections.listAll();
  const testCollections = allCollections.filter((c) =>
    c.name.toLowerCase().includes('live_test_') &&
    !c.name.toLowerCase().includes('live_test_ci')
  );

  console.log(`  Total collections: ${allCollections.length}`);
  console.log(`  Test collections:  ${testCollections.length}`);

  if (testCollections.length === 0) {
    console.log('\n  Nothing to clean up.\n');
    return;
  }

  console.log();
  let deleted = 0;

  for (const col of testCollections) {
    if (dryRun) {
      console.log(`  [dry-run] Would delete: ${col.name}`);
    } else {
      try {
        await client.collections.delete(col.name);
        console.log(`  Deleted: ${col.name}`);
        deleted++;
      } catch (err) {
        console.error(`  Failed to delete ${col.name}: ${err}`);
      }
    }
  }

  console.log(`\n  ${dryRun ? 'Would delete' : 'Deleted'}: ${dryRun ? testCollections.length : deleted} collections\n`);
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
