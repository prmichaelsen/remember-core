/**
 * REM Phase 4 — Pruning (Graduated Decay and Soft-Delete).
 *
 * Increases the `decay` property on low-significance memories over successive
 * REM cycles and soft-deletes via `deleted_at` when decay crosses a threshold.
 * High coherence_tension or high agency memories are exempt from pruning.
 * Also decays `functional_urgency` by 10% per cycle.
 */

import { Filters } from 'weaviate-client';
import type { Logger } from '../utils/logger.js';
import { COHERENCE_TENSION_THRESHOLD, AGENCY_EXEMPTION_THRESHOLD } from './rem.constants.js';

// ─── Constants ───────────────────────────────────────────────────────────

/** When decay >= this value, soft-delete the memory. */
export const DECAY_THRESHOLD = 0.9;

/** Maximum decay increase per cycle (for very low significance memories). */
export const MAX_DECAY_INCREMENT = 0.15;

/** Minimum decay increase per cycle. */
export const MIN_DECAY_INCREMENT = 0.01;

/** Memories below this total_significance get maximum decay increment. */
export const SIGNIFICANCE_FLOOR = 0.2;

/** Memories above this total_significance are not pruning candidates. */
export const SIGNIFICANCE_CEILING = 0.5;

/** Urgency decay multiplier per cycle (10% reduction). */
export const URGENCY_DECAY_FACTOR = 0.9;

/** Default max pruning candidates per cycle. */
export const DEFAULT_MAX_PRUNE_CANDIDATES = 50;

// ─── Types ───────────────────────────────────────────────────────────────

export interface PruningConfig {
  max_prune_candidates: number;
}

export const DEFAULT_PRUNING_CONFIG: PruningConfig = {
  max_prune_candidates: DEFAULT_MAX_PRUNE_CANDIDATES,
};

export interface PruningResult {
  candidates_found: number;
  memories_decayed: number;
  memories_soft_deleted: number;
  memories_skipped: number;
  urgency_decayed: number;
}

export interface PruningMemory {
  total_significance: number;
  feel_coherence_tension: number;
  functional_agency: number;
}

// ─── Decay Formula ───────────────────────────────────────────────────────

/**
 * Compute the decay increment for a memory based on its significance,
 * coherence tension, and agency.
 *
 * Returns 0 for exempt memories (high coherence tension or high agency
 * or above significance ceiling).
 */
export function computeDecayIncrement(memory: PruningMemory): number {
  // Exempt high coherence tension (OR logic)
  if (memory.feel_coherence_tension >= COHERENCE_TENSION_THRESHOLD) {
    return 0;
  }
  // Exempt high agency
  if (memory.functional_agency >= AGENCY_EXEMPTION_THRESHOLD) {
    return 0;
  }
  // Not a pruning candidate if significance is above ceiling
  if (memory.total_significance >= SIGNIFICANCE_CEILING) {
    return 0;
  }

  // Linear interpolation: lower significance = higher decay
  const range = SIGNIFICANCE_CEILING - SIGNIFICANCE_FLOOR;
  const normalized = Math.max(0, memory.total_significance - SIGNIFICANCE_FLOOR) / range;
  const increment = MAX_DECAY_INCREMENT - (normalized * (MAX_DECAY_INCREMENT - MIN_DECAY_INCREMENT));

  return Math.max(MIN_DECAY_INCREMENT, Math.min(MAX_DECAY_INCREMENT, increment));
}

// ─── Candidate Selection ─────────────────────────────────────────────────

/**
 * Select memories eligible for pruning:
 * - total_significance < SIGNIFICANCE_CEILING
 * - not already soft-deleted (deleted_at is null)
 * - content_type != 'rem' (don't prune REM-generated abstractions)
 * - doc_type = 'memory'
 *
 * Sorted by total_significance ascending (lowest first).
 */
export async function selectPruningCandidates(
  collection: any,
  batchSize: number,
): Promise<Array<{ uuid: string; properties: Record<string, any> }>> {
  const filter = Filters.and(
    collection.filter.byProperty('doc_type').equal('memory'),
    collection.filter.byProperty('total_significance').lessThan(SIGNIFICANCE_CEILING),
    collection.filter.byProperty('deleted_at').isNull(true),
  );

  const result = await collection.query.fetchObjects({
    filters: filter,
    limit: batchSize,
    sort: collection.sort.byProperty('total_significance', true), // ascending
  });

  // Filter out content_type: 'rem' in-memory (Weaviate may not support notEqual easily)
  return result.objects.filter((obj: any) => {
    return obj.properties?.content_type !== 'rem';
  });
}

// ─── Urgency Decay ───────────────────────────────────────────────────────

/**
 * Select memories that have functional_urgency > 0 for urgency decay.
 * Urgency decays on ALL memories, not just pruning candidates.
 */
export async function selectUrgencyDecayCandidates(
  collection: any,
  batchSize: number,
): Promise<Array<{ uuid: string; properties: Record<string, any> }>> {
  const filter = Filters.and(
    collection.filter.byProperty('doc_type').equal('memory'),
    collection.filter.byProperty('functional_urgency').greaterThan(0),
  );

  const result = await collection.query.fetchObjects({
    filters: filter,
    limit: batchSize,
  });

  return result.objects;
}

// ─── Phase Execution ─────────────────────────────────────────────────────

/**
 * Execute the pruning phase for a collection.
 * 1. Select pruning candidates (low significance, not deleted, not rem type)
 * 2. Apply decay increments (skip exempt memories)
 * 3. Soft-delete memories crossing threshold (set deleted_at)
 * 4. Decay functional_urgency on all memories
 */
export async function runPruningPhase(
  collection: any,
  config?: Partial<PruningConfig>,
  logger?: Logger,
): Promise<PruningResult> {
  const cfg = { ...DEFAULT_PRUNING_CONFIG, ...config };
  const log: Logger = logger ?? (console as any);

  const result: PruningResult = {
    candidates_found: 0,
    memories_decayed: 0,
    memories_soft_deleted: 0,
    memories_skipped: 0,
    urgency_decayed: 0,
  };

  // 1. Select pruning candidates
  const candidates = await selectPruningCandidates(collection, cfg.max_prune_candidates);
  result.candidates_found = candidates.length;

  if (candidates.length === 0) {
    log.debug?.('[Pruning] No candidates for pruning');
  } else {
    log.info?.(`[Pruning] Found ${candidates.length} candidates`);
  }

  // 2. Process each candidate
  for (const candidate of candidates) {
    const props = candidate.properties;
    const totalSig = props.total_significance ?? 0;
    const coherenceTension = props.feel_coherence_tension ?? 0;
    const agency = props.functional_agency ?? 0;

    const increment = computeDecayIncrement({
      total_significance: totalSig,
      feel_coherence_tension: coherenceTension,
      functional_agency: agency,
    });

    if (increment === 0) {
      result.memories_skipped++;
      continue;
    }

    const currentDecay = props.decay ?? 0;
    const newDecay = Math.min(1.0, currentDecay + increment);

    const updateProps: Record<string, any> = {
      decay: newDecay,
      rem_touched_at: new Date().toISOString(),
      rem_visits: (props.rem_visits ?? 0) + 1,
    };

    // 3. Check if threshold crossed — soft-delete
    if (newDecay >= DECAY_THRESHOLD) {
      updateProps.deleted_at = new Date().toISOString();
      result.memories_soft_deleted++;
      log.info?.(`[Pruning] Soft-deleting memory ${candidate.uuid} (decay: ${newDecay.toFixed(3)})`);
    }

    try {
      await collection.data.update({ id: candidate.uuid, properties: updateProps });
      result.memories_decayed++;
    } catch (err) {
      log.warn?.(`[Pruning] Failed to update memory ${candidate.uuid}: ${err}`);
    }
  }

  // 4. Decay functional_urgency on all memories with urgency > 0
  try {
    const urgencyCandidates = await selectUrgencyDecayCandidates(collection, 200);

    for (const mem of urgencyCandidates) {
      const currentUrgency = mem.properties.functional_urgency ?? 0;
      if (currentUrgency <= 0) continue;

      const newUrgency = currentUrgency * URGENCY_DECAY_FACTOR;

      try {
        await collection.data.update({
          id: mem.uuid,
          properties: { functional_urgency: newUrgency },
        });
        result.urgency_decayed++;
      } catch (err) {
        log.warn?.(`[Pruning] Failed to decay urgency for ${mem.uuid}: ${err}`);
      }
    }
  } catch (err) {
    log.warn?.(`[Pruning] Failed to select urgency decay candidates: ${err}`);
  }

  log.info?.(`[Pruning] Complete: ${result.memories_decayed} decayed, ${result.memories_soft_deleted} soft-deleted, ${result.urgency_decayed} urgency-decayed`);

  return result;
}
