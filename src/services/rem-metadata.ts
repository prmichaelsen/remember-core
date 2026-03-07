// src/services/rem-metadata.ts
// REM metadata tracking — rem_touched_at and rem_visits update functions.
// These fields are REM-only; NOT settable via create_memory.

// ─── Types ───────────────────────────────────────────────────────────────

export interface RemMetadataUpdate {
  rem_touched_at: string;  // ISO timestamp
  rem_visits: number;      // previous value + 1
}

// ─── Functions ───────────────────────────────────────────────────────────

/**
 * Build the REM metadata fields to include in a Weaviate update
 * after scoring a memory. Intended to be merged into the same
 * update operation as dimension scores and composites.
 *
 * @param currentVisits - current rem_visits value (0 if never scored)
 * @param now - optional timestamp override (for testing)
 */
export function buildRemMetadataUpdate(
  currentVisits: number,
  now?: Date,
): RemMetadataUpdate {
  return {
    rem_touched_at: (now ?? new Date()).toISOString(),
    rem_visits: currentVisits + 1,
  };
}
