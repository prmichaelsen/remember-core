/**
 * Trust validator — validation and suggestions for trust-sensitive operations.
 *
 * Uses integer TrustLevel 1–5 scale (higher = more confidential).
 * Ported from remember-mcp/src/services/trust-validator.ts
 */

import type { ContentType } from '../types/memory.types.js';
import { TrustLevel, isValidTrustLevel, TRUST_LABELS } from '../types/trust.types.js';

/**
 * Validation result for trust assignment.
 */
export interface TrustValidationResult {
  valid: boolean;
  warning?: string;
}

/**
 * Validate a trust level assignment.
 * Warns if trust >= 4 (Restricted/Secret — very restrictive).
 * Returns invalid for out-of-range values.
 *
 * @param trustLevel - The trust level being assigned (1-5 integer)
 */
export function validateTrustAssignment(trustLevel: number): TrustValidationResult {
  if (!isValidTrustLevel(trustLevel)) {
    return { valid: false, warning: `Trust level must be an integer 1-5, got ${trustLevel}` };
  }

  if (trustLevel >= TrustLevel.RESTRICTED) {
    return {
      valid: true,
      warning: `Trust level ${TRUST_LABELS[trustLevel as TrustLevel]} (${trustLevel}) is very restrictive — most accessors will only see metadata or existence. Consider ${TRUST_LABELS[TrustLevel.CONFIDENTIAL]} (${TrustLevel.CONFIDENTIAL}) or lower for broader visibility.`,
    };
  }

  return { valid: true };
}

/**
 * Suggest an appropriate trust level based on content type and tags.
 *
 * Guidelines:
 * - Personal (journal, memory, event): RESTRICTED (4) — close contacts only
 * - System/audit/action: CONFIDENTIAL (3) — trusted friends
 * - Business (invoice, contract): CONFIDENTIAL (3)
 * - Communication (email, conversation): CONFIDENTIAL (3)
 * - Ghost conversations: RESTRICTED (4)
 * - Default: INTERNAL (2) — conservative
 *
 * Tag overrides:
 * - 'private' or 'secret': SECRET (5)
 * - 'public': PUBLIC (1)
 *
 * @param contentType - The type of content
 * @param tags - Optional tags that may affect suggestion
 * @returns Suggested TrustLevel (1-5)
 */
export function suggestTrustLevel(contentType: ContentType, tags?: string[]): TrustLevel {
  // Tag-based overrides take priority
  if (tags && tags.length > 0) {
    const lowerTags = tags.map(t => t.toLowerCase());
    if (lowerTags.includes('private') || lowerTags.includes('secret')) {
      return TrustLevel.SECRET;
    }
    if (lowerTags.includes('public')) {
      return TrustLevel.PUBLIC;
    }
  }

  // Content type-based suggestions
  switch (contentType) {
    // Personal — higher trust needed
    case 'journal':
    case 'memory':
    case 'event':
      return TrustLevel.RESTRICTED;

    // System/internal
    case 'system':
    case 'audit':
    case 'action':
    case 'history':
      return TrustLevel.CONFIDENTIAL;

    // Business
    case 'invoice':
    case 'contract':
      return TrustLevel.CONFIDENTIAL;

    // Communication
    case 'email':
    case 'conversation':
    case 'meeting':
      return TrustLevel.CONFIDENTIAL;

    // Ghost conversations — private by default
    case 'ghost':
      return TrustLevel.RESTRICTED;

    // Default — conservative
    default:
      return TrustLevel.INTERNAL;
  }
}
