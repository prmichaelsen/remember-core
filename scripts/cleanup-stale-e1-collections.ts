/**
 * One-time cleanup script: removes stale live_test_* collection registry entries
 * from E1 Firestore that accumulated from E2E test runs with random user IDs.
 *
 * Usage: ENVIRONMENT=e1 npx tsx scripts/cleanup-stale-e1-collections.ts
 */

import { queryDocuments, deleteDocument } from '../src/database/firestore/init.js';
import { getCollectionRegistryPath } from '../src/database/firestore/paths.js';

async function main() {
  const path = getCollectionRegistryPath();
  console.log(`Registry path: ${path}`);

  // Fetch all entries
  const entries = await queryDocuments(path, {
    orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
    limit: 1000,
  });

  console.log(`Total registry entries: ${entries.length}`);

  const stale = entries.filter((e) => {
    const name = e.id;
    // Match live_test_<random> patterns but NOT live_test_ci (the new fixed IDs)
    // Also match e1_test_user (stale dev/test collection)
    return (name.includes('live_test_') && !name.includes('live_test_ci'))
      || name.includes('e1_test_user');
  });

  console.log(`Stale live_test_* entries to remove: ${stale.length}`);

  if (stale.length === 0) {
    console.log('Nothing to clean up.');
    return;
  }

  for (const entry of stale) {
    await deleteDocument(path, entry.id);
    console.log(`  Deleted: ${entry.id}`);
  }

  console.log(`Done. Removed ${stale.length} stale entries.`);
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
