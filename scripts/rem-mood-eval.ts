/**
 * REM Mood Update Evaluation Script
 *
 * Simulates mood drift for each ghost by converting their memories'
 * emotional dimensions into synthetic pressures, then running
 * runMoodUpdate() iteratively across N simulated REM cycles.
 *
 * What it evaluates:
 *   1. Per-ghost mood trajectory (6 dimensions over N cycles)
 *   2. Threshold flags (burnout, isolation, depression, etc.)
 *   3. Pressure aggregation and decay behavior
 *   4. Cross-ghost comparison (do different ghosts develop distinct moods?)
 *
 * Usage:
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-mood-eval.ts)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-mood-eval.ts --cycles 20)
 *   (set -a && source .env.e1.local && npx tsx scripts/rem-mood-eval.ts --batch 10 --decay 0.1)
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';
import {
  createInitialMood,
  NEUTRAL_STATE,
  type CoreMoodMemory,
  type MoodState,
  type Pressure,
} from '../src/services/mood.service.js';
import {
  runMoodUpdate,
  THRESHOLDS,
  LEARNING_RATE,
  INERTIA,
  type ThresholdFlag,
} from '../src/services/mood-update.service.js';
import { synthesizePressuresFromDimensions } from '../src/services/mood-pressure-synthesis.js';

// ─── Config ──────────────────────────────────────────────────────────────

interface MoodEvalConfig {
  userId: string;
  collectionType: string;
  cycles: number;
  batchSize: number;       // memories per simulated cycle
  decayRate: number;       // decay rate for synthetic pressures
  magnitudeScale: number;  // scale factor for dimension → pressure magnitude
  limit: number;           // max memories per ghost
}

function parseConfig(): MoodEvalConfig {
  const args = process.argv.slice(2);

  if (args[0] === '--help') {
    console.log(`
REM Mood Update Evaluation — simulate mood drift from ghost memories.

Usage:
  npx tsx scripts/rem-mood-eval.ts [user_id] [options]

Options:
  --collection-type <type>  Collection type (default: users)
  --cycles <n>              Number of simulated REM cycles (default: 10)
  --batch <n>               Memories processed per cycle (default: 5)
  --decay <n>               Synthetic pressure decay rate (default: 0.15)
  --magnitude <n>           Pressure magnitude scale factor (default: 0.3)
  --limit <n>               Max memories per ghost (default: 50)
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
    cycles: parseInt(getArg('--cycles') ?? '10', 10),
    batchSize: parseInt(getArg('--batch') ?? '5', 10),
    decayRate: parseFloat(getArg('--decay') ?? '0.15'),
    magnitudeScale: parseFloat(getArg('--magnitude') ?? '0.3'),
    limit: parseInt(getArg('--limit') ?? '50', 10),
  };
}

// ─── Types ───────────────────────────────────────────────────────────────

interface GhostMemory {
  id: string;
  content: string;
  feel_valence: number;
  feel_arousal: number;
  feel_dominance: number;
  feel_coherence_tension: number;
  functional_agency: number;
  functional_social_weight: number;
}

interface CycleSnapshot {
  cycle: number;
  state: MoodState;
  pressureCount: number;
  significantChange: boolean;
  thresholdFlags: ThresholdFlag[];
  memoriesProcessed: number;
}

interface GhostResult {
  ghostId: string;
  ghostLabel: string;
  memoryCount: number;
  snapshots: CycleSnapshot[];
  finalState: MoodState;
  totalThresholdFlags: ThresholdFlag[];
}

// ─── Pressure Synthesis ─────────────────────────────────────────────────

/**
 * Convert a ghost memory's emotional dimensions into synthetic pressures.
 * Delegates to the core library's synthesizePressuresFromDimensions() which
 * uses tuned DIMENSION_MOOD_MAPPINGS (centers, inversion, labels).
 */
function synthesizePressures(
  mem: GhostMemory,
  scale: number,
  decayRate: number,
): Pressure[] {
  return synthesizePressuresFromDimensions(
    mem.id,
    {
      feel_valence: mem.feel_valence,
      feel_arousal: mem.feel_arousal,
      feel_dominance: mem.feel_dominance,
      feel_coherence_tension: mem.feel_coherence_tension,
      functional_agency: mem.functional_agency,
      functional_social_weight: mem.functional_social_weight,
    },
    scale,
    decayRate,
  );
}

// ─── Main ────────────────────────────────────────────────────────────────

async function run() {
  const config = parseConfig();

  if (!process.env.WEAVIATE_REST_URL) {
    console.error('Error: WEAVIATE_REST_URL environment variable required');
    process.exit(1);
  }

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  REM Mood Update Evaluation — Ghost Mood Drift      ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`  User:       ${config.userId}`);
  console.log(`  Collection: Memory_${config.collectionType}_${config.userId}`);
  console.log(`  Cycles:     ${config.cycles}`);
  console.log(`  Batch size: ${config.batchSize} memories/cycle`);
  console.log(`  Decay rate: ${config.decayRate}`);
  console.log(`  Magnitude:  ${config.magnitudeScale}`);
  console.log(`  Limit:      ${config.limit}/ghost`);
  console.log(`  Drift rate: ${(LEARNING_RATE * (1 - INERTIA)).toFixed(3)} (lr=${LEARNING_RATE} × (1-inertia=${INERTIA}))\n`);

  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_EMBEDDINGS_API_KEY,
  });

  const collectionId = `Memory_${config.collectionType}_${config.userId}`;
  const collection = client.collections.get(collectionId);

  // Discover ghost IDs
  console.log(`  Discovering ghosts...`);
  const ghostResult = await collection.query.fetchObjects({
    filters: collection.filter.byProperty('doc_type').equal('ghost'),
    limit: 200,
    returnProperties: ['tags', 'content'],
  });

  // Also fetch ghost memories by content_type
  const ghostMemResult = await collection.query.fetchObjects({
    filters: collection.filter.byProperty('content_type').equal('ghost'),
    limit: 200,
    returnProperties: ['tags'],
  });

  // Extract unique ghost_owner tags
  const ghostOwnerIds = new Set<string>();
  for (const obj of [...(ghostResult.objects ?? []), ...(ghostMemResult.objects ?? [])]) {
    const tags: string[] = (obj.properties as any).tags ?? [];
    for (const tag of tags) {
      if (tag.startsWith('ghost_owner:')) {
        ghostOwnerIds.add(tag);
      }
    }
  }

  if (ghostOwnerIds.size === 0) {
    console.error('  No ghost memories found');
    process.exit(1);
  }

  const ghostIds = Array.from(ghostOwnerIds).sort();
  console.log(`  Found ${ghostIds.length} ghosts: ${ghostIds.join(', ')}\n`);

  // Process each ghost
  const results: GhostResult[] = [];

  for (const ghostId of ghostIds) {
    const label = ghostId.replace('ghost_owner:', '');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Ghost: ${label}\n`);

    // Fetch memories for this ghost
    const memResult = await collection.query.fetchObjects({
      filters: collection.filter.byProperty('tags').containsAny([ghostId]),
      limit: config.limit,
      returnProperties: [
        'content', 'feel_valence', 'feel_arousal', 'feel_dominance',
        'feel_coherence_tension', 'functional_agency', 'functional_social_weight',
        'deleted_at',
      ],
    });

    const memories: GhostMemory[] = (memResult.objects ?? [])
      .filter((m: any) => !(m.properties as any).deleted_at)
      .map((m: any) => ({
        id: (m as any).uuid ?? (m as any).id,
        content: (m.properties as any).content ?? '',
        feel_valence: (m.properties as any).feel_valence ?? 0.5,
        feel_arousal: (m.properties as any).feel_arousal ?? 0.5,
        feel_dominance: (m.properties as any).feel_dominance ?? 0.5,
        feel_coherence_tension: (m.properties as any).feel_coherence_tension ?? 0,
        functional_agency: (m.properties as any).functional_agency ?? 0.5,
        functional_social_weight: (m.properties as any).functional_social_weight ?? 0.1,
      }));

    console.log(`  Memories: ${memories.length}`);

    if (memories.length === 0) {
      console.log(`  No memories found for this ghost\n`);
      continue;
    }

    // Print emotional dimension averages for this ghost
    const avgValence = avg(memories.map(m => m.feel_valence));
    const avgArousal = avg(memories.map(m => m.feel_arousal));
    const avgDominance = avg(memories.map(m => m.feel_dominance));
    const avgTension = avg(memories.map(m => m.feel_coherence_tension));
    const avgAgency = avg(memories.map(m => m.functional_agency));
    const avgSocial = avg(memories.map(m => m.functional_social_weight));

    console.log(`  Avg dimensions: val=${avgValence.toFixed(2)} aro=${avgArousal.toFixed(2)} dom=${avgDominance.toFixed(2)} ten=${avgTension.toFixed(2)} age=${avgAgency.toFixed(2)} soc=${avgSocial.toFixed(2)}`);

    // Simulate REM cycles
    let mood: CoreMoodMemory = createInitialMood(config.userId);
    const snapshots: CycleSnapshot[] = [];
    const allThresholdFlags: ThresholdFlag[] = [];
    let memIdx = 0;

    // Initial snapshot
    snapshots.push({
      cycle: 0,
      state: { ...mood.state },
      pressureCount: 0,
      significantChange: false,
      thresholdFlags: [],
      memoriesProcessed: 0,
    });

    for (let cycle = 1; cycle <= config.cycles; cycle++) {
      // Select batch of memories for this cycle (wrap around if needed)
      const batch: GhostMemory[] = [];
      for (let i = 0; i < config.batchSize && memories.length > 0; i++) {
        batch.push(memories[memIdx % memories.length]);
        memIdx++;
      }

      // Convert to pressures and add to mood
      for (const mem of batch) {
        const pressures = synthesizePressures(mem, config.magnitudeScale, config.decayRate);
        mood.pressures.push(...pressures);
      }

      // Run mood update
      const result = runMoodUpdate(mood);

      // Apply results
      mood.state = result.newState;
      mood.pressures = result.decayedPressures;
      mood.rem_cycles_since_shift = result.remCyclesSinceShift;

      snapshots.push({
        cycle,
        state: { ...result.newState },
        pressureCount: result.decayedPressures.length,
        significantChange: result.significantChange,
        thresholdFlags: result.thresholdFlags,
        memoriesProcessed: batch.length,
      });

      allThresholdFlags.push(...result.thresholdFlags);
    }

    results.push({
      ghostId,
      ghostLabel: label,
      memoryCount: memories.length,
      snapshots,
      finalState: { ...mood.state },
      totalThresholdFlags: allThresholdFlags,
    });

    // Print cycle trajectory
    printTrajectory(snapshots);
    console.log();
  }

  // Cross-ghost comparison
  printComparison(results);
  printThresholdSummary(results);
  printTuningGuide(config);
}

// ─── Output Helpers ──────────────────────────────────────────────────────

function printTrajectory(snapshots: CycleSnapshot[]) {
  console.log(`\n  Cycle  val     aro     conf    warm    cohr    trust   pres  sig`);
  console.log(`  ─────  ──────  ──────  ──────  ──────  ──────  ──────  ────  ───`);

  for (const s of snapshots) {
    const sig = s.significantChange ? '***' : '';
    const flags = s.thresholdFlags.length > 0
      ? ` [${s.thresholdFlags.map(f => f.name).join(', ')}]`
      : '';
    console.log(
      `  ${String(s.cycle).padStart(5)}  ` +
      `${fmtDim(s.state.valence, true)}  ` +
      `${fmtDim(s.state.arousal)}  ` +
      `${fmtDim(s.state.confidence)}  ` +
      `${fmtDim(s.state.social_warmth)}  ` +
      `${fmtDim(s.state.coherence)}  ` +
      `${fmtDim(s.state.trust)}  ` +
      `${String(s.pressureCount).padStart(4)}  ` +
      `${sig}${flags}`,
    );
  }
}

function printComparison(results: GhostResult[]) {
  if (results.length < 2) return;

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Cross-Ghost Comparison (Final State)\n`);
  console.log(`  Ghost                          val     aro     conf    warm    cohr    trust   mems`);
  console.log(`  ─────                          ──────  ──────  ──────  ──────  ──────  ──────  ────`);

  for (const r of results) {
    const s = r.finalState;
    console.log(
      `  ${r.ghostLabel.padEnd(30)} ` +
      `${fmtDim(s.valence, true)}  ` +
      `${fmtDim(s.arousal)}  ` +
      `${fmtDim(s.confidence)}  ` +
      `${fmtDim(s.social_warmth)}  ` +
      `${fmtDim(s.coherence)}  ` +
      `${fmtDim(s.trust)}  ` +
      `${String(r.memoryCount).padStart(4)}`,
    );
  }

  // Divergence analysis
  if (results.length >= 2) {
    const dims: (keyof MoodState)[] = ['valence', 'arousal', 'confidence', 'social_warmth', 'coherence', 'trust'];
    console.log(`\n  Dimension divergence (max - min across ghosts):`);
    for (const dim of dims) {
      const values = results.map(r => r.finalState[dim]);
      const spread = Math.max(...values) - Math.min(...values);
      const bar = '#'.repeat(Math.round(spread * 50));
      console.log(`    ${dim.padEnd(15)} ${spread.toFixed(3)} ${bar}`);
    }
  }
  console.log();
}

function printThresholdSummary(results: GhostResult[]) {
  const anyFlags = results.some(r => r.totalThresholdFlags.length > 0);

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Threshold Flags\n`);

  if (!anyFlags) {
    console.log(`  No threshold flags triggered during simulation.`);
    console.log(`  Thresholds checked:`);
    for (const [name, def] of Object.entries(THRESHOLDS)) {
      console.log(`    ${name}: ${def.dimension} ${def.op} ${def.value} (for ${def.cycles} cycles)`);
    }
  } else {
    for (const r of results) {
      if (r.totalThresholdFlags.length > 0) {
        console.log(`  ${r.ghostLabel}:`);
        for (const f of r.totalThresholdFlags) {
          console.log(`    [!] ${f.name}: ${f.dimension}=${f.value.toFixed(3)} (${f.cycles} cycles)`);
        }
      }
    }
  }
  console.log();
}

function printTuningGuide(config: MoodEvalConfig) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Tuning Guide\n`);
  console.log(`  Effective drift rate: ${(LEARNING_RATE * (1 - INERTIA)).toFixed(3)} per unit pressure per cycle`);
  console.log(`  Pressure magnitude:  ±${config.magnitudeScale.toFixed(2)} (scale factor)`);
  console.log(`  Net drift per mem:   ~±${(config.magnitudeScale * LEARNING_RATE * (1 - INERTIA)).toFixed(4)} per dimension`);
  console.log(`  Net drift per cycle: ~±${(config.batchSize * config.magnitudeScale * LEARNING_RATE * (1 - INERTIA)).toFixed(4)} (${config.batchSize} mems)`);
  console.log(`  Pressure decay:      ${config.decayRate} per cycle (half-life: ~${Math.ceil(Math.log(0.5) / Math.log(1 - config.decayRate))} cycles)`);
  console.log(`\n  To increase mood sensitivity:  --magnitude 0.5 or --decay 0.05`);
  console.log(`  To decrease mood sensitivity:  --magnitude 0.1 or --decay 0.3`);
  console.log(`  To see longer drift:           --cycles 30 --batch 3`);
  console.log(`  To see faster convergence:     --cycles 5 --batch 10\n`);
}

function fmtDim(value: number, signed = false): string {
  const s = signed
    ? (value >= 0 ? '+' : '') + value.toFixed(3)
    : value.toFixed(3);
  return s.padStart(6);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
