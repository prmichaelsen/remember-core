/**
 * Ghost/persona configuration types.
 * Ported from remember-mcp/src/types/ghost-config.ts
 *
 * GhostConfig is stored in Firestore at users/{ownerUserId}/ghost_config.
 * Trust is owned by the server (not passed per-request) to prevent
 * prompt injection tampering.
 *
 * Trust levels use integer 1-5 scale (higher = more confidential):
 *   1=Public, 2=Internal, 3=Confidential, 4=Restricted, 5=Secret
 */

import { TrustLevel } from './trust.types.js';

/** Trust enforcement mode — how memories are filtered for cross-user access */
export type TrustEnforcementMode = 'query' | 'prompt' | 'hybrid';

/**
 * Per-user ghost configuration stored in Firestore.
 *
 * - query mode (default): memories above threshold never returned from Weaviate
 * - prompt mode: all memories returned, formatted/redacted by trust level
 * - hybrid mode: query filter for trust level 1 memories, prompt filter for rest
 */
export interface GhostConfig {
  /** Whether ghost conversations are enabled for this user (default: false) */
  enabled: boolean;
  /** Allow non-friends (strangers) to initiate ghost conversations (default: false) */
  public_ghost_enabled: boolean;
  /** Default trust level granted to friends (default: 2 — Internal, sees Public + Internal) */
  default_friend_trust: TrustLevel;
  /** Default trust level granted to strangers (default: 1 — Public only) */
  default_public_trust: TrustLevel;
  /** Per-user trust level overrides: userId → trust level (1-5) */
  per_user_trust: Record<string, TrustLevel>;
  /** Users blocked from ghost access entirely */
  blocked_users: string[];
  /** How trust is enforced when filtering memories (default: 'query') */
  enforcement_mode: TrustEnforcementMode;
}

/** Default GhostConfig values for a new user */
export const DEFAULT_GHOST_CONFIG: GhostConfig = {
  enabled: false,
  public_ghost_enabled: false,
  default_friend_trust: TrustLevel.INTERNAL,
  default_public_trust: TrustLevel.PUBLIC,
  per_user_trust: {},
  blocked_users: [],
  enforcement_mode: 'query',
};
