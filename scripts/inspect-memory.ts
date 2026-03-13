#!/usr/bin/env node
/**
 * Inspect a memory object in Weaviate by UUID.
 * Usage: set -a && source .env.prod.local && set +a && \
 *   ENVIRONMENT=production node --import tsx/esm scripts/inspect-memory.ts <memoryUuid>
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';
import { fetchMemoryWithAllProperties } from '../src/database/weaviate/client.js';
import { initFirestore, getDocument } from '../src/database/firestore/init.js';
import { getMemoryIndexPath } from '../src/database/firestore/paths.js';

const memoryUuid = process.argv[2];
if (!memoryUuid) {
  console.error('Usage: node --import tsx/esm scripts/inspect-memory.ts <memoryUuid>');
  process.exit(1);
}

async function inspect() {
  // 0. Init Firestore
  initFirestore({
    serviceAccount: process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY!,
    projectId: process.env.FIREBASE_PROJECT_ID!,
  });

  // 1. Look up collection from memory index
  const indexPath = getMemoryIndexPath();
  const indexDoc = await getDocument(indexPath, memoryUuid);
  if (!indexDoc) {
    console.error(`❌ Memory ${memoryUuid} not found in memory index.`);
    process.exit(1);
  }

  const collectionName = (indexDoc as any).collection_name;
  console.log(`Memory index → collection: ${collectionName}`);

  // 2. Connect to Weaviate and fetch the memory
  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  const collection = client.collections.get(collectionName);
  const obj = await fetchMemoryWithAllProperties(collection, memoryUuid);

  if (!obj) {
    console.error(`❌ Memory ${memoryUuid} not found in Weaviate collection ${collectionName}.`);
    process.exit(1);
  }

  const props = obj.properties as Record<string, unknown>;

  console.log(`\n✅ Memory ${memoryUuid} found in ${collectionName}:\n`);
  console.log(`  user_id:        ${props.user_id ?? '(null)'}`);
  console.log(`  author_id:      ${props.author_id ?? '(null)'}`);
  console.log(`  doc_type:       ${props.doc_type}`);
  console.log(`  content_type:   ${props.content_type ?? props.type}`);
  console.log(`  title:          ${props.title ?? '(null)'}`);
  console.log(`  trust_score:    ${props.trust_score ?? props.trust}`);
  console.log(`  rating_sum:     ${props.rating_sum ?? 0}`);
  console.log(`  rating_count:   ${props.rating_count ?? 0}`);
  console.log(`  rating_bayesian:${props.rating_bayesian ?? '(null)'}`);
  console.log(`  created_at:     ${props.created_at}`);
  console.log(`  updated_at:     ${props.updated_at}`);
  console.log(`  follow_up_at:   ${props.follow_up_at ?? '(null)'} (legacy text)`);
  console.log(`  follow_up_date: ${props.follow_up_date ?? '(null)'}`);
  console.log(`  follow_up_notified_at: ${props.follow_up_notified_at ?? '(null)'}`);
  console.log(`  follow_up_failure_count: ${props.follow_up_failure_count ?? '(null)'}`);
  console.log(`  follow_up_targets: ${JSON.stringify(props.follow_up_targets ?? null)}`);
  console.log(`\nCollection owner (from name): ${collectionName.replace('Memory_users_', '')}`);
  console.log(`Stored user_id:               ${props.user_id}`);

  const collectionOwner = collectionName.replace('Memory_users_', '');
  if (props.user_id !== collectionOwner) {
    console.log(`\n⚠️  MISMATCH: user_id "${props.user_id}" ≠ collection owner "${collectionOwner}"`);
  } else {
    console.log(`\n✅ user_id matches collection owner.`);
  }

  // Close connection
  process.exit(0);
}

inspect().catch((err) => {
  console.error(err);
  process.exit(1);
});
