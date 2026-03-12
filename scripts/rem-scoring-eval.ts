/**
 * REM Emotional Scoring Evaluation Script
 *
 * Evaluates the composite emotional scoring pipeline against real memories:
 *   1. Fetch memories with all 31 dimension scores
 *   2. Show score distribution and dimension statistics
 *   3. Recompute composites with custom weight overrides
 *   4. Identify scoring anomalies (contradictions, outliers, unscored)
 *
 * Usage:
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-scoring-eval.ts)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-scoring-eval.ts --show-all-dims --anomalies)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-scoring-eval.ts --weight feel_joy=2.0 --weight feel_sadness=0.5)
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';
import {
  FEEL_DIMENSION_PROPERTIES,
  FUNCTIONAL_DIMENSION_PROPERTIES,
  ALL_SCORING_DIMENSIONS,
} from '../src/database/weaviate/index.js';
import {
  computeAllComposites,
  type CompositeWeights,
  type DimensionScores,
} from '../src/services/composite-scoring.js';

// ─── Config ──────────────────────────────────────────────────────────────

interface ScoringEvalConfig {
  userId: string;
  collectionType: string;
  limit: number;
  showAllDims: boolean;
  anomalies: boolean;
  topN: number;
  weightOverrides: Map<string, number>;
}

function parseConfig(): ScoringEvalConfig {
  const args = process.argv.slice(2);

  if (args[0] === '--help') {
    console.log(`
REM Emotional Scoring Evaluation — analyze dimension scores and composite weights.

Usage:
  npx tsx scripts/rem-scoring-eval.ts [user_id] [options]

Options:
  --collection-type <type>  Collection type (default: users)
  --limit <n>               Max memories to evaluate (default: 30)
  --top <n>                 Show top/bottom N rankings (default: 10)
  --show-all-dims           Show all 31 dimensions per memory (default: top 5)
  --anomalies               Highlight scoring outliers and contradictions
  --weight <dim>=<val>      Override dimension weight (repeatable)

Dimensions (21 feel + 10 functional):
  feel_emotional_significance, feel_vulnerability, feel_trauma, feel_humor,
  feel_happiness, feel_sadness, feel_fear, feel_anger, feel_surprise,
  feel_disgust, feel_contempt, feel_embarrassment, feel_shame, feel_guilt,
  feel_excitement, feel_pride, feel_valence, feel_arousal, feel_dominance,
  feel_intensity, feel_coherence_tension,
  functional_salience, functional_urgency, functional_social_weight,
  functional_agency, functional_novelty, functional_retrieval_utility,
  functional_narrative_importance, functional_aesthetic_quality,
  functional_valence, functional_coherence_tension
`);
    process.exit(0);
  }

  const userId = (args[0] && !args[0].startsWith('--')) ? args[0] : 'e1_test_user';

  function getArg(name: string): string | undefined {
    const idx = args.indexOf(name);
    return idx !== -1 ? args[idx + 1] : undefined;
  }

  // Parse --weight overrides
  const weightOverrides = new Map<string, number>();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--weight' && args[i + 1]) {
      const [dim, val] = args[i + 1].split('=');
      if (dim && val) {
        weightOverrides.set(dim, parseFloat(val));
      }
    }
  }

  return {
    userId,
    collectionType: getArg('--collection-type') ?? 'users',
    limit: parseInt(getArg('--limit') ?? '30', 10),
    topN: parseInt(getArg('--top') ?? '10', 10),
    showAllDims: args.includes('--show-all-dims'),
    anomalies: args.includes('--anomalies'),
    weightOverrides,
  };
}

// ─── Types ───────────────────────────────────────────────────────────────

interface MemoryEval {
  id: string;
  content: string;
  scores: DimensionScores;
  feelSig: number | null;
  funcSig: number | null;
  totalSig: number | null;
  customFeelSig?: number | null;
  customFuncSig?: number | null;
  customTotalSig?: number | null;
  scoredDimensions: number;
  totalDimensions: number;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function run() {
  const config = parseConfig();

  if (!process.env.WEAVIATE_REST_URL) {
    console.error('Error: WEAVIATE_REST_URL environment variable required');
    process.exit(1);
  }

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  REM Emotional Scoring Evaluation                   ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`  User:       ${config.userId}`);
  console.log(`  Collection: Memory_${config.collectionType}_${config.userId}`);
  console.log(`  Limit:      ${config.limit}`);
  console.log(`  Dimensions: ${ALL_SCORING_DIMENSIONS.length} (${FEEL_DIMENSION_PROPERTIES.length} feel + ${FUNCTIONAL_DIMENSION_PROPERTIES.length} functional)`);
  if (config.weightOverrides.size > 0) {
    console.log(`  Weight overrides:`);
    for (const [dim, val] of config.weightOverrides) {
      console.log(`    ${dim} = ${val}`);
    }
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

  // Fetch memories with all scoring dimensions
  console.log(`  Fetching memories...`);
  const returnProps = [
    'content', 'created_at', 'doc_type',
    'feel_significance', 'functional_significance', 'total_significance',
    ...ALL_SCORING_DIMENSIONS,
  ];

  const memResult = await collection.query.fetchObjects({
    filters: collection.filter.byProperty('doc_type').equal('memory'),
    limit: config.limit,
    returnProperties: returnProps as string[],
  });

  const memories = memResult.objects ?? [];
  if (memories.length === 0) {
    console.error('  No memories found');
    process.exit(1);
  }
  console.log(`  Found ${memories.length} memories\n`);

  // Build custom weights if overrides exist
  let customWeights: CompositeWeights | undefined;
  if (config.weightOverrides.size > 0) {
    const feelWeights: Record<string, number> = {};
    const funcWeights: Record<string, number> = {};

    for (const dim of FEEL_DIMENSION_PROPERTIES) {
      feelWeights[dim] = config.weightOverrides.get(dim) ?? 1.0;
    }
    for (const dim of FUNCTIONAL_DIMENSION_PROPERTIES) {
      funcWeights[dim] = config.weightOverrides.get(dim) ?? 1.0;
    }

    customWeights = { feel: feelWeights, functional: funcWeights };
  }

  // Evaluate each memory
  const results: MemoryEval[] = [];

  for (const mem of memories) {
    const id = (mem as any).uuid ?? (mem as any).id;
    const props = mem.properties as any;

    // Extract dimension scores
    const scores: DimensionScores = {};
    let scoredCount = 0;
    for (const dim of ALL_SCORING_DIMENSIONS) {
      const val = props[dim];
      if (val !== undefined && val !== null) {
        scores[dim] = val;
        scoredCount++;
      }
    }

    // Compute composites with default weights
    const composites = computeAllComposites(scores);

    const eval_: MemoryEval = {
      id,
      content: props.content ?? '',
      scores,
      feelSig: composites.feel_significance,
      funcSig: composites.functional_significance,
      totalSig: composites.total_significance,
      scoredDimensions: scoredCount,
      totalDimensions: ALL_SCORING_DIMENSIONS.length,
    };

    // Compute with custom weights if present
    if (customWeights) {
      const custom = computeAllComposites(scores, customWeights);
      eval_.customFeelSig = custom.feel_significance;
      eval_.customFuncSig = custom.functional_significance;
      eval_.customTotalSig = custom.total_significance;
    }

    results.push(eval_);
  }

  // ── Output ──
  printScoreDistribution(results);
  printDimensionStats(results, config);
  printRankings(results, config);

  if (customWeights) {
    printWeightComparison(results, config);
  }

  if (config.anomalies) {
    printAnomalies(results);
  }
}

// ─── Output Helpers ──────────────────────────────────────────────────────

function printScoreDistribution(results: MemoryEval[]) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Composite Score Distribution\n`);

  const scored = results.filter((r) => r.totalSig !== null);
  const unscored = results.filter((r) => r.totalSig === null);

  console.log(`    Scored: ${scored.length}  Unscored: ${unscored.length}\n`);

  if (scored.length === 0) {
    console.log(`    No scored memories to analyze\n`);
    return;
  }

  const values = scored.map((r) => r.totalSig!);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  console.log(`    total_significance:  min=${min.toFixed(3)} max=${max.toFixed(3)} mean=${mean.toFixed(3)} median=${median.toFixed(3)}`);

  const feelValues = scored.map((r) => r.feelSig!).filter((v) => v !== null);
  if (feelValues.length > 0) {
    const fMean = feelValues.reduce((s, v) => s + v, 0) / feelValues.length;
    console.log(`    feel_significance:  mean=${fMean.toFixed(3)}`);
  }

  const funcValues = scored.map((r) => r.funcSig!).filter((v) => v !== null);
  if (funcValues.length > 0) {
    const fMean = funcValues.reduce((s, v) => s + v, 0) / funcValues.length;
    console.log(`    func_significance:  mean=${fMean.toFixed(3)}`);
  }

  // Histogram
  console.log(`\n    total_significance distribution:`);
  const buckets = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.5, 2.0];
  for (let i = 0; i < buckets.length - 1; i++) {
    const lo = buckets[i];
    const hi = buckets[i + 1];
    const count = values.filter((v) => v >= lo && v < hi).length;
    const bar = '#'.repeat(count);
    console.log(`      ${lo.toFixed(1)}-${hi.toFixed(1)}: ${bar.padEnd(25)} ${count}`);
  }
  console.log();
}

function printDimensionStats(results: MemoryEval[], config: ScoringEvalConfig) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Dimension Statistics\n`);

  const dims = config.showAllDims ? ALL_SCORING_DIMENSIONS : [...ALL_SCORING_DIMENSIONS];

  console.log(`    Dimension                        Avg    Min    Max   Scored`);
  console.log(`    ─────────                        ───    ───    ───   ──────`);

  const dimStats: Array<{ dim: string; avg: number; min: number; max: number; scored: number }> = [];

  for (const dim of dims) {
    const values = results
      .map((r) => r.scores[dim])
      .filter((v): v is number => v !== undefined && v !== null);

    if (values.length === 0) {
      dimStats.push({ dim, avg: 0, min: 0, max: 0, scored: 0 });
      continue;
    }

    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    dimStats.push({ dim, avg, min, max, scored: values.length });
  }

  // Sort by avg descending for readability
  dimStats.sort((a, b) => b.avg - a.avg);

  for (const s of dimStats) {
    if (!config.showAllDims && s.scored === 0) continue;
    console.log(
      `    ${s.dim.padEnd(33)} ${s.avg.toFixed(2)}   ${s.min.toFixed(2)}   ${s.max.toFixed(2)}   ${s.scored}/${results.length}`,
    );
  }
  console.log();
}

function printRankings(results: MemoryEval[], config: ScoringEvalConfig) {
  const scored = results.filter((r) => r.totalSig !== null);
  if (scored.length === 0) return;

  scored.sort((a, b) => (b.totalSig ?? 0) - (a.totalSig ?? 0));

  const n = Math.min(config.topN, scored.length);

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Top ${n} by Total Significance\n`);

  for (let i = 0; i < n; i++) {
    const r = scored[i];
    console.log(`  ${(i + 1).toString().padStart(2)}. ${(r.totalSig ?? 0).toFixed(3)} (feel=${(r.feelSig ?? 0).toFixed(2)} func=${(r.funcSig ?? 0).toFixed(2)}) [${r.scoredDimensions}/${r.totalDimensions} dims]`);
    console.log(`      "${truncate(r.content, 65)}"`);

    if (config.showAllDims) {
      const topDims = Object.entries(r.scores)
        .filter(([, v]) => v !== undefined && v !== null && v !== 0)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5);
      if (topDims.length > 0) {
        console.log(`      Top: ${topDims.map(([k, v]) => `${k.replace('feel_', 'f.').replace('functional_', 'fn.')}=${(v as number).toFixed(2)}`).join(', ')}`);
      }
    }
  }

  console.log(`\n  Bottom ${n} by Total Significance\n`);
  for (let i = scored.length - n; i < scored.length; i++) {
    const r = scored[i];
    console.log(`  ${(i + 1).toString().padStart(2)}. ${(r.totalSig ?? 0).toFixed(3)} (feel=${(r.feelSig ?? 0).toFixed(2)} func=${(r.funcSig ?? 0).toFixed(2)}) [${r.scoredDimensions}/${r.totalDimensions} dims]`);
    console.log(`      "${truncate(r.content, 65)}"`);
  }
  console.log();
}

function printWeightComparison(results: MemoryEval[], config: ScoringEvalConfig) {
  const scored = results.filter((r) => r.totalSig !== null && r.customTotalSig !== null);
  if (scored.length === 0) return;

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Weight Override Comparison\n`);

  console.log(`    Overrides:`);
  for (const [dim, val] of config.weightOverrides) {
    console.log(`      ${dim}: 1.0 -> ${val}`);
  }
  console.log();

  // Sort by default and custom, compare
  const byDefault = [...scored].sort((a, b) => (b.totalSig ?? 0) - (a.totalSig ?? 0));
  const byCustom = [...scored].sort((a, b) => (b.customTotalSig ?? 0) - (a.customTotalSig ?? 0));

  let changes = 0;
  console.log(`    Rank  Default  Custom   Delta  Content`);
  console.log(`    ────  ───────  ──────   ─────  ───────`);

  for (let i = 0; i < Math.min(15, byDefault.length); i++) {
    const defId = byDefault[i].id;
    const customRank = byCustom.findIndex((r) => r.id === defId);
    const delta = i - customRank;
    if (delta !== 0) changes++;
    const arrow = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : ' 0';
    console.log(
      `    ${(i + 1).toString().padStart(3)}   ${(byDefault[i].totalSig ?? 0).toFixed(3)}    ${(byDefault[i].customTotalSig ?? 0).toFixed(3)}    ${arrow.padStart(3)}   "${truncate(byDefault[i].content, 40)}"`,
    );
  }

  console.log(`\n    ${changes} ranking changes in top ${Math.min(15, byDefault.length)}\n`);
}

function printAnomalies(results: MemoryEval[]) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Anomaly Detection\n`);

  // Unscored
  const unscored = results.filter((r) => r.scoredDimensions === 0);
  if (unscored.length > 0) {
    console.log(`  Unscored memories (0 dimensions): ${unscored.length}`);
    for (const r of unscored.slice(0, 5)) {
      console.log(`    "${truncate(r.content, 60)}"`);
    }
    console.log();
  }

  // Partially scored
  const partial = results.filter((r) => r.scoredDimensions > 0 && r.scoredDimensions < 10);
  if (partial.length > 0) {
    console.log(`  Partially scored (< 10 dimensions): ${partial.length}`);
    for (const r of partial.slice(0, 5)) {
      console.log(`    ${r.scoredDimensions}/${r.totalDimensions} dims: "${truncate(r.content, 50)}"`);
    }
    console.log();
  }

  // Contradictions (high happiness + high sadness, etc.)
  const contradictions: Array<{ id: string; content: string; dims: string }> = [];
  for (const r of results) {
    const happiness = r.scores['feel_happiness'] ?? 0;
    const sadness = r.scores['feel_sadness'] ?? 0;
    if (happiness > 0.6 && sadness > 0.6) {
      contradictions.push({
        id: r.id,
        content: r.content,
        dims: `happiness=${happiness.toFixed(2)} sadness=${sadness.toFixed(2)}`,
      });
    }

    const fear = r.scores['feel_fear'] ?? 0;
    const dominance = r.scores['feel_dominance'] ?? 0;
    if (fear > 0.6 && dominance > 0.6) {
      contradictions.push({
        id: r.id,
        content: r.content,
        dims: `fear=${fear.toFixed(2)} dominance=${dominance.toFixed(2)}`,
      });
    }
  }

  if (contradictions.length > 0) {
    console.log(`  Contradictory scores: ${contradictions.length}`);
    for (const c of contradictions.slice(0, 5)) {
      console.log(`    ${c.dims}`);
      console.log(`    "${truncate(c.content, 60)}"`);
    }
    console.log();
  }

  // Extreme outliers (total_significance > 1.5 or near 0)
  const scored = results.filter((r) => r.totalSig !== null);
  if (scored.length > 0) {
    const values = scored.map((r) => r.totalSig!);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const stddev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);

    const outliers = scored.filter((r) => Math.abs(r.totalSig! - mean) > 2 * stddev);
    if (outliers.length > 0) {
      console.log(`  Outliers (>2 stddev from mean=${mean.toFixed(3)}): ${outliers.length}`);
      for (const r of outliers.slice(0, 5)) {
        console.log(`    total_sig=${(r.totalSig ?? 0).toFixed(3)}: "${truncate(r.content, 55)}"`);
      }
      console.log();
    }
  }

  if (unscored.length === 0 && partial.length === 0 && contradictions.length === 0) {
    console.log(`  No anomalies detected\n`);
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
