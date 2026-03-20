#!/usr/bin/env node
/**
 * Set trust_score to 1 (Public) for every memory in a single collection.
 *
 * Usage:
 *   (set -a && source .env.prod.local && npx tsx scripts/set-trust-level-1.ts)
 *   (set -a && source .env.prod.local && npx tsx scripts/set-trust-level-1.ts --dry-run)
 *   (set -a && source .env.prod.local && npx tsx scripts/set-trust-level-1.ts Memory_users_otherUserId)
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';

const COLLECTION = process.argv.find(a => a.startsWith('Memory_'))
  || 'Memory_users_geTmbcAMyhYUyeIfQj0ZRFmorhA2';
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 100;
const TARGET_TRUST = 1;

function renderProgress(scanned: number, total: number, updated: number, skipped: number, errors: number) {
  const pct = total > 0 ? Math.min(100, (scanned / total) * 100) : 0;
  const barWidth = 30;
  const filled = Math.round(barWidth * pct / 100);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  const line = `  ${bar} ${pct.toFixed(1).padStart(5)}%  ${scanned}/${total}  ` +
    `updated: ${updated}  skipped: ${skipped}  errors: ${errors}`;
  process.stdout.write(`\r${line}`);
}

async function main() {
  console.log(`=== Set trust_score → ${TARGET_TRUST} (Public) ===${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Collection: ${COLLECTION}\n`);

  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_EMBEDDINGS_API_KEY ?? process.env.OPENAI_API_KEY,
  });

  const collection = client.collections.get(COLLECTION);

  // Get total count first
  const aggregate = await collection.aggregate.overAll();
  const total = aggregate.totalCount ?? 0;
  console.log(`Total documents: ${total}\n`);

  if (total === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  let scanned = 0;
  let updated = 0;
  let alreadyCorrect = 0;
  let errors = 0;
  let afterCursor: string | undefined = undefined;

  renderProgress(scanned, total, updated, alreadyCorrect, errors);

  while (true) {
    const results = await collection.query.fetchObjects({
      limit: BATCH_SIZE,
      ...(afterCursor ? { after: afterCursor } : {}),
      returnProperties: ['trust_score', 'doc_type'],
    });

    if (results.objects.length === 0) break;

    afterCursor = results.objects[results.objects.length - 1].uuid;

    for (const obj of results.objects) {
      scanned++;
      const current = obj.properties.trust_score as number | undefined | null;

      if (current === TARGET_TRUST) {
        alreadyCorrect++;
        renderProgress(scanned, total, updated, alreadyCorrect, errors);
        continue;
      }

      if (DRY_RUN) {
        updated++;
        renderProgress(scanned, total, updated, alreadyCorrect, errors);
        continue;
      }

      try {
        await collection.data.update({
          id: obj.uuid,
          properties: { trust_score: TARGET_TRUST },
        });
        updated++;
      } catch (e: any) {
        errors++;
      }

      renderProgress(scanned, total, updated, alreadyCorrect, errors);
    }

    if (results.objects.length < BATCH_SIZE) break;
  }

  // Clear progress line and print final summary
  process.stdout.write('\n\n');
  console.log(`=== Done ===`);
  console.log(`  Scanned:         ${scanned}`);
  console.log(`  Updated → ${TARGET_TRUST}:     ${updated}`);
  console.log(`  Already correct: ${alreadyCorrect}`);
  console.log(`  Errors:          ${errors}`);
  if (DRY_RUN) console.log(`\n📝 Dry run — no data was modified.`);

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
