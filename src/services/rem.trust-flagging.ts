/**
 * REM Trust-Level Flagging.
 *
 * Flags memories where emotional scores indicate sensitive content
 * at an inappropriately broad trust level. Runs as a post-scoring
 * side-effect in Phase 0 (Score). Flags are stored in Firestore,
 * include human-readable reasons, and can be dismissed by users.
 */

import type { TrustLevel } from '../types/trust.types.js';
import { TRUST_LABELS } from '../types/trust.types.js';

// ─── Configuration ───────────────────────────────────────────────────────

export const TRUST_FLAG_CONFIG = {
  individual_score_threshold: 0.7,
  combined_score_threshold: 0.6,
  max_trust_level_to_flag: 2 as TrustLevel,
  reflag_score_increase_threshold: 0.2,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────

export interface TrustLevelFlag {
  id: string;
  memory_id: string;
  user_id: string;
  collection_id: string;
  type: 'trust_level_concern';
  reason: string;
  trigger_scores: {
    feel_trauma: number;
    feel_vulnerability: number;
    feel_shame: number;
  };
  current_trust_level: TrustLevel;
  status: 'active' | 'dismissed';
  created_at: string;
  dismissed_at: string | null;
  dismissed_reason: string | null;
}

export interface TrustFlagInput {
  memory_id: string;
  user_id: string;
  collection_id: string;
  feel_trauma: number;
  feel_vulnerability: number;
  feel_shame: number;
  trust_score: TrustLevel;
}

export interface FirestoreAdapter {
  getFlags(collectionId: string, memoryId: string): Promise<TrustLevelFlag[]>;
  getActiveFlags(collectionId: string): Promise<TrustLevelFlag[]>;
  createFlag(flag: Omit<TrustLevelFlag, 'id'>): Promise<string>;
  updateFlag(collectionId: string, flagId: string, updates: Partial<TrustLevelFlag>): Promise<void>;
}

// ─── Flag Detection ──────────────────────────────────────────────────────

/**
 * Determine whether a memory should be flagged for trust-level concern.
 */
export function shouldFlag(input: TrustFlagInput): boolean {
  // Only flag Public (1) or Internal (2)
  if (input.trust_score > TRUST_FLAG_CONFIG.max_trust_level_to_flag) return false;

  const { feel_trauma, feel_vulnerability, feel_shame } = input;
  const threshold = TRUST_FLAG_CONFIG.individual_score_threshold;

  // Any individual signal above threshold
  if (feel_trauma >= threshold) return true;
  if (feel_vulnerability >= threshold) return true;
  if (feel_shame >= threshold) return true;

  // Combined average above combined threshold
  const combined = (feel_trauma + feel_vulnerability + feel_shame) / 3;
  if (combined >= TRUST_FLAG_CONFIG.combined_score_threshold) return true;

  return false;
}

// ─── Reason Generation ───────────────────────────────────────────────────

/**
 * Generate a human-readable reason string for a trust-level flag.
 */
export function generateFlagReason(input: TrustFlagInput): string {
  const trustLabel = TRUST_LABELS[input.trust_score] ?? 'unknown';
  const threshold = TRUST_FLAG_CONFIG.individual_score_threshold;

  if (input.feel_trauma >= threshold) {
    return `This memory discusses potentially traumatic content -- did you mean to make this ${trustLabel}, or would you like to change the trust level so only your close friends can see it?`;
  }

  if (input.feel_vulnerability >= threshold) {
    return `This memory contains deeply personal content that reveals vulnerability -- you may want to restrict who can see it.`;
  }

  if (input.feel_shame >= threshold) {
    return `This memory contains sensitive content about a difficult personal experience -- you may want to restrict who can see it.`;
  }

  // Combined threshold
  return `This memory contains emotionally sensitive content (trauma, vulnerability) -- consider whether the current trust level (${trustLabel}) is appropriate.`;
}

// ─── Dismissal ───────────────────────────────────────────────────────────

/**
 * Check if a dismissed flag should block re-flagging.
 * Returns true if re-flagging should be blocked.
 */
export function shouldBlockReflag(
  dismissedFlag: TrustLevelFlag,
  currentScores: { feel_trauma: number; feel_vulnerability: number; feel_shame: number },
): boolean {
  const threshold = TRUST_FLAG_CONFIG.reflag_score_increase_threshold;
  const prev = dismissedFlag.trigger_scores;

  // Allow re-flag if any score increased significantly
  if (currentScores.feel_trauma - prev.feel_trauma >= threshold) return false;
  if (currentScores.feel_vulnerability - prev.feel_vulnerability >= threshold) return false;
  if (currentScores.feel_shame - prev.feel_shame >= threshold) return false;

  return true; // Block re-flagging
}

// ─── Service Functions ───────────────────────────────────────────────────

/**
 * Dismiss a trust-level flag.
 */
export async function dismissFlag(
  firestore: FirestoreAdapter,
  collectionId: string,
  flagId: string,
  reason?: string,
): Promise<void> {
  await firestore.updateFlag(collectionId, flagId, {
    status: 'dismissed',
    dismissed_at: new Date().toISOString(),
    dismissed_reason: reason ?? null,
  });
}

/**
 * Get all active trust-level flags for a collection.
 */
export async function getActiveTrustFlags(
  firestore: FirestoreAdapter,
  collectionId: string,
): Promise<TrustLevelFlag[]> {
  return firestore.getActiveFlags(collectionId);
}

/**
 * Evaluate a memory for trust-level flagging and create a flag if needed.
 * This is the main entry point called from Phase 0 scoring.
 * Returns the flag ID if created, null if not.
 */
export async function evaluateAndFlag(
  firestore: FirestoreAdapter,
  input: TrustFlagInput,
): Promise<string | null> {
  // 1. Check if memory should be flagged
  if (!shouldFlag(input)) return null;

  // 2. Check for existing flags (active or dismissed)
  const existingFlags = await firestore.getFlags(input.collection_id, input.memory_id);

  // Check for active flag — don't duplicate
  const activeFlag = existingFlags.find(f => f.status === 'active');
  if (activeFlag) return null;

  // Check for dismissed flag — block re-flagging unless scores increased significantly
  const dismissedFlag = existingFlags.find(f => f.status === 'dismissed');
  if (dismissedFlag) {
    const currentScores = {
      feel_trauma: input.feel_trauma,
      feel_vulnerability: input.feel_vulnerability,
      feel_shame: input.feel_shame,
    };
    if (shouldBlockReflag(dismissedFlag, currentScores)) return null;
  }

  // 3. Generate reason and create flag
  const reason = generateFlagReason(input);

  const flagId = await firestore.createFlag({
    memory_id: input.memory_id,
    user_id: input.user_id,
    collection_id: input.collection_id,
    type: 'trust_level_concern',
    reason,
    trigger_scores: {
      feel_trauma: input.feel_trauma,
      feel_vulnerability: input.feel_vulnerability,
      feel_shame: input.feel_shame,
    },
    current_trust_level: input.trust_score,
    status: 'active',
    created_at: new Date().toISOString(),
    dismissed_at: null,
    dismissed_reason: null,
  });

  return flagId;
}
