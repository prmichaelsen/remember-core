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

// ─── Classification ────────────────────────────────────────────────────

/** Maximum memories to classify per REM cycle. */
export const CLASSIFICATION_BATCH_SIZE = 20;

/** Coherence pressure magnitude when a contradiction is detected between memories. */
export const CONTRADICTION_PRESSURE_MAGNITUDE = -0.15;

// ─── Perception Drift Rates ─────────────────────────────────────────────
export const IDENTITY_DRIFT_RATE = 0.05;
export const BEHAVIOR_DRIFT_RATE = 0.15;
