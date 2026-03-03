#!/usr/bin/env node
/**
 * List all collections from the Firestore collection registry.
 * Usage: ENVIRONMENT=production node --import tsx/esm scripts/list-collections.ts
 */

import { queryDocuments } from '../src/database/firestore/init.js';
import { getCollectionRegistryPath } from '../src/database/firestore/paths.js';

async function listCollections() {
  const path = getCollectionRegistryPath();
  console.log(`Querying collection registry at: ${path}`);

  const results = await queryDocuments(path, {
    orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
  });

  console.log(`\nFound ${results.length} collections:\n`);

  for (const doc of results) {
    const data = doc.data;
    console.log(`- ${data.collection_name}`);
    console.log(`  Type: ${data.collection_type}`);
    console.log(`  Owner: ${data.owner_id || 'N/A'}`);
    console.log(`  Created: ${data.created_at}`);
    console.log();
  }
}

listCollections().catch(console.error);
