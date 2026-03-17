import { initWeaviateClient } from '../src/database/weaviate/client.js';

async function check() {
  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  const collection = client.collections.get('Memory_users_geTmbcAMyhYUyeIfQj0ZRFmorhA2');
  const config = await collection.config.get();
  const followUpProps = config.properties.filter((p: any) => p.name.startsWith('follow_up'));
  console.log('follow_up properties in schema:');
  for (const p of followUpProps) {
    console.log(`  ${p.name}: ${p.dataType}`);
  }
  console.log(`\nTotal properties: ${config.properties.length}`);
  console.log(`\ninvertedIndex config:`, JSON.stringify(config.invertedIndex, null, 2));
  
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
