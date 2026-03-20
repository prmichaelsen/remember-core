#!/usr/bin/env node
import { initWeaviateClient } from '../src/database/weaviate/client.js';

const COLLECTION = process.argv[2] || 'Memory_users_geTmbcAMyhYUyeIfQj0ZRFmorhA2';
const SAMPLE_SIZE = parseInt(process.argv[3] || '50', 10);

async function main() {
  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  const collection = client.collections.get(COLLECTION);

  console.log(`\nSpot-checking trust levels in: ${COLLECTION}`);
  console.log(`Sample size: ${SAMPLE_SIZE}\n`);

  // Fetch a sample of memories with trust-related fields
  const result = await collection.query.fetchObjects({
    limit: SAMPLE_SIZE,
    returnProperties: [
      'title',
      'content_type',
      'trust_score',
      'trust',
      'created_at',
      'deleted_at',
    ],
  });

  if (!result.objects.length) {
    console.log('No memories found in collection.');
    process.exit(0);
  }

  // Bucket by trust_score
  const buckets: Record<string, number> = {};
  const examples: Record<string, { uuid: string; title: string; trust: unknown; content_type: string }[]> = {};
  let missingTrustScore = 0;
  let hasLegacyTrust = 0;
  let deletedCount = 0;

  for (const obj of result.objects) {
    const props = obj.properties as Record<string, unknown>;
    const trustScore = props.trust_score;
    const legacyTrust = props.trust;
    const deleted = props.deleted_at;

    if (deleted) {
      deletedCount++;
    }

    const key = trustScore != null ? String(trustScore) : 'NULL';
    buckets[key] = (buckets[key] || 0) + 1;

    if (trustScore == null) missingTrustScore++;
    if (legacyTrust != null && legacyTrust !== 0) hasLegacyTrust++;

    // Keep up to 3 examples per bucket
    if (!examples[key]) examples[key] = [];
    if (examples[key].length < 3) {
      examples[key].push({
        uuid: obj.uuid,
        title: (props.title as string) || '(untitled)',
        trust: legacyTrust,
        content_type: (props.content_type as string) || '?',
      });
    }
  }

  // Summary
  console.log('=== Trust Level Distribution ===\n');
  const sortedKeys = Object.keys(buckets).sort((a, b) => {
    if (a === 'NULL') return 1;
    if (b === 'NULL') return -1;
    return Number(a) - Number(b);
  });

  for (const key of sortedKeys) {
    const label = key === 'NULL' ? 'NULL (missing)' : `Level ${key}`;
    const count = buckets[key];
    const pct = ((count / result.objects.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.ceil(count / result.objects.length * 30));
    console.log(`  ${label.padEnd(16)} ${String(count).padStart(4)} (${pct.padStart(5)}%)  ${bar}`);

    // Show examples
    for (const ex of examples[key]) {
      console.log(`    → ${ex.uuid.substring(0, 8)}… "${ex.title.substring(0, 40)}" [${ex.content_type}] legacy_trust=${ex.trust}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Total sampled:      ${result.objects.length}`);
  console.log(`  Missing trust_score: ${missingTrustScore}`);
  console.log(`  Has legacy trust:    ${hasLegacyTrust}`);
  console.log(`  Soft-deleted:        ${deletedCount}`);

  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
