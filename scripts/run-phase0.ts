/**
 * Run REM Phase 0 — Emotional Scoring
 *
 * Standalone script that runs Phase 0 (Haiku emotional scoring) on unscored
 * memories in a collection. Useful after seeding new memories.
 *
 * Usage:
 *   (set -a && source .env.e1.local && npx tsx scripts/run-phase0.ts)
 *   (set -a && source .env.e1.local && npx tsx scripts/run-phase0.ts --batch 100 --cost-cap 10)
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';
import { runPhase0, type Phase0Config } from '../src/services/rem-phase0.scoring.js';
import { EmotionalScoringService, createAnthropicSubLlm } from '../src/services/emotional-scoring.service.js';
import { ScoringContextService } from '../src/services/scoring-context.service.js';

// ─── Config ──────────────────────────────────────────────────────────────

interface RunConfig {
  userId: string;
  collectionType: string;
  batchSize: number;
  costCap: number;
}

function parseConfig(): RunConfig {
  const args = process.argv.slice(2);

  if (args[0] === '--help') {
    console.log(`
Run REM Phase 0 — score unscored memories with Haiku.

Usage:
  npx tsx scripts/run-phase0.ts [user_id] [options]

Options:
  --collection-type <type>  Collection type (default: users)
  --batch <n>               Batch size (default: 100)
  --cost-cap <n>            Max cost in dollars (default: 5.0)

Environment:
  WEAVIATE_REST_URL          Weaviate URL (required)
  WEAVIATE_API_KEY           Weaviate API key
  OPENAI_EMBEDDINGS_API_KEY  OpenAI key for embeddings
  ANTHROPIC_API_KEY          Anthropic key for Haiku scoring (required)
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
    batchSize: parseInt(getArg('--batch') ?? '100', 10),
    costCap: parseFloat(getArg('--cost-cap') ?? '5.0'),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function run() {
  const config = parseConfig();

  if (!process.env.WEAVIATE_REST_URL) {
    console.error('Error: WEAVIATE_REST_URL environment variable required');
    process.exit(1);
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable required');
    process.exit(1);
  }

  const collectionId = `Memory_${config.collectionType}_${config.userId}`;

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  REM Phase 0 — Emotional Scoring                    ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`  User:       ${config.userId}`);
  console.log(`  Collection: ${collectionId}`);
  console.log(`  Batch size: ${config.batchSize}`);
  console.log(`  Cost cap:   $${config.costCap.toFixed(2)}`);
  console.log();

  // Connect to Weaviate
  const client = await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_EMBEDDINGS_API_KEY,
  });

  const collection = client.collections.get(collectionId);

  // Create services
  const subLlm = createAnthropicSubLlm({ apiKey: anthropicApiKey });
  const emotionalScoringService = new EmotionalScoringService({ subLlm });
  const scoringContextService = new ScoringContextService();

  const phase0Config: Partial<Phase0Config> = {
    batch_size: config.batchSize,
    cost_cap: config.costCap,
  };

  console.log(`  Running Phase 0...\n`);

  const result = await runPhase0(collection, collectionId, {
    emotionalScoringService,
    scoringContextService,
    config: phase0Config,
    logger: console,
  });

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Results`);
  console.log();
  console.log(`  Memories scored:  ${result.memories_scored}`);
  console.log(`  Memories skipped: ${result.memories_skipped}`);
  console.log(`  Dimensions scored: ${result.dimensions_scored}`);
  console.log(`  Cost consumed:    $${result.cost_consumed.toFixed(4)}`);
  console.log(`  Stopped by cap:   ${result.stopped_by_cap}`);
  console.log();
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
