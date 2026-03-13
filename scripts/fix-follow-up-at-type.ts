#!/usr/bin/env node
/**
 * Add follow_up_date (date type) property to all Memory_* collections.
 * The old follow_up_at (text type) remains but is unused.
 *
 * Usage: set -a && source .env.prod.local && set +a && \
 *   ENVIRONMENT=production node --import tsx/esm scripts/fix-follow-up-at-type.ts
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';

async function fix() {
  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  const allCollections = await client.collections.listAll();
  const memoryCollections = allCollections.filter((c: any) => c.name.startsWith('Memory_'));

  console.log(`Found ${memoryCollections.length} Memory_* collections.\n`);

  let added = 0;
  let skipped = 0;

  for (const colInfo of memoryCollections) {
    const collection = client.collections.get(colInfo.name);
    const config = await collection.config.get();

    const existing = config.properties.find((p: any) => p.name === 'follow_up_date');

    if (existing) {
      skipped++;
      continue;
    }

    console.log(`${colInfo.name}: adding follow_up_date (date)...`);
    await collection.config.addProperty({ name: 'follow_up_date', dataType: 'date' });
    console.log(`  ✅ Added.`);
    added++;
  }

  console.log(`\nDone. Added: ${added}, Skipped (already exists): ${skipped}`);
  process.exit(0);
}

fix().catch((err) => {
  console.error(err);
  process.exit(1);
});
