#!/usr/bin/env tsx
/**
 * Process reviewed duplicate groups and deduplicate memories.
 *
 * Usage:
 *   npx tsx scripts/deduplicate.ts <review-file.json> [options]
 *
 * Options:
 *   --dry-run    Show what would be deleted without actually deleting
 *   --no-confirm Skip confirmation prompt
 *
 * Example:
 *   npx tsx scripts/deduplicate.ts duplicates-review.json --dry-run
 *   npx tsx scripts/deduplicate.ts duplicates-review.json
 */

import { getWeaviateClient } from '../src/database/weaviate/client.js';
import { createLogger } from '../src/utils/logger.js';
import { readFileSync } from 'fs';
import { createInterface } from 'readline';

// ─── Types ───────────────────────────────────────────────────────────────

interface ReviewEntry {
  group_id: string;
  primary_id: string;
  duplicate_ids: string[];
  similarity: number;
  reasons: string[];
  memories: Array<{
    id: string;
    content: string;
    tags: string[];
    weight: number;
    created_at: string;
    updated_at: string;
    content_type?: string;
  }>;
  action?: 'merge' | 'skip';
  notes?: string;
}

interface ReviewFile {
  scan_date: string;
  collection_id: string;
  total_memories_scanned: number;
  duplicate_groups_found: number;
  groups: ReviewEntry[];
}

interface DeduplicationStats {
  groups_processed: number;
  groups_skipped: number;
  memories_deleted: number;
  memories_kept: number;
  errors: Array<{ group_id: string; error: string }>;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Process reviewed duplicate groups and deduplicate memories.

Usage:
  npx tsx scripts/deduplicate.ts <review-file.json> [options]

Options:
  --dry-run    Show what would be deleted without actually deleting
  --no-confirm Skip confirmation prompt

Example:
  npx tsx scripts/deduplicate.ts duplicates-review.json --dry-run
  npx tsx scripts/deduplicate.ts duplicates-review.json
`);
    process.exit(0);
  }

  const reviewFile = args[0];
  const dryRun = args.includes('--dry-run');
  const noConfirm = args.includes('--no-confirm');

  console.log('🗑️  Deduplication Script');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Review file:    ${reviewFile}`);
  if (dryRun) console.log('Mode:           DRY RUN (no changes will be made)');
  console.log();

  // Read review file
  let review: ReviewFile;
  try {
    const content = readFileSync(reviewFile, 'utf-8');
    review = JSON.parse(content);
  } catch (err: any) {
    console.error('❌ Failed to read review file:', err.message);
    process.exit(1);
  }

  // Filter groups marked for merge
  const toMerge = review.groups.filter((g) => g.action === 'merge');

  if (toMerge.length === 0) {
    console.log('⚠️  No groups marked with "action": "merge"');
    console.log('   Edit the review file and set action to "merge" for groups to process');
    process.exit(0);
  }

  console.log('📊 Review Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Collection:      ${review.collection_id}`);
  console.log(`Total groups:    ${review.groups.length}`);
  console.log(`Marked for merge: ${toMerge.length}`);
  console.log(
    `Memories to delete: ${toMerge.reduce((sum, g) => sum + g.duplicate_ids.length, 0)}`
  );
  console.log();

  // Show groups to process
  console.log('Groups to process:');
  for (const group of toMerge) {
    console.log(`  • ${group.group_id}: ${group.duplicate_ids.length} duplicates`);
    console.log(`    Primary: ${group.primary_id}`);
    console.log(`    Similarity: ${(group.similarity * 100).toFixed(1)}%`);
    if (group.notes) console.log(`    Notes: ${group.notes}`);
  }
  console.log();

  // Confirm unless --no-confirm
  if (!noConfirm && !dryRun) {
    const answer = await prompt('Proceed with deduplication? (yes/no): ');
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Cancelled');
      process.exit(0);
    }
    console.log();
  }

  // Initialize Weaviate
  const client = await getWeaviateClient({
    host: process.env.WEAVIATE_HOST || 'localhost',
    port: parseInt(process.env.WEAVIATE_PORT || '8080', 10),
    scheme: (process.env.WEAVIATE_SCHEME as 'http' | 'https') || 'http',
  });

  const collection = client.collections.get(review.collection_id);

  const stats: DeduplicationStats = {
    groups_processed: 0,
    groups_skipped: 0,
    memories_deleted: 0,
    memories_kept: toMerge.length,
    errors: [],
  };

  console.log('🔧 Processing duplicates...\n');

  for (const group of toMerge) {
    try {
      console.log(`Processing ${group.group_id}...`);
      console.log(`  Keep: ${group.primary_id}`);

      for (const dupId of group.duplicate_ids) {
        console.log(`  Delete: ${dupId}`);

        if (!dryRun) {
          await collection.data.deleteById(dupId);
        }

        stats.memories_deleted++;
      }

      stats.groups_processed++;
      console.log(`  ✓ Done\n`);
    } catch (err: any) {
      console.log(`  ❌ Error: ${err.message}\n`);
      stats.errors.push({
        group_id: group.group_id,
        error: err.message,
      });
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ Deduplication Complete');
  console.log();
  console.log('Statistics:');
  console.log(`  Groups processed: ${stats.groups_processed}`);
  console.log(`  Groups skipped:   ${stats.groups_skipped}`);
  console.log(`  Memories deleted: ${stats.memories_deleted}`);
  console.log(`  Memories kept:    ${stats.memories_kept}`);

  if (stats.errors.length > 0) {
    console.log(`  Errors:           ${stats.errors.length}`);
    console.log();
    console.log('Errors:');
    for (const err of stats.errors) {
      console.log(`  • ${err.group_id}: ${err.error}`);
    }
  }

  if (dryRun) {
    console.log();
    console.log('ℹ️  DRY RUN - No changes were made');
    console.log('   Remove --dry-run to apply changes');
  }

  console.log();
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
