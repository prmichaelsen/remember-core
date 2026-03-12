/**
 * REM Reconciliation Evaluation Script
 *
 * Evaluates the conflict detection and reconciliation pipeline:
 *   1. Find high coherence-tension memories
 *   2. Detect conflict pairs (valence opposition, identity conflict)
 *   3. Show conflict details with memory content and scores
 *   4. Optionally preview reconciliation observations with --preview
 *
 * Usage:
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-reconciliation-eval.ts)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-reconciliation-eval.ts --tension 0.5 --similarity 0.6)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-reconciliation-eval.ts --preview)
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';
import {
  detectConflicts,
  buildReconciliationPrompt,
  CONFLICT_SIMILARITY_THRESHOLD,
  type ConflictPair,
} from '../src/services/rem.reconciliation.js';
import { COHERENCE_TENSION_THRESHOLD } from '../src/services/rem.constants.js';

// ─── Config ──────────────────────────────────────────────────────────────

interface ReconciliationEvalConfig {
  userId: string;
  collectionType: string;
  tensionThreshold: number;
  similarityThreshold: number;
  valenceGap: number;
  limit: number;
  preview: boolean;
  model?: string;
}

function parseConfig(): ReconciliationEvalConfig {
  const args = process.argv.slice(2);

  if (args[0] === '--help') {
    console.log(`
REM Reconciliation Evaluation — detect conflicts and preview reconciliation.

Usage:
  npx tsx scripts/rem-reconciliation-eval.ts [user_id] [options]

Options:
  --collection-type <type>  Collection type (default: users)
  --tension <n>             Coherence tension threshold (default: 0.7)
  --similarity <n>          Min vector similarity for conflicts (default: 0.75)
  --valence-gap <n>         Min valence gap for opposition (default: 0.5)
  --limit <n>               Max candidates to process (default: 20)
  --preview                 Generate reconciliation observations via LLM
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
    tensionThreshold: parseFloat(getArg('--tension') ?? String(COHERENCE_TENSION_THRESHOLD)),
    similarityThreshold: parseFloat(getArg('--similarity') ?? String(CONFLICT_SIMILARITY_THRESHOLD)),
    valenceGap: parseFloat(getArg('--valence-gap') ?? '0.5'),
    limit: parseInt(getArg('--limit') ?? '20', 10),
    preview: args.includes('--preview'),
    model: getArg('--model'),
  };
}

// ─── Types ───────────────────────────────────────────────────────────────

interface CandidateEval {
  id: string;
  content: string;
  tension: number;
  valence: number;
  contentType: string;
  conflicts: ConflictPair[];
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
  console.log(`║  REM Reconciliation Evaluation — Conflict Detection  ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`  User:       ${config.userId}`);
  console.log(`  Collection: Memory_${config.collectionType}_${config.userId}`);
  console.log(`  Tension:    >= ${config.tensionThreshold}`);
  console.log(`  Similarity: >= ${config.similarityThreshold}`);
  console.log(`  Valence gap: >= ${config.valenceGap}`);
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

  // Fetch high-tension memories
  console.log(`  Fetching high-tension memories (>= ${config.tensionThreshold})...`);

  // We can't easily filter by >= in all Weaviate versions, so fetch all and filter
  const memResult = await collection.query.fetchObjects({
    filters: collection.filter.byProperty('doc_type').equal('memory'),
    limit: 200,
    returnProperties: [
      'content', 'created_at', 'content_type', 'doc_type',
      'feel_coherence_tension', 'feel_valence',
      'deleted_at',
    ],
  });

  const allMemories = (memResult.objects ?? []).filter((m: any) => {
    const props = m.properties as any;
    if (props.deleted_at) return false;
    const tension = props.feel_coherence_tension ?? 0;
    return tension >= config.tensionThreshold;
  });

  if (allMemories.length === 0) {
    console.log(`  No memories with coherence tension >= ${config.tensionThreshold}`);
    console.log(`  Try lowering --tension (e.g., --tension 0.3)\n`);

    // Show tension distribution for guidance
    const all = memResult.objects ?? [];
    printTensionDistribution(all);
    process.exit(0);
  }

  // Sort by tension descending, limit
  allMemories.sort((a: any, b: any) => {
    const at = (a.properties as any).feel_coherence_tension ?? 0;
    const bt = (b.properties as any).feel_coherence_tension ?? 0;
    return bt - at;
  });
  const candidates = allMemories.slice(0, config.limit);

  console.log(`  Found ${allMemories.length} high-tension memories (showing ${candidates.length})\n`);

  // Detect conflicts for each candidate
  const results: CandidateEval[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const mem = candidates[i];
    const id = (mem as any).uuid ?? (mem as any).id;
    const props = mem.properties as any;

    process.stdout.write(`  Checking ${i + 1}/${candidates.length}: ${id.slice(0, 8)}... `);

    const conflicts = await detectConflicts(collection, {
      uuid: id,
      properties: props,
    });

    console.log(`${conflicts.length} conflict(s)`);

    results.push({
      id,
      content: props.content ?? '',
      tension: props.feel_coherence_tension ?? 0,
      valence: props.feel_valence ?? 0,
      contentType: props.content_type ?? 'text',
      conflicts,
    });
  }

  console.log();

  // Preview reconciliation observations
  if (config.preview) {
    const allConflicts = results.flatMap((r) => r.conflicts);
    if (allConflicts.length > 0 && process.env.ANTHROPIC_API_KEY) {
      console.log(`  Generating reconciliation previews for ${Math.min(allConflicts.length, 5)} conflicts...\n`);

      for (const conflict of allConflicts.slice(0, 5)) {
        const prompt = buildReconciliationPrompt(conflict);
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY!,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: config.model ?? 'claude-sonnet-4-5-20250929',
              max_tokens: 256,
              messages: [{ role: 'user', content: prompt }],
            }),
          });

          const data = await response.json() as any;
          const text = data.content?.[0]?.text ?? '';

          console.log(`  Conflict: ${conflict.conflict_type} (tension: ${conflict.tension_score.toFixed(2)})`);
          console.log(`    A: "${truncate(conflict.memory_a_summary, 60)}"`);
          console.log(`    B: "${truncate(conflict.memory_b_summary, 60)}"`);
          console.log(`    Reconciliation: "${truncate(text, 120)}"`);
          console.log();
        } catch (err) {
          console.log(`  [Error generating preview: ${err instanceof Error ? err.message : String(err)}]`);
        }
      }
    }
  }

  // ── Output ──
  printSummary(results, config);
  printConflictDetail(results);
  printThresholdAnalysis(results, memResult.objects ?? [], config);
}

// ─── Output Helpers ──────────────────────────────────────────────────────

function printSummary(results: CandidateEval[], config: ReconciliationEvalConfig) {
  const totalConflicts = results.reduce((s, r) => s + r.conflicts.length, 0);
  const withConflicts = results.filter((r) => r.conflicts.length > 0).length;

  const conflictTypes: Record<string, number> = {};
  for (const r of results) {
    for (const c of r.conflicts) {
      conflictTypes[c.conflict_type] = (conflictTypes[c.conflict_type] ?? 0) + 1;
    }
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Summary\n`);
  console.log(`    High-tension candidates:  ${results.length}`);
  console.log(`    With conflicts detected:  ${withConflicts}`);
  console.log(`    Total conflict pairs:     ${totalConflicts}`);

  if (Object.keys(conflictTypes).length > 0) {
    console.log(`    By type:`);
    for (const [type, count] of Object.entries(conflictTypes)) {
      console.log(`      ${type}: ${count}`);
    }
  }

  if (results.length > 0) {
    const avgTension = results.reduce((s, r) => s + r.tension, 0) / results.length;
    console.log(`    Avg tension: ${avgTension.toFixed(3)}`);
  }
  console.log();
}

function printConflictDetail(results: CandidateEval[]) {
  const withConflicts = results.filter((r) => r.conflicts.length > 0);
  if (withConflicts.length === 0) return;

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Conflict Pairs\n`);

  for (const r of withConflicts) {
    for (const c of r.conflicts) {
      console.log(`  [${c.conflict_type}] tension=${c.tension_score.toFixed(2)}`);
      console.log(`    A: "${truncate(c.memory_a_summary, 70)}"`);
      console.log(`    B: "${truncate(c.memory_b_summary, 70)}"`);
      console.log();
    }
  }
}

function printThresholdAnalysis(results: CandidateEval[], allMemories: any[], config: ReconciliationEvalConfig) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Threshold Analysis\n`);

  console.log(`  Tension threshold impact (candidates found):`);
  for (const t of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    const count = allMemories.filter((m: any) => {
      const tension = (m.properties as any).feel_coherence_tension ?? 0;
      return tension >= t && !(m.properties as any).deleted_at;
    }).length;
    const marker = t === config.tensionThreshold ? ' <-' : '';
    console.log(`    tension >= ${t.toFixed(1)}: ${count} candidates${marker}`);
  }
  console.log();
}

function printTensionDistribution(memories: any[]) {
  console.log(`\n  Tension Distribution (all memories):\n`);
  const buckets = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  for (let i = 0; i < buckets.length - 1; i++) {
    const lo = buckets[i];
    const hi = buckets[i + 1];
    const count = memories.filter((m: any) => {
      const t = (m.properties as any).feel_coherence_tension ?? 0;
      return t >= lo && t < hi;
    }).length;
    const bar = '#'.repeat(Math.min(count, 40));
    console.log(`    ${lo.toFixed(1)}-${hi.toFixed(1)}: ${bar.padEnd(40)} ${count}`);
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
