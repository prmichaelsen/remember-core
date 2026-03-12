/**
 * REM Curation & PageRank Evaluation Script
 *
 * Evaluates the curation scoring pipeline against real Weaviate data:
 *   1. Fetch memories with properties needed for all 6 sub-scores
 *   2. Fetch relationships to build the PageRank graph
 *   3. Compute all sub-scores + composite for each memory
 *   4. Display per-memory breakdown, rankings, and distribution
 *   5. Optional: compare custom weight overrides vs defaults
 *
 * Usage:
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-curation-eval.ts)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-curation-eval.ts e1_test_user --limit 50)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-curation-eval.ts --w-editorial 0.5 --w-centrality 0.1)
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';
import {
  recencyScore,
  normalizedRating,
  engagementScore,
  clusterQualityScore,
  normalizedEditorial,
  pageRank,
  CURATED_WEIGHTS,
  type RelationshipEdge,
  type ClusterMembership,
} from '../src/services/curation-scoring.js';

// ─── Config ──────────────────────────────────────────────────────────────

interface EvalConfig {
  userId: string;
  collectionType: string;
  limit: number;
  topN: number;
  halfLifeDays: number;
  damping: number;
  iterations: number;
  weights: {
    editorial: number;
    cluster_quality: number;
    graph_centrality: number;
    rating: number;
    recency: number;
    engagement: number;
  };
}

function parseConfig(): EvalConfig {
  const args = process.argv.slice(2);

  if (args[0] === '--help') {
    console.log(`
REM Curation Evaluation — test curation sub-scores, PageRank, and composite weights.

Usage:
  npx tsx scripts/rem-curation-eval.ts [user_id] [options]

Options:
  --collection-type <type>  Collection type (default: users)
  --limit <n>               Max memories to evaluate (default: 30)
  --top <n>                 Show top/bottom N in rankings (default: 10)
  --halflife <n>            Recency half-life in days (default: 90)
  --damping <n>             PageRank damping factor (default: 0.85)
  --iterations <n>          PageRank iterations (default: 20)
  --w-editorial <n>         Editorial weight (default: 0.30)
  --w-cluster <n>           Cluster quality weight (default: 0.25)
  --w-centrality <n>        Graph centrality weight (default: 0.20)
  --w-rating <n>            Rating weight (default: 0.12)
  --w-recency <n>           Recency weight (default: 0.08)
  --w-engagement <n>        Engagement weight (default: 0.05)
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
    limit: parseInt(getArg('--limit') ?? '30', 10),
    topN: parseInt(getArg('--top') ?? '10', 10),
    halfLifeDays: parseInt(getArg('--halflife') ?? '90', 10),
    damping: parseFloat(getArg('--damping') ?? '0.85'),
    iterations: parseInt(getArg('--iterations') ?? '20', 10),
    weights: {
      editorial: parseFloat(getArg('--w-editorial') ?? String(CURATED_WEIGHTS.editorial)),
      cluster_quality: parseFloat(getArg('--w-cluster') ?? String(CURATED_WEIGHTS.cluster_quality)),
      graph_centrality: parseFloat(getArg('--w-centrality') ?? String(CURATED_WEIGHTS.graph_centrality)),
      rating: parseFloat(getArg('--w-rating') ?? String(CURATED_WEIGHTS.rating)),
      recency: parseFloat(getArg('--w-recency') ?? String(CURATED_WEIGHTS.recency)),
      engagement: parseFloat(getArg('--w-engagement') ?? String(CURATED_WEIGHTS.engagement)),
    },
  };
}

// ─── Types ───────────────────────────────────────────────────────────────

interface MemoryScore {
  id: string;
  content: string;
  created_at: string;
  editorial: number;
  cluster_quality: number;
  graph_centrality: number;
  rating: number;
  recency: number;
  engagement: number;
  composite: number;
  composite_custom?: number; // Only set when custom weights differ
}

// ─── Main ────────────────────────────────────────────────────────────────

async function run() {
  const config = parseConfig();

  if (!process.env.WEAVIATE_REST_URL) {
    console.error('Error: WEAVIATE_REST_URL environment variable required');
    process.exit(1);
  }

  const usingCustomWeights = hasCustomWeights(config);

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  REM Curation Evaluation — Sub-Score Analysis       ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`  User:       ${config.userId}`);
  console.log(`  Collection: Memory_${config.collectionType}_${config.userId}`);
  console.log(`  Limit:      ${config.limit}`);
  console.log(`  Halflife:   ${config.halfLifeDays} days`);
  console.log(`  PageRank:   damping=${config.damping}, iterations=${config.iterations}`);
  if (usingCustomWeights) {
    console.log(`  Weights:    CUSTOM`);
    printWeights(config.weights, '    ');
  } else {
    console.log(`  Weights:    default`);
  }
  console.log();

  // Connect to Weaviate
  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_EMBEDDINGS_API_KEY,
  });

  const collectionId = `Memory_${config.collectionType}_${config.userId}`;
  const collection = client.collections.get(collectionId);

  // Fetch memories
  console.log(`  Fetching memories...`);
  const memResult = await collection.query.fetchObjects({
    filters: collection.filter.byProperty('doc_type').equal('memory'),
    limit: config.limit,
    returnProperties: [
      'content', 'created_at', 'tags', 'doc_type',
      'rating_bayesian', 'editorial_score',
      'click_count', 'share_count', 'comment_count',
      'relationship_count', 'relationship_ids',
    ],
  });

  const memories = memResult.objects ?? [];
  if (memories.length === 0) {
    console.error('  No memories found');
    process.exit(1);
  }
  console.log(`  Found ${memories.length} memories`);

  // Fetch relationships for PageRank graph
  console.log(`  Fetching relationships...`);
  const relResult = await collection.query.fetchObjects({
    filters: collection.filter.byProperty('doc_type').equal('relationship'),
    limit: 200,
    returnProperties: ['related_memory_ids', 'strength', 'confidence', 'relationship_type', 'observation'],
  });

  const relationships = relResult.objects ?? [];
  console.log(`  Found ${relationships.length} relationships`);

  // Build edges and cluster memberships
  const memoryIds = memories.map((m: any) => m.uuid ?? m.id);
  const edges: RelationshipEdge[] = [];
  const clusterMemberships = new Map<string, ClusterMembership[]>();

  for (const rel of relationships) {
    const relMemIds: string[] = (rel.properties as any).related_memory_ids ?? [];
    const strength = (rel.properties as any).strength ?? 0.5;
    const confidence = (rel.properties as any).confidence ?? 0.5;

    // Create edges between all pairs in the relationship
    for (let i = 0; i < relMemIds.length; i++) {
      for (let j = i + 1; j < relMemIds.length; j++) {
        edges.push({ source_id: relMemIds[i], target_id: relMemIds[j] });
      }
      // Track cluster membership
      const existing = clusterMemberships.get(relMemIds[i]) ?? [];
      existing.push({ strength, confidence });
      clusterMemberships.set(relMemIds[i], existing);
    }
  }

  console.log(`  Graph: ${edges.length} edges, ${clusterMemberships.size} nodes with memberships\n`);

  // Run PageRank
  const pageRankScores = pageRank(memoryIds, edges, config.iterations, config.damping);

  // Compute sub-scores for each memory
  const results: MemoryScore[] = [];

  for (const mem of memories) {
    const id = (mem as any).uuid ?? (mem as any).id;
    const props = mem.properties as any;

    const editorial = normalizedEditorial(props.editorial_score ?? 0);
    const cluster_quality = clusterQualityScore(clusterMemberships.get(id) ?? []);
    const graph_centrality = pageRankScores.get(id) ?? 0;
    const rating = normalizedRating(props.rating_bayesian ?? 3.0);
    const recency = recencyScore(props.created_at ?? new Date().toISOString(), config.halfLifeDays);
    const engagement = engagementScore(
      props.click_count ?? 0,
      props.share_count ?? 0,
      props.comment_count ?? 0,
    );

    // Default composite
    const composite =
      CURATED_WEIGHTS.editorial * editorial +
      CURATED_WEIGHTS.cluster_quality * cluster_quality +
      CURATED_WEIGHTS.graph_centrality * graph_centrality +
      CURATED_WEIGHTS.rating * rating +
      CURATED_WEIGHTS.recency * recency +
      CURATED_WEIGHTS.engagement * engagement;

    const score: MemoryScore = {
      id,
      content: props.content ?? '',
      created_at: props.created_at ?? '',
      editorial,
      cluster_quality,
      graph_centrality,
      rating,
      recency,
      engagement,
      composite,
    };

    // Custom composite if weights differ
    if (usingCustomWeights) {
      score.composite_custom =
        config.weights.editorial * editorial +
        config.weights.cluster_quality * cluster_quality +
        config.weights.graph_centrality * graph_centrality +
        config.weights.rating * rating +
        config.weights.recency * recency +
        config.weights.engagement * engagement;
    }

    results.push(score);
  }

  // Sort by composite score descending
  results.sort((a, b) => b.composite - a.composite);

  // ── Output ──
  printTopBottom(results, config);
  printDistribution(results);
  if (usingCustomWeights) {
    printWeightComparison(results, config);
  }
  printSubScoreStats(results);
  printThresholdAnalysis(results);
}

// ─── Output Helpers ──────────────────────────────────────────────────────

function printTopBottom(results: MemoryScore[], config: EvalConfig) {
  const n = Math.min(config.topN, results.length);

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Top ${n} by Curated Score\n`);
  for (let i = 0; i < n; i++) {
    const r = results[i];
    console.log(`  ${(i + 1).toString().padStart(2)}. ${r.composite.toFixed(3)}  "${truncate(r.content, 60)}"`);
    console.log(`      ed=${r.editorial.toFixed(2)} cl=${r.cluster_quality.toFixed(2)} pr=${r.graph_centrality.toFixed(2)} rt=${r.rating.toFixed(2)} rc=${r.recency.toFixed(2)} en=${r.engagement.toFixed(2)}`);
  }

  console.log(`\n  Bottom ${n} by Curated Score\n`);
  for (let i = results.length - n; i < results.length; i++) {
    const r = results[i];
    console.log(`  ${(i + 1).toString().padStart(2)}. ${r.composite.toFixed(3)}  "${truncate(r.content, 60)}"`);
    console.log(`      ed=${r.editorial.toFixed(2)} cl=${r.cluster_quality.toFixed(2)} pr=${r.graph_centrality.toFixed(2)} rt=${r.rating.toFixed(2)} rc=${r.recency.toFixed(2)} en=${r.engagement.toFixed(2)}`);
  }
  console.log();
}

function printDistribution(results: MemoryScore[]) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Composite Score Distribution\n`);

  const buckets = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  for (let i = 0; i < buckets.length - 1; i++) {
    const lo = buckets[i];
    const hi = buckets[i + 1];
    const count = results.filter((r) => r.composite >= lo && r.composite < hi).length;
    const bar = '#'.repeat(count);
    console.log(`    ${lo.toFixed(1)}-${hi.toFixed(1)}: ${bar.padEnd(30)} ${count}`);
  }

  const scores = results.map((r) => r.composite);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);

  console.log(`\n    min=${min.toFixed(3)} max=${max.toFixed(3)} mean=${mean.toFixed(3)} median=${median.toFixed(3)} stddev=${stddev.toFixed(3)}\n`);
}

function printWeightComparison(results: MemoryScore[], config: EvalConfig) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Weight Comparison: Default vs Custom\n`);
  printWeights(CURATED_WEIGHTS, '    Default: ');
  printWeights(config.weights, '    Custom:  ');
  console.log();

  // Sort by custom weights
  const customSorted = [...results].sort((a, b) => (b.composite_custom ?? 0) - (a.composite_custom ?? 0));

  // Find ranking changes
  let changes = 0;
  console.log(`    Rank  Default  Custom   Delta  Content`);
  console.log(`    ────  ───────  ──────   ─────  ───────`);

  for (let i = 0; i < Math.min(15, results.length); i++) {
    const defaultId = results[i].id;
    const customRank = customSorted.findIndex((r) => r.id === defaultId);
    const delta = i - customRank;
    if (delta !== 0) changes++;
    const arrow = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : ' 0';
    console.log(
      `    ${(i + 1).toString().padStart(3)}   ${results[i].composite.toFixed(3)}    ${(results[i].composite_custom ?? 0).toFixed(3)}    ${arrow.padStart(3)}   "${truncate(results[i].content, 40)}"`,
    );
  }

  console.log(`\n    ${changes} ranking changes in top ${Math.min(15, results.length)}\n`);
}

function printSubScoreStats(results: MemoryScore[]) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Sub-Score Statistics\n`);

  const dimensions: (keyof MemoryScore)[] = ['editorial', 'cluster_quality', 'graph_centrality', 'rating', 'recency', 'engagement'];

  console.log(`    Dimension         Avg    Min    Max    >0%`);
  console.log(`    ─────────         ───    ───    ───    ───`);

  for (const dim of dimensions) {
    const values = results.map((r) => r[dim] as number);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const nonZero = values.filter((v) => v > 0).length;
    const pct = Math.round((nonZero / values.length) * 100);
    console.log(`    ${dim.padEnd(18)} ${avg.toFixed(2)}   ${min.toFixed(2)}   ${max.toFixed(2)}   ${pct.toString().padStart(3)}%`);
  }
  console.log();
}

function printThresholdAnalysis(results: MemoryScore[]) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Threshold Analysis (memories above threshold)\n`);

  const thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  for (const t of thresholds) {
    const count = results.filter((r) => r.composite >= t).length;
    const pct = Math.round((count / results.length) * 100);
    console.log(`    >= ${t.toFixed(1)}: ${count}/${results.length} (${pct}%)`);
  }
  console.log();
}

function printWeights(weights: Record<string, number>, prefix: string) {
  const parts = Object.entries(weights).map(([k, v]) => `${k}=${v.toFixed(2)}`);
  console.log(`${prefix}${parts.join(', ')}`);
}

function hasCustomWeights(config: EvalConfig): boolean {
  return (
    config.weights.editorial !== CURATED_WEIGHTS.editorial ||
    config.weights.cluster_quality !== CURATED_WEIGHTS.cluster_quality ||
    config.weights.graph_centrality !== CURATED_WEIGHTS.graph_centrality ||
    config.weights.rating !== CURATED_WEIGHTS.rating ||
    config.weights.recency !== CURATED_WEIGHTS.recency ||
    config.weights.engagement !== CURATED_WEIGHTS.engagement
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
