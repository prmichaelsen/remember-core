/**
 * REM Seed Evaluation Script
 *
 * Tests the random-seed REM flow against real data:
 *   1. Pick random seed memories from a Weaviate collection
 *   2. Find similar memories via nearObject vector search
 *   3. Evaluate each seed+similar group with the LLM
 *   4. Classify results as: relationship-worthy, duplicate, or unrelated
 *
 * Usage:
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-seed-eval.ts <user_id>)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-seed-eval.ts <user_id> --seeds 10)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-seed-eval.ts <user_id> --threshold 0.8)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-seed-eval.ts <user_id> --model claude-haiku-4-5-20251001)
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';
import { createHaikuClient, type ClusterEvalResult } from '../src/services/rem.haiku.js';

// ─── Config ──────────────────────────────────────────────────────────────

interface SeedEvalConfig {
  userId: string;
  collectionType: string;
  seedCount: number;
  similarLimit: number;
  similarityThreshold: number;   // For nearObject distance (1 - threshold)
  confidenceThreshold: number;   // Min confidence to accept as relationship
  duplicateThreshold: number;    // Similarity above this = likely duplicate
  model?: string;
}

function parseConfig(): SeedEvalConfig {
  const args = process.argv.slice(2);

  if (args[0] === '--help') {
    console.log(`
REM Seed Evaluation — test random-seed relationship discovery flow.

Usage:
  npx tsx scripts/rem-seed-eval.ts [user_id] [options]

Options:
  --collection-type <type>  Collection type (default: users)
  --seeds <n>               Number of random seeds (default: 5)
  --similar-limit <n>       Max similar memories per seed (default: 7)
  --similarity <n>          Vector similarity threshold 0-1 (default: 0.75)
  --confidence <n>          Min confidence for relationship (default: 0.5)
  --duplicate <n>           Similarity above this = duplicate (default: 0.95)
  --model <model>           Anthropic model to use
`);
    process.exit(0);
  }

  const userId = (args[0] && !args[0].startsWith('--')) ? args[0] : 'e1_test_user';

  function getArg(name: string): string | undefined {
    const idx = args.indexOf(name);
    return idx !== -1 ? args[idx + 1] : undefined;
  }

  return {
    userId,
    collectionType: getArg('--collection-type') ?? 'users',
    seedCount: parseInt(getArg('--seeds') ?? '5', 10),
    similarLimit: parseInt(getArg('--similar-limit') ?? '7', 10),
    similarityThreshold: parseFloat(getArg('--similarity') ?? '0.75'),
    confidenceThreshold: parseFloat(getArg('--confidence') ?? '0.5'),
    duplicateThreshold: parseFloat(getArg('--duplicate') ?? '0.95'),
    model: getArg('--model'),
  };
}

// ─── Types ───────────────────────────────────────────────────────────────

interface SeedResult {
  seed_id: string;
  seed_content: string;
  similar_count: number;
  avg_similarity: number;
  classification: 'relationship' | 'duplicate' | 'mixed' | 'unrelated';
  eval: ClusterEvalResult;
  similar_memories: Array<{
    id: string;
    content: string;
    similarity: number;
    is_duplicate: boolean;
  }>;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function run() {
  const config = parseConfig();

  // Validate env
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable required');
    process.exit(1);
  }
  if (!process.env.WEAVIATE_REST_URL) {
    console.error('Error: WEAVIATE_REST_URL environment variable required');
    process.exit(1);
  }

  const modelName = config.model ?? 'claude-sonnet-4-5-20250929 (default)';

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  REM Seed Evaluation — Random Seed Flow Testing     ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`  Model:      ${modelName}`);
  console.log(`  User:       ${config.userId}`);
  console.log(`  Collection: Memory_${config.collectionType}_${config.userId}`);
  console.log(`  Seeds:      ${config.seedCount}`);
  console.log(`  Similarity: ${config.similarityThreshold}`);
  console.log(`  Confidence: ${config.confidenceThreshold}`);
  console.log(`  Duplicate:  ${config.duplicateThreshold}\n`);

  // Connect to Weaviate
  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_EMBEDDINGS_API_KEY,
  });

  const collectionId = `Memory_${config.collectionType}_${config.userId}`;
  const collection = client.collections.get(collectionId);

  // Create LLM client
  const haikuClient = createHaikuClient({ apiKey, model: config.model });

  // Pick random seeds
  console.log(`  Fetching ${config.seedCount} random seed memories...`);
  const randomOffset = Math.floor(Math.random() * 50);
  const seedsResult = await collection.query.fetchObjects({
    filters: collection.filter.byProperty('doc_type').equal('memory'),
    limit: config.seedCount,
    offset: randomOffset,
    returnProperties: ['content', 'created_at', 'tags', 'doc_type'],
  });

  const seeds = seedsResult.objects ?? [];
  if (seeds.length === 0) {
    console.error('  No memories found in collection');
    process.exit(1);
  }
  console.log(`  Found ${seeds.length} seeds (offset: ${randomOffset})\n`);

  // Process each seed
  const results: SeedResult[] = [];
  const distance = 1 - config.similarityThreshold;

  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    const seedId = seed.uuid ?? (seed as any).id;
    const seedContent = (seed.properties as any).content ?? '';
    const seedTags = (seed.properties as any).tags ?? [];

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Seed ${i + 1}/${seeds.length}: ${seedId}`);
    console.log(`  Content: "${truncate(seedContent, 100)}"`);
    console.log(`  Tags: [${seedTags.join(', ')}]`);

    // Find similar via nearObject
    const res = await collection.query.nearObject(seedId, {
      limit: config.similarLimit + 1,
      distance,
      returnMetadata: ['distance'],
      returnProperties: ['content', 'created_at', 'tags', 'doc_type'],
      filters: collection.filter.byProperty('doc_type').equal('memory'),
    });

    const similar = (res.objects ?? []).filter(
      (o: any) => (o.uuid ?? o.id) !== seedId,
    );

    if (similar.length === 0) {
      console.log(`  No similar memories found (distance < ${distance})\n`);
      continue;
    }

    console.log(`  Similar: ${similar.length} memories found`);

    // Check for duplicates (very high similarity)
    const similarMemories = similar.map((obj: any) => {
      const sim = 1 - (obj.metadata?.distance ?? 0);
      return {
        id: obj.uuid ?? obj.id,
        content: obj.properties.content ?? '',
        similarity: sim,
        is_duplicate: sim >= config.duplicateThreshold,
      };
    });

    const duplicates = similarMemories.filter((m) => m.is_duplicate);
    const avgSimilarity = similarMemories.reduce((s, m) => s + m.similarity, 0) / similarMemories.length;

    if (duplicates.length > 0) {
      console.log(`  ⚠ ${duplicates.length} potential duplicate(s) (similarity >= ${config.duplicateThreshold}):`);
      for (const dup of duplicates) {
        console.log(`    ${dup.similarity.toFixed(3)} "${truncate(dup.content, 80)}"`);
      }
    }

    // Evaluate cluster with LLM
    const memories = [
      { id: seedId, content: seedContent, tags: seedTags },
      ...similarMemories.map((m) => ({
        id: m.id,
        content: m.content,
        tags: [] as string[],
      })),
    ];

    process.stdout.write(`  Evaluating cluster (${memories.length} memories)... `);
    const evalResult = await haikuClient.evaluateCluster({ memories });

    const classification = classifyResult(evalResult, duplicates.length, config);
    console.log(`${classification.toUpperCase()} (confidence: ${evalResult.confidence.toFixed(2)})`);
    console.log(`  Reasoning: ${evalResult.reasoning}`);
    console.log(`  Type: ${evalResult.relationship_type}, Observation: "${evalResult.observation}"`);

    if (evalResult.sub_clusters?.length) {
      console.log(`  Sub-clusters: ${evalResult.sub_clusters.length}`);
      for (const sc of evalResult.sub_clusters) {
        console.log(`    - ${sc.observation} (conf: ${sc.confidence.toFixed(2)}, ${sc.memory_ids.length} memories)`);
      }
    }
    console.log();

    results.push({
      seed_id: seedId,
      seed_content: seedContent,
      similar_count: similar.length,
      avg_similarity: avgSimilarity,
      classification,
      eval: evalResult,
      similar_memories: similarMemories,
    });
  }

  // ── Summary ──
  printSummary(results, config);
}

function classifyResult(
  evalResult: ClusterEvalResult,
  duplicateCount: number,
  config: SeedEvalConfig,
): SeedResult['classification'] {
  if (duplicateCount > 0 && evalResult.confidence >= config.confidenceThreshold) {
    return 'mixed'; // Has both duplicates and relationship-worthy content
  }
  if (duplicateCount > 0) {
    return 'duplicate';
  }
  if (evalResult.confidence >= config.confidenceThreshold) {
    return 'relationship';
  }
  return 'unrelated';
}

function printSummary(results: SeedResult[], config: SeedEvalConfig) {
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  Summary                                             ║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);

  const counts = {
    relationship: results.filter((r) => r.classification === 'relationship').length,
    duplicate: results.filter((r) => r.classification === 'duplicate').length,
    mixed: results.filter((r) => r.classification === 'mixed').length,
    unrelated: results.filter((r) => r.classification === 'unrelated').length,
  };

  console.log(`  Seeds evaluated:  ${results.length}`);
  console.log(`  Relationships:    ${counts.relationship}`);
  console.log(`  Duplicates:       ${counts.duplicate}`);
  console.log(`  Mixed:            ${counts.mixed}`);
  console.log(`  Unrelated:        ${counts.unrelated}`);

  if (results.length > 0) {
    const avgConf = results.reduce((s, r) => s + r.eval.confidence, 0) / results.length;
    const avgSim = results.reduce((s, r) => s + r.avg_similarity, 0) / results.length;
    console.log(`  Avg confidence:   ${avgConf.toFixed(2)}`);
    console.log(`  Avg similarity:   ${avgSim.toFixed(3)}`);
  }

  // Threshold analysis
  console.log(`\n  Confidence threshold analysis:`);
  const thresholds = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  for (const t of thresholds) {
    const accepted = results.filter((r) => r.eval.confidence >= t);
    const marker = t === config.confidenceThreshold ? ' ←' : '';
    console.log(`    threshold=${t.toFixed(1)}: ${accepted.length}/${results.length} would form relationships${marker}`);
  }

  // Per-seed table
  console.log(`\n  Per-seed results:`);
  for (const r of results) {
    const icon = r.classification === 'relationship' ? '✓'
      : r.classification === 'duplicate' ? '⚠'
        : r.classification === 'mixed' ? '◐'
          : '✗';
    const dups = r.similar_memories.filter((m) => m.is_duplicate).length;
    const dupLabel = dups > 0 ? ` [${dups} dup]` : '';
    console.log(
      `    ${icon} conf=${r.eval.confidence.toFixed(2)} sim=${r.avg_similarity.toFixed(3)} ` +
      `similar=${r.similar_count} ${r.classification.padEnd(12)}${dupLabel} "${truncate(r.seed_content, 50)}"`,
    );
  }

  console.log();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
