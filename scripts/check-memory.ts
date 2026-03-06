#!/usr/bin/env node
import { initWeaviateClient, fetchMemoryWithAllProperties } from '../src/database/weaviate/client.js';

async function main() {
  const uuid = process.argv[2];
  const collectionName = process.argv[3];
  if (!uuid || !collectionName) {
    console.error('Usage: node --import tsx/esm scripts/check-memory.ts <uuid> <collectionName>');
    process.exit(1);
  }

  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  const collection = client.collections.get(collectionName);
  const obj = await fetchMemoryWithAllProperties(collection, uuid);
  if (!obj) {
    console.log('Not found in', collectionName);
    process.exit(1);
  }
  const props = obj.properties as Record<string, unknown>;
  console.log(JSON.stringify(props, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
