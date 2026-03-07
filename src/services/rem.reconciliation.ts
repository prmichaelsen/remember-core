/**
 * REM Phase 5 — Reconciliation (Coherence Tension Resolution).
 *
 * Identifies memories with high `feel_coherence_tension`, finds conflicting
 * memory pairs, generates neutral reconciliation observations via Haiku,
 * and creates REM observation memories linking the conflicts.
 *
 * High coherence_tension memories resist pruning until tension resolves.
 */

import { Filters } from 'weaviate-client';
import type { Logger } from '../utils/logger.js';
import { COHERENCE_TENSION_THRESHOLD } from './rem.constants.js';
import type { SubLlmProvider } from './emotional-scoring.service.js';

// ─── Constants ───────────────────────────────────────────────────────────

/** Default max reconciliation candidates per cycle. */
export const DEFAULT_MAX_RECONCILIATION_CANDIDATES = 20;

/** Minimum vector similarity for conflict pair detection. */
export const CONFLICT_SIMILARITY_THRESHOLD = 0.75;

// ─── Types ───────────────────────────────────────────────────────────────

export interface ReconciliationConfig {
  max_reconciliation_candidates: number;
}

export const DEFAULT_RECONCILIATION_CONFIG: ReconciliationConfig = {
  max_reconciliation_candidates: DEFAULT_MAX_RECONCILIATION_CANDIDATES,
};

export type ConflictType =
  | 'valence_opposition'
  | 'factual_contradiction'
  | 'identity_conflict'
  | 'behavioral_inconsistency';

export interface ConflictPair {
  memory_a_id: string;
  memory_b_id: string;
  tension_score: number;
  conflict_type: ConflictType;
  memory_a_summary: string;
  memory_b_summary: string;
}

export interface ReconciliationResult {
  candidates_found: number;
  conflicts_detected: number;
  reconciliation_observations_created: number;
  memories_skipped: number;
}

export interface ReconciliationDeps {
  subLlm: SubLlmProvider;
  config?: Partial<ReconciliationConfig>;
  logger?: Logger;
}

// ─── Candidate Selection ─────────────────────────────────────────────────

/**
 * Query memories with high coherence tension for reconciliation.
 * Sorted by feel_coherence_tension descending (highest tension first).
 * Skips memories already processed in the current cycle.
 */
export async function selectReconciliationCandidates(
  collection: any,
  batchSize: number,
  currentCycleTimestamp?: string,
): Promise<Array<{ uuid: string; properties: Record<string, any> }>> {
  const filter = Filters.and(
    collection.filter.byProperty('doc_type').equal('memory'),
    collection.filter.byProperty('feel_coherence_tension').greaterOrEqual(COHERENCE_TENSION_THRESHOLD),
    collection.filter.byProperty('deleted_at').isNull(true),
  );

  const result = await collection.query.fetchObjects({
    filters: filter,
    limit: batchSize,
    sort: collection.sort.byProperty('feel_coherence_tension', false), // descending
  });

  // Filter out memories already processed in this cycle
  if (currentCycleTimestamp) {
    return result.objects.filter((obj: any) => {
      const touchedAt = obj.properties?.rem_touched_at;
      return !touchedAt || touchedAt < currentCycleTimestamp;
    });
  }

  return result.objects;
}

// ─── Conflict Detection ──────────────────────────────────────────────────

/**
 * Detect conflicting memory pairs for a high-tension memory.
 * Uses vector similarity to find topically similar memories with
 * opposing emotional signatures.
 */
export async function detectConflicts(
  collection: any,
  memory: { uuid: string; properties: Record<string, any> },
): Promise<ConflictPair[]> {
  const conflicts: ConflictPair[] = [];

  try {
    // Find similar memories via vector search
    const similarResult = await collection.query.nearObject(memory.uuid, {
      limit: 10,
      returnMetadata: ['distance'],
    });

    const memoryValence = memory.properties.feel_valence ?? 0;
    const memoryContent = memory.properties.content ?? '';
    const memoryContentType = memory.properties.content_type ?? 'text';

    for (const similar of similarResult.objects) {
      if (similar.uuid === memory.uuid) continue;

      const distance = similar.metadata?.distance ?? 1;
      const similarity = 1 - distance;

      // Must be topically similar
      if (similarity < CONFLICT_SIMILARITY_THRESHOLD) continue;

      const otherValence = similar.properties?.feel_valence ?? 0;
      const otherContent = similar.properties?.content ?? '';
      const otherContentType = similar.properties?.content_type ?? 'text';

      // Determine conflict type
      let conflictType: ConflictType | null = null;

      // Valence opposition: one positive, one negative (significant gap)
      if (Math.abs(memoryValence - otherValence) >= 0.5 &&
          ((memoryValence > 0 && otherValence < 0) || (memoryValence < 0 && otherValence > 0))) {
        conflictType = 'valence_opposition';
      }

      // Identity conflict: memory contradicts a REM abstraction
      if (otherContentType === 'rem' || memoryContentType === 'rem') {
        conflictType = 'identity_conflict';
      }

      if (conflictType) {
        conflicts.push({
          memory_a_id: memory.uuid,
          memory_b_id: similar.uuid,
          tension_score: memory.properties.feel_coherence_tension ?? 0,
          conflict_type: conflictType,
          memory_a_summary: typeof memoryContent === 'string' ? memoryContent.slice(0, 200) : '',
          memory_b_summary: typeof otherContent === 'string' ? otherContent.slice(0, 200) : '',
        });
      }
    }
  } catch (err) {
    // Swallow — conflict detection is best-effort
  }

  return conflicts;
}

// ─── Observation Generation ──────────────────────────────────────────────

/**
 * Build a Haiku prompt for generating a reconciliation observation.
 */
export function buildReconciliationPrompt(conflict: ConflictPair): string {
  return `You are generating a neutral, empathetic observation about a tension between two memories.

MEMORY A:
${conflict.memory_a_summary}

MEMORY B:
${conflict.memory_b_summary}

CONFLICT TYPE: ${conflict.conflict_type}
TENSION SCORE: ${conflict.tension_score.toFixed(2)}

Write a neutral, empathetic description of this conflict in 2-4 sentences. Include:
- What the tension is about
- Temporal context if apparent (which came first, any change over time)
- Possible interpretations (change of heart, exception vs pattern, etc.)

Do NOT give prescriptive advice. Surface the conflict, don't resolve it.

Return ONLY the observation text, no JSON or formatting.`;
}

/**
 * Generate a reconciliation observation via Haiku sub-LLM.
 */
export async function generateObservation(
  subLlm: SubLlmProvider,
  conflict: ConflictPair,
): Promise<string> {
  const prompt = buildReconciliationPrompt(conflict);
  const response = await subLlm.score(prompt, { maxTokens: 256 });
  return response.trim();
}

// ─── Phase Execution ─────────────────────────────────────────────────────

/**
 * Execute the reconciliation phase for a collection.
 * 1. Find high coherence_tension memories
 * 2. Detect conflict pairs
 * 3. Generate reconciliation observations via Haiku
 * 4. Create REM observation memories and relationships
 * 5. Update source memory observations
 */
export async function runReconciliationPhase(
  collection: any,
  deps: ReconciliationDeps,
  currentCycleTimestamp?: string,
): Promise<ReconciliationResult> {
  const cfg = { ...DEFAULT_RECONCILIATION_CONFIG, ...deps.config };
  const log: Logger = deps.logger ?? (console as any);

  const result: ReconciliationResult = {
    candidates_found: 0,
    conflicts_detected: 0,
    reconciliation_observations_created: 0,
    memories_skipped: 0,
  };

  // 1. Select high-tension candidates
  const candidates = await selectReconciliationCandidates(
    collection, cfg.max_reconciliation_candidates, currentCycleTimestamp,
  );
  result.candidates_found = candidates.length;

  if (candidates.length === 0) {
    log.debug?.('[Reconciliation] No high-tension candidates');
    return result;
  }

  log.info?.(`[Reconciliation] Found ${candidates.length} high-tension candidates`);

  // Track processed pairs to avoid duplicates
  const processedPairs = new Set<string>();

  // 2. Process each candidate
  for (const candidate of candidates) {
    try {
      // Detect conflicts for this memory
      const conflicts = await detectConflicts(collection, candidate);

      for (const conflict of conflicts) {
        // Deduplicate: sort IDs to create canonical pair key
        const pairKey = [conflict.memory_a_id, conflict.memory_b_id].sort().join(':');
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        result.conflicts_detected++;

        try {
          // Generate reconciliation observation
          const observationText = await generateObservation(deps.subLlm, conflict);

          if (!observationText || observationText.length === 0) {
            result.memories_skipped++;
            continue;
          }

          // Create REM observation memory (content_type: 'rem', trust_score: 5)
          const remMemory = {
            content: observationText,
            content_type: 'rem',
            doc_type: 'memory',
            trust_score: 5,
            tags: ['rem-reconciliation', conflict.conflict_type],
            created_at: new Date().toISOString(),
            related_memory_ids: [conflict.memory_a_id, conflict.memory_b_id],
            source: 'rem',
            rem_touched_at: new Date().toISOString(),
            rem_visits: 1,
          };

          const created = await collection.data.insert(remMemory);
          const remMemoryId = created?.uuid ?? created?.id ?? 'unknown';

          result.reconciliation_observations_created++;

          // Update source memory observations with reconciliation note
          for (const memId of [conflict.memory_a_id, conflict.memory_b_id]) {
            const otherId = memId === conflict.memory_a_id
              ? conflict.memory_b_id
              : conflict.memory_a_id;

            try {
              // Fetch current observation to append
              const memObj = await collection.query.fetchObjectById(memId);
              const currentObs = memObj?.properties?.observation ?? '';
              const appendNote = `\n\n[REM Reconciliation]: Tension detected with memory [${otherId}] — see reconciliation note [${remMemoryId}]`;
              const newObs = currentObs + appendNote;

              await collection.data.update({
                id: memId,
                properties: {
                  observation: newObs,
                  rem_touched_at: new Date().toISOString(),
                  rem_visits: (memObj?.properties?.rem_visits ?? 0) + 1,
                },
              });
            } catch {
              // Best-effort observation update
            }
          }

          log.info?.(`[Reconciliation] Created observation for conflict: ${conflict.memory_a_id} <-> ${conflict.memory_b_id}`);
        } catch (err) {
          log.warn?.(`[Reconciliation] Failed to generate observation: ${err}`);
          result.memories_skipped++;
        }
      }
    } catch (err) {
      log.warn?.(`[Reconciliation] Failed to process candidate ${candidate.uuid}: ${err}`);
      result.memories_skipped++;
    }
  }

  log.info?.(`[Reconciliation] Complete: ${result.conflicts_detected} conflicts detected, ${result.reconciliation_observations_created} observations created`);

  return result;
}
