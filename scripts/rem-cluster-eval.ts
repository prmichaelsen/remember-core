/**
 * REM Cluster Evaluation Test Script
 *
 * Runs predefined scenarios against the real LLM to measure confidence scores.
 * Use this to tune the cluster_confidence_threshold without running full REM cycles.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx ts-node scripts/rem-cluster-eval.ts
 *   ANTHROPIC_API_KEY=sk-... npx ts-node scripts/rem-cluster-eval.ts --model claude-haiku-4-5-20251001
 *   ANTHROPIC_API_KEY=sk-... npx ts-node scripts/rem-cluster-eval.ts --scenario strong
 */

import { createHaikuClient, type HaikuValidationInput, type ClusterEvalResult } from '../src/services/rem.haiku.js';

// ─── Scenarios ──────────────────────────────────────────────────────────────

interface Scenario {
  name: string;
  description: string;
  expected: 'high' | 'medium' | 'low' | 'reject';  // Expected confidence band
  memories: HaikuValidationInput['memories'];
}

const scenarios: Scenario[] = [
  // ── Strong clusters (expect high confidence 0.8+) ──
  {
    name: 'strong-same-topic',
    description: 'All memories about the same dog',
    expected: 'high',
    memories: [
      { id: 'm1', content: 'Took Luna to the vet today, she needs her annual shots', tags: ['dogs', 'luna'] },
      { id: 'm2', content: 'Luna learned to shake hands! Best girl', tags: ['dogs', 'luna', 'training'] },
      { id: 'm3', content: 'Ordered new dog food for Luna - grain free this time', tags: ['dogs', 'luna'] },
      { id: 'm4', content: 'Luna and I went on a hike at Silver Falls, she loved the water', tags: ['dogs', 'luna', 'hiking'] },
    ],
  },
  {
    name: 'strong-same-project',
    description: 'All memories about the same coding project',
    expected: 'high',
    memories: [
      { id: 'm1', content: 'Started building the REST API for the recipe app', tags: ['coding', 'recipes'] },
      { id: 'm2', content: 'Added authentication to the recipe API using JWT', tags: ['coding', 'auth'] },
      { id: 'm3', content: 'Deployed the recipe app to production on Cloud Run', tags: ['coding', 'deploy'] },
      { id: 'm4', content: 'Fixed a bug where recipe search returned duplicates', tags: ['coding', 'bugfix'] },
    ],
  },
  {
    name: 'strong-same-trip',
    description: 'All memories from the same vacation',
    expected: 'high',
    memories: [
      { id: 'm1', content: 'Arrived in Tokyo! The Shinkansen from the airport was amazing', tags: ['travel', 'japan'] },
      { id: 'm2', content: 'Visited Senso-ji temple in Asakusa, incredibly peaceful', tags: ['travel', 'japan'] },
      { id: 'm3', content: 'Best ramen of my life at a tiny shop in Shinjuku', tags: ['travel', 'japan', 'food'] },
      { id: 'm4', content: 'Day trip to Hakone, Mount Fuji was visible from the lake', tags: ['travel', 'japan'] },
    ],
  },

  // ── Medium clusters (expect medium confidence 0.5-0.79) ──
  {
    name: 'medium-broad-theme',
    description: 'All about food but different contexts',
    expected: 'medium',
    memories: [
      { id: 'm1', content: 'Made sourdough bread from scratch, took all day but worth it', tags: ['cooking'] },
      { id: 'm2', content: 'Found an amazing Thai restaurant downtown, pad see ew was perfect', tags: ['restaurants'] },
      { id: 'm3', content: 'Watched a documentary about the history of chocolate production', tags: ['documentary'] },
      { id: 'm4', content: 'Grocery shopping tips: buy seasonal produce for better prices', tags: ['tips'] },
    ],
  },
  {
    name: 'medium-tangential',
    description: 'Related through a person but different activities',
    expected: 'medium',
    memories: [
      { id: 'm1', content: 'Had coffee with Sarah at the new cafe on 5th', tags: ['social', 'sarah'] },
      { id: 'm2', content: 'Sarah recommended a great book about stoicism', tags: ['books', 'sarah'] },
      { id: 'm3', content: 'Ran into Sarah at the grocery store, she just got promoted', tags: ['social', 'sarah'] },
      { id: 'm4', content: 'Sarah\'s birthday is next month, need to plan something', tags: ['planning', 'sarah'] },
    ],
  },

  // ── Weak clusters (expect low confidence 0.3-0.49) ──
  {
    name: 'weak-loose-connection',
    description: 'Only vaguely connected through "things I did today"',
    expected: 'low',
    memories: [
      { id: 'm1', content: 'Need to fix the leaky faucet in the bathroom', tags: ['home'] },
      { id: 'm2', content: 'Read an interesting article about quantum computing', tags: ['science'] },
      { id: 'm3', content: 'Called mom to check in, she sounded happy', tags: ['family'] },
      { id: 'm4', content: 'Renewed my gym membership for another year', tags: ['fitness'] },
    ],
  },

  // ── Should reject (expect very low confidence < 0.3) ──
  {
    name: 'reject-unrelated',
    description: 'Completely unrelated memories',
    expected: 'reject',
    memories: [
      { id: 'm1', content: 'The square root of 144 is 12', tags: ['math'] },
      { id: 'm2', content: 'Penguins can hold their breath for up to 20 minutes', tags: ['animals'] },
      { id: 'm3', content: 'The Eiffel Tower was built in 1889', tags: ['history'] },
      { id: 'm4', content: 'CSS grid is better than flexbox for 2D layouts', tags: ['coding'] },
    ],
  },

  // ── Mixed clusters (should produce sub-clusters) ──
  {
    name: 'mixed-two-topics',
    description: 'Two distinct groups mixed together',
    expected: 'low',
    memories: [
      { id: 'm1', content: 'My dog Luna caught a squirrel at the park', tags: ['dogs'] },
      { id: 'm2', content: 'Luna had her teeth cleaned at the vet', tags: ['dogs'] },
      { id: 'm3', content: 'Finally finished reading Dune, what an ending', tags: ['books'] },
      { id: 'm4', content: 'Started reading the Dune sequel Messiah', tags: ['books'] },
      { id: 'm5', content: 'Luna is afraid of the vacuum cleaner', tags: ['dogs'] },
    ],
  },
  {
    name: 'mixed-three-topics',
    description: 'Three distinct groups: recipes, workouts, movies',
    expected: 'reject',
    memories: [
      { id: 'm1', content: 'Made chicken tikka masala from scratch', tags: ['cooking'] },
      { id: 'm2', content: 'Tried a new chili recipe with smoked paprika', tags: ['cooking'] },
      { id: 'm3', content: 'Ran 5 miles in 42 minutes, new PR', tags: ['fitness'] },
      { id: 'm4', content: 'Did 100 pushups challenge today', tags: ['fitness'] },
      { id: 'm5', content: 'Watched Oppenheimer, Cillian Murphy was incredible', tags: ['movies'] },
      { id: 'm6', content: 'Rewatched Inception, still holds up', tags: ['movies'] },
    ],
  },

  // ── Edge cases ──
  {
    name: 'edge-duplicates',
    description: 'Near-duplicate content',
    expected: 'high',
    memories: [
      { id: 'm1', content: 'Meeting notes: discussed Q4 roadmap with engineering team', tags: ['work'] },
      { id: 'm2', content: 'Q4 roadmap meeting - decided to prioritize auth refactor', tags: ['work'] },
      { id: 'm3', content: 'Notes from engineering sync: Q4 roadmap finalized, auth first', tags: ['work'] },
    ],
  },
  {
    name: 'edge-creative',
    description: 'Poems/creative writing that share style',
    expected: 'high',
    memories: [
      { id: 'm1', content: 'The autumn leaves fall soft and slow / painting gold on paths below', tags: ['poetry'] },
      { id: 'm2', content: 'Winter winds that bite and sting / promising the hope of spring', tags: ['poetry'] },
      { id: 'm3', content: 'Summer sun on lazy days / lost in warm and gentle haze', tags: ['poetry'] },
    ],
  },
  {
    name: 'edge-minimal-pair',
    description: 'Just 2 memories, borderline related',
    expected: 'medium',
    memories: [
      { id: 'm1', content: 'Learned about React Server Components today', tags: ['coding'] },
      { id: 'm2', content: 'Next.js 15 has built-in support for server components', tags: ['coding'] },
    ],
  },
];

// ─── Runner ─────────────────────────────────────────────────────────────────

function getExpectedRange(expected: Scenario['expected']): [number, number] {
  switch (expected) {
    case 'high': return [0.8, 1.0];
    case 'medium': return [0.5, 0.79];
    case 'low': return [0.3, 0.49];
    case 'reject': return [0.0, 0.29];
  }
}

function formatConfidence(confidence: number, expected: Scenario['expected']): string {
  const [lo, hi] = getExpectedRange(expected);
  const inRange = confidence >= lo && confidence <= hi;
  const marker = inRange ? '✓' : '✗';
  return `${marker} ${confidence.toFixed(2)} (expected ${expected}: ${lo.toFixed(1)}-${hi.toFixed(1)})`;
}

async function run() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable required');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const modelIdx = args.indexOf('--model');
  const model = modelIdx !== -1 ? args[modelIdx + 1] : undefined;

  const scenarioIdx = args.indexOf('--scenario');
  const scenarioFilter = scenarioIdx !== -1 ? args[scenarioIdx + 1] : undefined;

  const client = createHaikuClient({ apiKey, model });
  const modelName = model ?? 'claude-sonnet-4-5-20250929 (default)';

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  REM Cluster Evaluation — Confidence Score Tuning    ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`  Model: ${modelName}`);
  console.log(`  Scenarios: ${scenarioFilter ?? 'all'}\n`);

  const filteredScenarios = scenarioFilter
    ? scenarios.filter((s) => s.name.includes(scenarioFilter) || s.expected === scenarioFilter)
    : scenarios;

  if (filteredScenarios.length === 0) {
    console.error(`No scenarios matching "${scenarioFilter}"`);
    console.log('Available:', scenarios.map((s) => s.name).join(', '));
    process.exit(1);
  }

  const results: Array<{ scenario: Scenario; result: ClusterEvalResult; inRange: boolean }> = [];

  for (const scenario of filteredScenarios) {
    process.stdout.write(`  ${scenario.name} ... `);

    const result = await client.evaluateCluster({ memories: scenario.memories });
    const [lo, hi] = getExpectedRange(scenario.expected);
    const inRange = result.confidence >= lo && result.confidence <= hi;
    results.push({ scenario, result, inRange });

    console.log(formatConfidence(result.confidence, scenario.expected));
    console.log(`    "${result.observation}"`);
    console.log(`    Reasoning: ${result.reasoning}`);
    if (result.sub_clusters?.length) {
      console.log(`    Sub-clusters: ${result.sub_clusters.length}`);
      for (const sc of result.sub_clusters) {
        console.log(`      - ${sc.observation} (conf: ${sc.confidence.toFixed(2)}, ${sc.memory_ids.length} memories)`);
      }
    }
    console.log();
  }

  // ── Summary ──
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n  Summary\n`);

  const inRangeCount = results.filter((r) => r.inRange).length;
  console.log(`  Accuracy: ${inRangeCount}/${results.length} in expected range\n`);

  // Threshold analysis
  const thresholds = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  console.log('  Threshold analysis (would-accept / should-accept):');
  for (const t of thresholds) {
    const accepted = results.filter((r) => r.result.confidence >= t);
    const shouldAccept = results.filter((r) => r.scenario.expected === 'high' || r.scenario.expected === 'medium');
    const truePositives = accepted.filter((r) => r.scenario.expected === 'high' || r.scenario.expected === 'medium');
    const falsePositives = accepted.filter((r) => r.scenario.expected === 'low' || r.scenario.expected === 'reject');
    const falseNegatives = shouldAccept.filter((r) => r.result.confidence < t);
    console.log(`    threshold=${t.toFixed(1)}: accept ${accepted.length}/${results.length} | TP=${truePositives.length} FP=${falsePositives.length} FN=${falseNegatives.length}`);
  }

  // Raw scores table
  console.log('\n  Raw scores:');
  for (const r of results) {
    const marker = r.inRange ? '✓' : '✗';
    console.log(`    ${marker} ${r.result.confidence.toFixed(2)}  ${r.scenario.name.padEnd(25)} (expected: ${r.scenario.expected})`);
  }

  console.log();
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
