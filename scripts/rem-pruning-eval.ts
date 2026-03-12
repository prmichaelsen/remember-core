/**
 * REM Pruning Decay Evaluation Script
 *
 * Simulates the pruning decay pipeline against real memories to preview:
 *   1. Which memories would be decayed (low significance)
 *   2. Which memories are exempt (high coherence tension or agency)
 *   3. Which memories would be soft-deleted (decay crossing threshold)
 *   4. How different threshold configs change the outcome
 *
 * Usage:
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-pruning-eval.ts)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-pruning-eval.ts --sig-floor 0.3 --sig-ceiling 0.6)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-pruning-eval.ts --limit 100)
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';
import { computeDecayIncrement, type PruningMemory } from '../src/services/rem.pruning.js';

// ─── Config ──────────────────────────────────────────────────────────────

interface PruningEvalConfig {
  userId: string;
  collectionType: string;
  limit: number;
  decayThreshold: number;
  maxDecay: number;
  minDecay: number;
  sigFloor: number;
  sigCeiling: number;
  tensionExempt: number;
  agencyExempt: number;
  urgencyFactor: number;
}

function parseConfig(): PruningEvalConfig {
  const args = process.argv.slice(2);

  if (args[0] === '--help') {
    console.log(`
REM Pruning Evaluation — simulate decay pipeline against real memories.

Usage:
  npx tsx scripts/rem-pruning-eval.ts [user_id] [options]

Options:
  --collection-type <type>  Collection type (default: users)
  --limit <n>               Max candidates to evaluate (default: 50)
  --decay-threshold <n>     Soft-delete trigger (default: 0.9)
  --max-decay <n>           Max decay per cycle (default: 0.15)
  --min-decay <n>           Min decay per cycle (default: 0.01)
  --sig-floor <n>           Below = max decay (default: 0.2)
  --sig-ceiling <n>         Above = no pruning (default: 0.5)
  --tension-exempt <n>      Coherence tension exemption (default: 0.7)
  --agency-exempt <n>       Agency exemption (default: 0.7)
  --urgency-factor <n>      Urgency decay per cycle (default: 0.9)
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
    limit: parseInt(getArg('--limit') ?? '50', 10),
    decayThreshold: parseFloat(getArg('--decay-threshold') ?? '0.9'),
    maxDecay: parseFloat(getArg('--max-decay') ?? '0.15'),
    minDecay: parseFloat(getArg('--min-decay') ?? '0.01'),
    sigFloor: parseFloat(getArg('--sig-floor') ?? '0.2'),
    sigCeiling: parseFloat(getArg('--sig-ceiling') ?? '0.5'),
    tensionExempt: parseFloat(getArg('--tension-exempt') ?? '0.7'),
    agencyExempt: parseFloat(getArg('--agency-exempt') ?? '0.7'),
    urgencyFactor: parseFloat(getArg('--urgency-factor') ?? '0.9'),
  };
}

// ─── Types ───────────────────────────────────────────────────────────────

interface PruningEvalResult {
  id: string;
  content: string;
  totalSignificance: number;
  coherenceTension: number;
  agency: number;
  currentDecay: number;
  decayIncrement: number;
  projectedDecay: number;
  category: 'would-decay' | 'would-soft-delete' | 'exempt-tension' | 'exempt-agency' | 'safe-above-ceiling';
  exemptionReason?: string;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function run() {
  const config = parseConfig();

  if (!process.env.WEAVIATE_REST_URL) {
    console.error('Error: WEAVIATE_REST_URL environment variable required');
    process.exit(1);
  }

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  REM Pruning Evaluation — Decay Simulation          ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`  User:           ${config.userId}`);
  console.log(`  Collection:     Memory_${config.collectionType}_${config.userId}`);
  console.log(`  Limit:          ${config.limit}`);
  console.log(`  Decay threshold: ${config.decayThreshold}`);
  console.log(`  Decay range:    ${config.minDecay} - ${config.maxDecay}`);
  console.log(`  Sig floor:      ${config.sigFloor}`);
  console.log(`  Sig ceiling:    ${config.sigCeiling}`);
  console.log(`  Tension exempt: ${config.tensionExempt}`);
  console.log(`  Agency exempt:  ${config.agencyExempt}`);
  console.log(`  Urgency factor: ${config.urgencyFactor}\n`);

  // Connect to Weaviate
  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_EMBEDDINGS_API_KEY,
  });

  const collectionId = `Memory_${config.collectionType}_${config.userId}`;
  const collection = client.collections.get(collectionId);

  // Fetch all memories (not just low-significance) to show full picture
  console.log(`  Fetching memories...`);
  const memResult = await collection.query.fetchObjects({
    filters: collection.filter.byProperty('doc_type').equal('memory'),
    limit: config.limit,
    returnProperties: [
      'content', 'created_at', 'doc_type', 'content_type',
      'total_significance', 'feel_coherence_tension', 'functional_agency',
      'functional_urgency', 'decay', 'deleted_at',
    ],
  });

  const memories = memResult.objects ?? [];
  if (memories.length === 0) {
    console.error('  No memories found');
    process.exit(1);
  }
  console.log(`  Found ${memories.length} memories\n`);

  // Evaluate each memory
  const results: PruningEvalResult[] = [];

  for (const mem of memories) {
    const id = (mem as any).uuid ?? (mem as any).id;
    const props = mem.properties as any;

    // Skip already deleted and REM-generated
    if (props.deleted_at) continue;
    if (props.content_type === 'rem') continue;

    const totalSig = props.total_significance ?? 0;
    const tension = props.feel_coherence_tension ?? 0;
    const agency = props.functional_agency ?? 0;
    const currentDecay = props.decay ?? 0;

    const pruningMemory: PruningMemory = {
      total_significance: totalSig,
      feel_coherence_tension: tension,
      functional_agency: agency,
    };

    const increment = computeDecayIncrement(pruningMemory);
    const projectedDecay = Math.min(1.0, currentDecay + increment);

    let category: PruningEvalResult['category'];
    let exemptionReason: string | undefined;

    if (totalSig >= config.sigCeiling) {
      category = 'safe-above-ceiling';
      exemptionReason = `significance ${totalSig.toFixed(2)} >= ceiling ${config.sigCeiling}`;
    } else if (tension >= config.tensionExempt) {
      category = 'exempt-tension';
      exemptionReason = `coherence_tension ${tension.toFixed(2)} >= ${config.tensionExempt}`;
    } else if (agency >= config.agencyExempt) {
      category = 'exempt-agency';
      exemptionReason = `agency ${agency.toFixed(2)} >= ${config.agencyExempt}`;
    } else if (projectedDecay >= config.decayThreshold) {
      category = 'would-soft-delete';
    } else {
      category = 'would-decay';
    }

    results.push({
      id,
      content: props.content ?? '',
      totalSignificance: totalSig,
      coherenceTension: tension,
      agency,
      currentDecay,
      decayIncrement: increment,
      projectedDecay,
      category,
      exemptionReason,
    });
  }

  // ── Output ──
  printCategorySummary(results, config);
  printPerMemoryDetail(results, config);
  printThresholdAnalysis(results, config);
  printUrgencyReport(memories, config);
}

// ─── Output Helpers ──────────────────────────────────────────────────────

function printCategorySummary(results: PruningEvalResult[], config: PruningEvalConfig) {
  const counts = {
    'would-decay': results.filter((r) => r.category === 'would-decay').length,
    'would-soft-delete': results.filter((r) => r.category === 'would-soft-delete').length,
    'exempt-tension': results.filter((r) => r.category === 'exempt-tension').length,
    'exempt-agency': results.filter((r) => r.category === 'exempt-agency').length,
    'safe-above-ceiling': results.filter((r) => r.category === 'safe-above-ceiling').length,
  };

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Category Summary (${results.length} memories evaluated)\n`);
  console.log(`    Would decay:        ${counts['would-decay']}`);
  console.log(`    Would soft-delete:  ${counts['would-soft-delete']}`);
  console.log(`    Exempt (tension):   ${counts['exempt-tension']}`);
  console.log(`    Exempt (agency):    ${counts['exempt-agency']}`);
  console.log(`    Safe (above ceil):  ${counts['safe-above-ceiling']}`);
  console.log();
}

function printPerMemoryDetail(results: PruningEvalResult[], _config: PruningEvalConfig) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Per-Memory Detail (sorted by significance ascending)\n`);

  const sorted = [...results].sort((a, b) => a.totalSignificance - b.totalSignificance);

  const icons: Record<string, string> = {
    'would-decay': '~',
    'would-soft-delete': 'X',
    'exempt-tension': 'T',
    'exempt-agency': 'A',
    'safe-above-ceiling': '-',
  };

  console.log(`    Cat  Sig   Decay  +Incr  =Proj  Content`);
  console.log(`    ───  ───   ─────  ─────  ─────  ───────`);

  for (const r of sorted.slice(0, 30)) {
    const icon = icons[r.category] ?? '?';
    console.log(
      `    [${icon}]  ${r.totalSignificance.toFixed(2)}  ${r.currentDecay.toFixed(2)}   +${r.decayIncrement.toFixed(3)}  =${r.projectedDecay.toFixed(2)}   "${truncate(r.content, 45)}"`,
    );
    if (r.exemptionReason) {
      console.log(`                                          (${r.exemptionReason})`);
    }
  }

  if (sorted.length > 30) {
    console.log(`    ... ${sorted.length - 30} more memories not shown`);
  }
  console.log();
}

function printThresholdAnalysis(results: PruningEvalResult[], config: PruningEvalConfig) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Threshold Analysis\n`);

  // How changing sig_ceiling affects pruning candidate count
  console.log(`  Significance ceiling impact (memories eligible for pruning):`);
  const ceilings = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  for (const c of ceilings) {
    const eligible = results.filter((r) => r.totalSignificance < c).length;
    const marker = c === config.sigCeiling ? ' <-' : '';
    console.log(`    ceiling=${c.toFixed(1)}: ${eligible}/${results.length} eligible${marker}`);
  }

  // How many cycles to soft-delete at current decay rates
  console.log(`\n  Cycles to soft-delete (from current decay):`);
  const decayable = results.filter((r) => r.category === 'would-decay' || r.category === 'would-soft-delete');
  if (decayable.length > 0) {
    for (const r of decayable.slice(0, 10)) {
      const remaining = config.decayThreshold - r.currentDecay;
      const cycles = r.decayIncrement > 0 ? Math.ceil(remaining / r.decayIncrement) : Infinity;
      const cycleStr = cycles === Infinity ? 'never' : `${cycles} cycles`;
      console.log(`    sig=${r.totalSignificance.toFixed(2)} decay=${r.currentDecay.toFixed(2)} incr=${r.decayIncrement.toFixed(3)} -> ${cycleStr}`);
    }
  } else {
    console.log(`    No memories eligible for decay`);
  }
  console.log();
}

function printUrgencyReport(memories: any[], config: PruningEvalConfig) {
  const withUrgency = memories.filter((m: any) => {
    const urgency = (m.properties as any).functional_urgency ?? 0;
    return urgency > 0;
  });

  if (withUrgency.length === 0) return;

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Urgency Decay Report (factor: ${config.urgencyFactor})\n`);
  console.log(`  ${withUrgency.length} memories with urgency > 0:\n`);

  for (const mem of withUrgency.slice(0, 10)) {
    const props = mem.properties as any;
    const current = props.functional_urgency ?? 0;
    const projected = current * config.urgencyFactor;
    console.log(`    ${current.toFixed(3)} -> ${projected.toFixed(3)}  "${truncate(props.content ?? '', 50)}"`);
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
