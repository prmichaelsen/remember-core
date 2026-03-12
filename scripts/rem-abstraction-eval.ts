/**
 * REM Abstraction Evaluation Script
 *
 * Evaluates the abstraction pipeline against real relationship clusters:
 *   1. Fetch relationships and their member memories from Weaviate
 *   2. Check which clusters qualify for abstraction (size + similarity)
 *   3. Identify already-abstracted clusters
 *   4. Optionally preview LLM-generated abstractions with --preview
 *
 * Usage:
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-abstraction-eval.ts)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-abstraction-eval.ts --min-size 3 --similarity 0.7)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-abstraction-eval.ts --preview)
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';
import {
  detectAbstractionCandidates,
  buildAbstractionPrompt,
  DEFAULT_ABSTRACTION_CONFIG,
  type AbstractionConfig,
} from '../src/services/rem.abstraction.js';
import { createHaikuClient } from '../src/services/rem.haiku.js';

// ─── Config ──────────────────────────────────────────────────────────────

interface AbstractionEvalConfig {
  userId: string;
  collectionType: string;
  minSize: number;
  similarity: number;
  limit: number;
  preview: boolean;
  model?: string;
}

function parseConfig(): AbstractionEvalConfig {
  const args = process.argv.slice(2);

  if (args[0] === '--help') {
    console.log(`
REM Abstraction Evaluation — evaluate which clusters qualify for abstraction.

Usage:
  npx tsx scripts/rem-abstraction-eval.ts [user_id] [options]

Options:
  --collection-type <type>  Collection type (default: users)
  --min-size <n>            Min cluster size for abstraction (default: 5)
  --similarity <n>          Min avg similarity for abstraction (default: 0.8)
  --limit <n>               Max relationships to evaluate (default: 50)
  --preview                 Generate abstractions via LLM
  --model <model>           Anthropic model for --preview
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
    minSize: parseInt(getArg('--min-size') ?? String(DEFAULT_ABSTRACTION_CONFIG.min_cluster_size), 10),
    similarity: parseFloat(getArg('--similarity') ?? String(DEFAULT_ABSTRACTION_CONFIG.similarity_threshold)),
    limit: parseInt(getArg('--limit') ?? '50', 10),
    preview: args.includes('--preview'),
    model: getArg('--model'),
  };
}

// ─── Types ───────────────────────────────────────────────────────────────

interface ClusterEval {
  relationshipId: string;
  relationshipType: string;
  observation: string;
  memberCount: number;
  avgSimilarity: number;
  members: Array<{ id: string; content: string }>;
  category: 'qualifies' | 'too-small' | 'too-dissimilar' | 'already-abstracted';
  reason?: string;
  previewContent?: string;
  previewType?: string;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function run() {
  const config = parseConfig();

  if (!process.env.WEAVIATE_REST_URL) {
    console.error('Error: WEAVIATE_REST_URL environment variable required');
    process.exit(1);
  }

  if (config.preview && !process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY required for --preview');
    process.exit(1);
  }

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  REM Abstraction Evaluation — Cluster Analysis      ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`  User:       ${config.userId}`);
  console.log(`  Collection: Memory_${config.collectionType}_${config.userId}`);
  console.log(`  Min size:   ${config.minSize}`);
  console.log(`  Similarity: ${config.similarity}`);
  console.log(`  Limit:      ${config.limit}`);
  console.log(`  Preview:    ${config.preview}\n`);

  // Connect to Weaviate
  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_EMBEDDINGS_API_KEY,
  });

  const collectionId = `Memory_${config.collectionType}_${config.userId}`;
  const collection = client.collections.get(collectionId);

  // Fetch relationships
  console.log(`  Fetching relationships...`);
  const relResult = await collection.query.fetchObjects({
    filters: collection.filter.byProperty('doc_type').equal('relationship'),
    limit: config.limit,
    returnProperties: [
      'related_memory_ids', 'relationship_type', 'observation',
      'strength', 'confidence', 'source', 'tags',
    ],
  });

  const relationships = relResult.objects ?? [];
  if (relationships.length === 0) {
    console.error('  No relationships found');
    process.exit(1);
  }
  console.log(`  Found ${relationships.length} relationships`);

  // Fetch existing abstraction relationships to check already-abstracted
  const abstractionRels = await collection.query.fetchObjects({
    filters: collection.filter.byProperty('relationship_type').equal('abstraction'),
    limit: 200,
    returnProperties: ['related_memory_ids'],
  });

  const existingAbstractionSourceIds = new Set<string>();
  for (const rel of abstractionRels.objects ?? []) {
    const memIds: string[] = (rel.properties as any).related_memory_ids ?? [];
    for (const id of memIds) existingAbstractionSourceIds.add(id);
  }
  console.log(`  Existing abstraction source IDs: ${existingAbstractionSourceIds.size}`);

  // For each relationship, fetch member memories
  console.log(`  Fetching member memories...\n`);

  const clusterEvals: ClusterEval[] = [];

  for (const rel of relationships) {
    const relId = (rel as any).uuid ?? (rel as any).id;
    const props = rel.properties as any;
    const memoryIds: string[] = props.related_memory_ids ?? [];
    const relType = props.relationship_type ?? 'unknown';
    const obs = props.observation ?? '';
    const strength = props.strength ?? 0.5;

    // Skip abstraction relationships themselves
    if (relType === 'abstraction') continue;

    // Fetch each member memory
    const members: Array<{ id: string; content: string }> = [];
    for (const memId of memoryIds) {
      try {
        const memResult = await collection.query.fetchObjectById(memId, {
          returnProperties: ['content'],
        });
        if (memResult) {
          members.push({
            id: memId,
            content: (memResult.properties as any).content ?? '',
          });
        }
      } catch {
        // Memory may not exist
      }
    }

    // Determine category
    let category: ClusterEval['category'];
    let reason: string | undefined;

    const alreadyAbstracted = memoryIds.every(id => existingAbstractionSourceIds.has(id));

    if (alreadyAbstracted && memoryIds.length > 0) {
      category = 'already-abstracted';
      reason = 'all members already in abstraction';
    } else if (members.length < config.minSize) {
      category = 'too-small';
      reason = `${members.length} members < min ${config.minSize}`;
    } else if (strength < config.similarity) {
      category = 'too-dissimilar';
      reason = `strength ${strength.toFixed(2)} < threshold ${config.similarity}`;
    } else {
      category = 'qualifies';
    }

    clusterEvals.push({
      relationshipId: relId,
      relationshipType: relType,
      observation: obs,
      memberCount: members.length,
      avgSimilarity: strength,
      members,
      category,
      reason,
    });
  }

  // Preview abstractions if requested
  if (config.preview) {
    const qualifying = clusterEvals.filter((c) => c.category === 'qualifies');
    if (qualifying.length > 0 && process.env.ANTHROPIC_API_KEY) {
      const haikuClient = createHaikuClient({
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: config.model,
      });

      console.log(`  Generating abstractions for ${qualifying.length} qualifying clusters...\n`);

      // Use detectAbstractionCandidates to get proper candidates
      const abstractionConfig: AbstractionConfig = {
        min_cluster_size: config.minSize,
        similarity_threshold: config.similarity,
      };

      for (const cluster of qualifying) {
        const prompt = buildAbstractionPrompt({
          source_memory_ids: cluster.members.map((m) => m.id),
          source_contents: cluster.members.map((m) => m.content),
          emotional_summary: {},
        });

        try {
          // Use extractFeatures as a proxy for a raw LLM call
          // Since we need the actual synthesis, call the API directly
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY!,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: config.model ?? 'claude-sonnet-4-5-20250929',
              max_tokens: 512,
              messages: [{ role: 'user', content: prompt }],
            }),
          });

          const data = await response.json() as any;
          const text = data.content?.[0]?.text ?? '';
          const cleaned = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();

          try {
            const parsed = JSON.parse(cleaned);
            cluster.previewContent = parsed.content;
            cluster.previewType = parsed.abstraction_type;
          } catch {
            cluster.previewContent = text.slice(0, 200);
          }
        } catch (err) {
          cluster.previewContent = `[Error: ${err instanceof Error ? err.message : String(err)}]`;
        }
      }
    }
  }

  // ── Output ──
  printCategorySummary(clusterEvals, config);
  printClusterDetail(clusterEvals, config);
  printThresholdAnalysis(clusterEvals, config);
}

// ─── Output Helpers ──────────────────────────────────────────────────────

function printCategorySummary(clusters: ClusterEval[], config: AbstractionEvalConfig) {
  const counts = {
    qualifies: clusters.filter((c) => c.category === 'qualifies').length,
    'too-small': clusters.filter((c) => c.category === 'too-small').length,
    'too-dissimilar': clusters.filter((c) => c.category === 'too-dissimilar').length,
    'already-abstracted': clusters.filter((c) => c.category === 'already-abstracted').length,
  };

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Category Summary (${clusters.length} clusters evaluated)\n`);
  console.log(`    Qualifies:          ${counts.qualifies}`);
  console.log(`    Too small:          ${counts['too-small']} (< ${config.minSize} members)`);
  console.log(`    Too dissimilar:     ${counts['too-dissimilar']} (< ${config.similarity} similarity)`);
  console.log(`    Already abstracted: ${counts['already-abstracted']}`);
  console.log();
}

function printClusterDetail(clusters: ClusterEval[], config: AbstractionEvalConfig) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Cluster Detail\n`);

  const icons: Record<string, string> = {
    'qualifies': '+',
    'too-small': 'S',
    'too-dissimilar': 'D',
    'already-abstracted': 'A',
  };

  for (const c of clusters) {
    const icon = icons[c.category] ?? '?';
    console.log(`  [${icon}] ${c.relationshipType} | ${c.memberCount} members | sim=${c.avgSimilarity.toFixed(2)} | "${truncate(c.observation, 50)}"`);

    if (c.reason) {
      console.log(`      Reason: ${c.reason}`);
    }

    if (c.category === 'qualifies') {
      for (const mem of c.members.slice(0, 3)) {
        console.log(`      - "${truncate(mem.content, 60)}"`);
      }
      if (c.members.length > 3) {
        console.log(`      ... +${c.members.length - 3} more`);
      }
    }

    if (c.previewContent) {
      console.log(`      Preview [${c.previewType ?? 'unknown'}]: "${truncate(c.previewContent, 80)}"`);
    }

    console.log();
  }
}

function printThresholdAnalysis(clusters: ClusterEval[], config: AbstractionEvalConfig) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Threshold Analysis\n`);

  console.log(`  Min cluster size impact:`);
  for (const size of [2, 3, 4, 5, 6, 7, 8]) {
    const qualifying = clusters.filter((c) =>
      c.memberCount >= size && c.avgSimilarity >= config.similarity && c.category !== 'already-abstracted',
    ).length;
    const marker = size === config.minSize ? ' <-' : '';
    console.log(`    min_size=${size}: ${qualifying} clusters qualify${marker}`);
  }

  console.log(`\n  Similarity threshold impact:`);
  for (const sim of [0.5, 0.6, 0.7, 0.8, 0.9]) {
    const qualifying = clusters.filter((c) =>
      c.memberCount >= config.minSize && c.avgSimilarity >= sim && c.category !== 'already-abstracted',
    ).length;
    const marker = sim === config.similarity ? ' <-' : '';
    console.log(`    similarity=${sim.toFixed(1)}: ${qualifying} clusters qualify${marker}`);
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
