/**
 * REM (Relationship Engine for Memories) types.
 *
 * Defines configuration, state tracking, and cluster types
 * used by the REM background processing engine.
 */

// ─── Configuration ───────────────────────────────────────────────────────

export interface RemConfig {
  min_collection_size: number;
  similarity_threshold: number;
  max_candidates_per_run: number;
  max_similar_per_candidate: number;
  overlap_merge_threshold: number;
  max_relationship_members: number;
  // Multi-strategy candidate selection
  seed_count: number;                    // Number of random seeds for LLM-enhanced strategies
  candidates_per_seed_strategy: number;  // Results per nearText search (keywords/topics/themes/summary)
  // Phase 0: Emotional scoring
  scoring_batch_size: number;            // Max memories to score per cycle
  scoring_cost_cap: number;              // Max cost (USD) for Phase 0 scoring per cycle
  scoring_cost_per_memory: number;       // Estimated cost per memory (31 Haiku calls)
  // Classification
  classification_batch_size: number;     // Max memories to classify per cycle
}

export const DEFAULT_REM_CONFIG: RemConfig = {
  min_collection_size: 50,
  similarity_threshold: 0.75,
  max_candidates_per_run: 30,
  max_similar_per_candidate: 20,
  overlap_merge_threshold: 0.60,
  max_relationship_members: 50,
  // Multi-strategy defaults
  seed_count: 2,
  candidates_per_seed_strategy: 5,
  // Phase 0: Emotional scoring (~$0.0015 per memory = $0.75/500)
  scoring_batch_size: 10,
  scoring_cost_cap: 5.0,
  scoring_cost_per_memory: 0.0015,
  // Classification
  classification_batch_size: 20,
};

// ─── State Tracking ──────────────────────────────────────────────────────

/**
 * @deprecated Use job-based REM scheduling instead. See RemJobWorker and scheduleRemJobs.
 */
export interface RemCursorState {
  last_collection_id: string;
  last_run_at: string; // ISO timestamp
}

/**
 * @deprecated Use job-based REM scheduling instead. See RemJobWorker and scheduleRemJobs.
 */
export interface RemCollectionState {
  collection_id: string;
  last_processed_at: string; // ISO timestamp
  memory_cursor: string; // created_at cursor for "unprocessed" third
}
