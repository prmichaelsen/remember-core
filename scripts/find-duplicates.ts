#!/usr/bin/env tsx
/**
 * Find duplicate memories in a collection and output to review file.
 *
 * Usage:
 *   npx tsx scripts/find-duplicates.ts <user_id> [options]
 *
 * Options:
 *   --collection-type <type>   Collection type (default: users)
 *   --output <file>            Output file (default: duplicates-review.json)
 *   --threshold <number>       Embedding similarity threshold (default: 0.95)
 *   --fuzzy-threshold <number> Fuzzy similarity threshold (default: 0.90)
 *   --limit <number>           Max memories to scan (default: all)
 *
 * Example:
 *   npx tsx scripts/find-duplicates.ts user_abc123 --output my-duplicates.json
 */

import { config as loadEnv } from 'dotenv';
import { initWeaviateClient } from '../src/database/weaviate/client.js';
import { createLogger } from '../src/utils/logger.js';
import {
  findDuplicateCandidates,
  groupDuplicates,
  type DuplicateGroup,
  type Memory,
} from '../src/utils/duplicate-detection.js';
import { writeFileSync } from 'fs';

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
  // User fills this in during review
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

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Find duplicate memories in a collection and output to review file.

Usage:
  npx tsx scripts/find-duplicates.ts <user_id> [options]

Options:
  --collection-type <type>   Collection type (default: users)
  --output <file>            Output file (default: duplicates-review.json)
  --threshold <number>       Embedding similarity threshold (default: 0.95)
  --fuzzy-threshold <number> Fuzzy similarity threshold (default: 0.90)
  --limit <number>           Max memories to scan (default: all)

Example:
  npx tsx scripts/find-duplicates.ts user_abc123 --output my-duplicates.json
`);
    process.exit(0);
  }

  const userId = args[0];
  const collectionType = getArg(args, '--collection-type') || 'users';
  const outputFile = getArg(args, '--output') || 'duplicates-review.json';
  const threshold = parseFloat(getArg(args, '--threshold') || '0.95');
  const fuzzyThreshold = parseFloat(getArg(args, '--fuzzy-threshold') || '0.90');
  const limit = parseInt(getArg(args, '--limit') || '0', 10);

  // Load .env file (--env-file=path or default .env.prod.local)
  const envFileArg = args.find(a => a.startsWith('--env-file='));
  const envFile = envFileArg ? envFileArg.split('=')[1] : '.env.prod.local';
  loadEnv({ path: envFile });

  const logger = createLogger({ level: 'trace' });

  console.log('🔍 Finding Duplicates');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Collection:     Memory_${collectionType}_${userId}`);
  console.log(`Output file:    ${outputFile}`);
  console.log(`Embed threshold: ${threshold}`);
  console.log(`Fuzzy threshold: ${fuzzyThreshold}`);
  if (limit > 0) console.log(`Limit:          ${limit} memories`);
  console.log();

  // Initialize Weaviate
  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_EMBEDDINGS_API_KEY,
  });

  const collectionId = `Memory_${collectionType}_${userId}`;
  const collection = client.collections.get<Memory>(collectionId);

  console.log('📥 Fetching memories...');

  // Fetch all memories with embeddings (paginate — Weaviate defaults to 10)
  const allObjects: any[] = [];
  const pageSize = limit > 0 ? Math.min(limit, 100) : 100;
  let cursor: string | undefined;

  while (true) {
    const opts: any = { limit: pageSize, includeVector: true };
    if (cursor) opts.after = cursor;
    const page = await collection.query.fetchObjects(opts);
    if (!page.objects || page.objects.length === 0) break;
    allObjects.push(...page.objects);
    cursor = page.objects[page.objects.length - 1].uuid;
    if (limit > 0 && allObjects.length >= limit) {
      allObjects.splice(limit);
      break;
    }
    if (page.objects.length < pageSize) break;
  }

  // Filter to doc_type=memory only (skip relationships) and map fields
  const memories = allObjects
    .filter((obj) => !obj.properties.doc_type || obj.properties.doc_type === 'memory')
    .map((obj) => {
      // Weaviate v3 vector can be { default: number[] } or number[]
      let embedding: number[] | undefined;
      if (Array.isArray(obj.vectors?.default)) {
        embedding = obj.vectors.default;
      } else if (Array.isArray(obj.vector)) {
        embedding = obj.vector;
      }
      return {
        ...obj.properties,
        id: obj.uuid,
        embedding,
      };
    }) as Memory[];

  console.log(`✓ Fetched ${memories.length} memories (skipped ${allObjects.length - memories.length} non-memory objects)\n`);

  if (memories.length < 2) {
    console.log('⚠️  Need at least 2 memories to find duplicates');
    process.exit(0);
  }

  console.log('🔎 Analyzing for duplicates...');

  const candidates = findDuplicateCandidates(memories, {
    embeddingSimilarityThreshold: threshold,
    fuzzySimilarityThreshold: fuzzyThreshold,
  });

  console.log(`✓ Found ${candidates.length} duplicate pairs\n`);

  if (candidates.length === 0) {
    console.log('✨ No duplicates found!');
    process.exit(0);
  }

  console.log('🗂️  Grouping duplicates...');

  const groups = groupDuplicates(candidates);

  console.log(`✓ Grouped into ${groups.length} clusters\n`);

  // Build review file
  const reviewFile: ReviewFile = {
    scan_date: new Date().toISOString(),
    collection_id: collectionId,
    total_memories_scanned: memories.length,
    duplicate_groups_found: groups.length,
    groups: groups.map((group, index) => ({
      group_id: `group_${index + 1}`,
      primary_id: group.primary.id,
      duplicate_ids: group.memories
        .filter((m) => m.id !== group.primary.id)
        .map((m) => m.id),
      similarity: group.similarity,
      reasons: group.reasons,
      memories: group.memories.map((m) => ({
        id: m.id,
        content: m.content ?? '',
        tags: m.tags || [],
        weight: m.weight ?? 0,
        created_at: m.created_at ?? '',
        updated_at: m.updated_at ?? '',
        content_type: m.content_type,
      })),
      action: undefined,
      notes: undefined,
    })),
  };

  // Write to file
  writeFileSync(outputFile, JSON.stringify(reviewFile, null, 2), 'utf-8');

  console.log('📝 Review file created');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`File: ${outputFile}`);
  console.log(`Groups: ${groups.length}`);
  console.log(`Total duplicates: ${groups.reduce((sum, g) => sum + g.memories.length, 0)}`);
  console.log();
  console.log('Next steps:');
  console.log('1. Review each group in the JSON file');
  console.log('2. Set "action": "merge" for groups to deduplicate');
  console.log('3. Set "action": "skip" for false positives');
  console.log('4. Run: npx tsx scripts/deduplicate.ts ' + outputFile);
  console.log();
}

function getArg(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
