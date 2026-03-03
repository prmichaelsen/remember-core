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
  // Haiku validation bypass
  auto_approve_similarity: number;       // Auto-approve clusters above this similarity (0.9 = 90%+, bypasses Haiku)
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
  // Auto-approve highly similar clusters (bypasses conservative Haiku)
  auto_approve_similarity: 0.9,
};

// ─── State Tracking ──────────────────────────────────────────────────────

export interface RemCursorState {
  last_collection_id: string;
  last_run_at: string; // ISO timestamp
}

export interface RemCollectionState {
  collection_id: string;
  last_processed_at: string; // ISO timestamp
  memory_cursor: string; // created_at cursor for "unprocessed" third
}
