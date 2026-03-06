#!/usr/bin/env node
/**
 * Look up a memory UUID in the memory index.
 * Usage: ENVIRONMENT=production node --import tsx/esm scripts/lookup-memory-index.ts <memoryUuid>
 */

import { getDocument } from '../src/database/firestore/init.js';
import { getMemoryIndexPath } from '../src/database/firestore/paths.js';

const memoryUuid = process.argv[2];
if (!memoryUuid) {
  console.error('Usage: node --import tsx/esm scripts/lookup-memory-index.ts <memoryUuid>');
  process.exit(1);
}

async function lookup() {
  const path = getMemoryIndexPath();
  console.log(`Looking up memory index at: ${path}/${memoryUuid}`);

  const doc = await getDocument(path, memoryUuid);
  if (!doc) {
    console.log(`\n❌ Memory ${memoryUuid} NOT found in index.`);
    process.exit(1);
  }

  console.log(`\n✅ Memory ${memoryUuid} found:`);
  console.log(JSON.stringify(doc, null, 2));
}

lookup().catch(console.error);
