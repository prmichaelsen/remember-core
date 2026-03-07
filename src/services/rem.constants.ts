/**
 * Shared REM constants used across pruning, reconciliation, and other REM phases.
 */

// ─── Coherence Tension ───────────────────────────────────────────────────

/** Memories with feel_coherence_tension at or above this threshold are exempt from pruning
 * and are candidates for reconciliation processing. */
export const COHERENCE_TENSION_THRESHOLD = 0.7;

// ─── Agency ──────────────────────────────────────────────────────────────

/** Memories with functional_agency at or above this threshold resist pruning (OR logic with coherence tension). */
export const AGENCY_EXEMPTION_THRESHOLD = 0.7;
