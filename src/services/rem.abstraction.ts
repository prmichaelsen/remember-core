/**
 * REM Phase 3: Abstraction — Episodic to Semantic Memory Promotion.
 *
 * Detects recurring patterns in episodic memories and creates synthesized
 * semantic memories with content_type 'rem'. These are linked to source
 * memories via 'abstraction' relationships, excluded from default search,
 * and visible only in a dedicated "rem" tab.
 */

import type { Logger } from '../utils/logger.js';
import type { SubLlmProvider } from './emotional-scoring.service.js';

// ─── Types ────────────────────────────────────────────────────────────────

export type AbstractionType = 'recurring_pattern' | 'thematic_collection' | 'identity_synthesis';

export interface AbstractionCandidate {
  source_memory_ids: string[];
  source_contents: string[];
  emotional_summary: Record<string, number>;
}

export interface SynthesisResult {
  content: string;
  observation: string;
  abstraction_type: AbstractionType;
}

export interface AbstractionPhaseResult {
  abstractions_created: number;
  candidates_found: number;
  candidates_skipped: number;
}

export interface AbstractionConfig {
  min_cluster_size: number;
  similarity_threshold: number;
}

export const DEFAULT_ABSTRACTION_CONFIG: AbstractionConfig = {
  min_cluster_size: 5,
  similarity_threshold: 0.8,
};

export interface AbstractionDeps {
  subLlm: SubLlmProvider;
  config?: Partial<AbstractionConfig>;
  logger?: Logger;
}

// ─── Pattern Detection ───────────────────────────────────────────────────

/**
 * Detect abstraction candidates from relationship clusters.
 * A cluster is a candidate if it has enough members and hasn't been abstracted.
 */
export function detectAbstractionCandidates(
  clusters: Array<{
    memory_ids: string[];
    memories: Array<{ id: string; content: string; properties?: Record<string, any> }>;
    avg_similarity: number;
  }>,
  existingAbstractionSourceIds: Set<string>,
  config: AbstractionConfig,
): AbstractionCandidate[] {
  const candidates: AbstractionCandidate[] = [];

  for (const cluster of clusters) {
    // Skip clusters below minimum size
    if (cluster.memory_ids.length < config.min_cluster_size) continue;

    // Skip clusters below similarity threshold
    if (cluster.avg_similarity < config.similarity_threshold) continue;

    // Skip if already abstracted (all source IDs already in an abstraction)
    const alreadyAbstracted = cluster.memory_ids.every(id => existingAbstractionSourceIds.has(id));
    if (alreadyAbstracted) continue;

    // Build emotional summary from available properties
    const emotionalSummary: Record<string, number> = {};
    let emotionCount = 0;
    for (const mem of cluster.memories) {
      if (mem.properties) {
        for (const [key, val] of Object.entries(mem.properties)) {
          if ((key.startsWith('feel_') || key.startsWith('functional_')) && typeof val === 'number') {
            emotionalSummary[key] = (emotionalSummary[key] ?? 0) + val;
            emotionCount++;
          }
        }
      }
    }
    // Average the scores
    if (emotionCount > 0) {
      const memCount = cluster.memories.length;
      for (const key of Object.keys(emotionalSummary)) {
        emotionalSummary[key] = emotionalSummary[key] / memCount;
      }
    }

    candidates.push({
      source_memory_ids: cluster.memory_ids,
      source_contents: cluster.memories.map(m => m.content),
      emotional_summary: emotionalSummary,
    });
  }

  return candidates;
}

// ─── Haiku Synthesis ─────────────────────────────────────────────────────

/**
 * Build the prompt for Haiku to synthesize a semantic abstraction.
 */
export function buildAbstractionPrompt(candidate: AbstractionCandidate): string {
  const contentList = candidate.source_contents
    .map((c, i) => `${i + 1}. ${c.slice(0, 200)}`)
    .join('\n');

  const emotionSummary = Object.entries(candidate.emotional_summary)
    .filter(([, v]) => v > 0.3)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
    .join(', ');

  return `You are analyzing a cluster of ${candidate.source_memory_ids.length} related memories to create a concise semantic abstraction.

SOURCE MEMORIES:
${contentList}

${emotionSummary ? `EMOTIONAL PROFILE: ${emotionSummary}` : ''}

Create a synthesis that captures the recurring pattern, theme, or identity evolution across these memories. Include temporal references where relevant.

Respond with ONLY valid JSON:
{
  "content": "A title-like summary sentence (1-2 sentences) capturing the pattern",
  "observation": "A brief observation about what this pattern reveals",
  "abstraction_type": "recurring_pattern" | "thematic_collection" | "identity_synthesis"
}

Guidelines:
- "recurring_pattern": repeated events or behaviors (e.g., "Pre-meeting anxiety that resolves after")
- "thematic_collection": grouped by shared theme (e.g., "Collection exploring impermanence")
- "identity_synthesis": evolution of identity/values (e.g., "Vegetarian identity: committed since...")`;
}

/**
 * Call Haiku to generate a synthesis for an abstraction candidate.
 */
export async function synthesizeAbstraction(
  candidate: AbstractionCandidate,
  subLlm: SubLlmProvider,
  logger?: Logger,
): Promise<SynthesisResult | null> {
  try {
    const prompt = buildAbstractionPrompt(candidate);
    const response = await subLlm.score(prompt);
    const parsed = JSON.parse(response.trim());

    if (!parsed.content || !parsed.observation || !parsed.abstraction_type) {
      logger?.warn?.('[Abstraction] Haiku returned incomplete synthesis');
      return null;
    }

    const validTypes: AbstractionType[] = ['recurring_pattern', 'thematic_collection', 'identity_synthesis'];
    if (!validTypes.includes(parsed.abstraction_type)) {
      parsed.abstraction_type = 'recurring_pattern';
    }

    return {
      content: parsed.content,
      observation: parsed.observation,
      abstraction_type: parsed.abstraction_type,
    };
  } catch (err) {
    logger?.warn?.(`[Abstraction] Synthesis failed: ${err}`);
    return null;
  }
}

// ─── Phase Execution ─────────────────────────────────────────────────────

/**
 * Run the full abstraction phase.
 * Caller is responsible for:
 * - Providing clusters (from REM clustering phase)
 * - Querying existing abstractions to get existingAbstractionSourceIds
 * - Creating memories and relationships from the returned results
 */
export async function runAbstractionPhase(
  clusters: Array<{
    memory_ids: string[];
    memories: Array<{ id: string; content: string; properties?: Record<string, any> }>;
    avg_similarity: number;
  }>,
  existingAbstractionSourceIds: Set<string>,
  deps: AbstractionDeps,
): Promise<{ results: Array<{ synthesis: SynthesisResult; candidate: AbstractionCandidate }>; stats: AbstractionPhaseResult }> {
  const config = { ...DEFAULT_ABSTRACTION_CONFIG, ...deps.config };
  const logger = deps.logger;

  const stats: AbstractionPhaseResult = {
    abstractions_created: 0,
    candidates_found: 0,
    candidates_skipped: 0,
  };

  // 1. Detect candidates
  const candidates = detectAbstractionCandidates(clusters, existingAbstractionSourceIds, config);
  stats.candidates_found = candidates.length;

  if (candidates.length === 0) {
    logger?.debug?.('[Abstraction] No candidates for abstraction');
    return { results: [], stats };
  }

  logger?.info?.(`[Abstraction] Found ${candidates.length} candidates`);

  // 2. Synthesize each candidate
  const results: Array<{ synthesis: SynthesisResult; candidate: AbstractionCandidate }> = [];

  for (const candidate of candidates) {
    const synthesis = await synthesizeAbstraction(candidate, deps.subLlm, logger);
    if (!synthesis) {
      stats.candidates_skipped++;
      continue;
    }

    results.push({ synthesis, candidate });
    stats.abstractions_created++;
  }

  logger?.info?.(`[Abstraction] Created ${stats.abstractions_created} abstractions, skipped ${stats.candidates_skipped}`);

  return { results, stats };
}
