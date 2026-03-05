/**
 * Trust enforcement service — 3 configurable modes for cross-user memory access.
 *
 * - query mode (default): memories above trust threshold never returned from Weaviate
 * - prompt mode: all memories returned, formatted/redacted by trust level
 * - hybrid mode: query filter for PUBLIC, prompt filter for rest
 *
 * Uses integer TrustLevel 1–5 scale (higher = more confidential).
 */

import type { Memory } from '../types/memory.types.js';
import type { TrustEnforcementMode } from '../types/ghost-config.types.js';
import { TrustLevel, TRUST_LABELS } from '../types/trust.types.js';

// ─── Query-Level Enforcement ───────────────────────────────────────────────

/**
 * Build a Weaviate filter that restricts memories by trust score.
 * Only returns memories where trust_score <= accessorTrustLevel.
 *
 * @param collection - Weaviate collection instance
 * @param accessorTrustLevel - The accessor's trust level (1-5)
 * @returns Weaviate filter object
 */
export function buildTrustFilter(collection: any, accessorTrustLevel: number): any {
  return collection.filter.byProperty('trust_score').lessOrEqual(accessorTrustLevel);
}

// ─── Prompt-Level Enforcement ──────────────────────────────────────────────

/**
 * Formatted memory representation for prompt-level enforcement.
 * Content is redacted/formatted based on trust level.
 */
export interface FormattedMemory {
  memory_id: string;
  trust_tier: string;
  content: string;
}

/**
 * Format a memory for inclusion in an LLM prompt, redacted by trust level.
 *
 * Trust tiers (accessor level determines what they see):
 * - SECRET (5):       Full content, all details
 * - RESTRICTED (4):   Content with sensitive fields redacted
 * - CONFIDENTIAL (3): Title + summary only
 * - INTERNAL (2):     Metadata only (type, date, tags)
 * - PUBLIC (1):       Existence only ("A memory exists about this topic")
 *
 * Access rule: accessor_level >= memory_level. Self-access always gets full content.
 *
 * @param memory - The memory to format
 * @param accessorTrustLevel - The accessor's trust level (1-5)
 * @param isSelfAccess - True if the accessor is the memory owner
 * @returns Formatted memory for prompt inclusion
 */
export function formatMemoryForPrompt(memory: Memory, accessorTrustLevel: TrustLevel, isSelfAccess = false): FormattedMemory {
  // Owner always gets full access
  if (isSelfAccess) {
    return formatFullAccess(memory);
  }

  const tier = getTrustLevelLabel(accessorTrustLevel);

  switch (accessorTrustLevel) {
    case TrustLevel.SECRET: {
      // Full Access — all content
      const parts = [`[${memory.type}] ${memory.title || 'Untitled'}`];
      parts.push(memory.content);
      if (memory.summary) parts.push(`Summary: ${memory.summary}`);
      if (memory.tags.length > 0) parts.push(`Tags: ${memory.tags.join(', ')}`);
      if (memory.created_at) parts.push(`Created: ${memory.created_at}`);
      return { memory_id: memory.id, trust_tier: tier, content: parts.join('\n') };
    }

    case TrustLevel.RESTRICTED: {
      // Partial Access — redact sensitive fields
      const redacted = redactSensitiveFields(memory);
      const parts = [`[${redacted.type}] ${redacted.title || 'Untitled'}`];
      parts.push(redacted.content);
      if (redacted.tags.length > 0) parts.push(`Tags: ${redacted.tags.join(', ')}`);
      return { memory_id: memory.id, trust_tier: tier, content: parts.join('\n') };
    }

    case TrustLevel.CONFIDENTIAL: {
      // Summary Only — title + summary, no content body
      const parts = [`[${memory.type}] ${memory.title || 'Untitled'}`];
      if (memory.summary) {
        parts.push(memory.summary);
      } else {
        parts.push('(No summary available)');
      }
      return { memory_id: memory.id, trust_tier: tier, content: parts.join('\n') };
    }

    case TrustLevel.INTERNAL: {
      // Metadata Only — type, date, tags
      const parts = [`[${memory.type}]`];
      if (memory.created_at) parts.push(`Created: ${memory.created_at}`);
      if (memory.tags.length > 0) parts.push(`Tags: ${memory.tags.join(', ')}`);
      return { memory_id: memory.id, trust_tier: tier, content: parts.join('\n') };
    }

    case TrustLevel.PUBLIC:
    default:
      // Existence Only — minimal hint
      return {
        memory_id: memory.id,
        trust_tier: tier,
        content: 'A memory exists about this topic.',
      };
  }
}

/** Format a memory with full access (used for self-access) */
function formatFullAccess(memory: Memory): FormattedMemory {
  const parts = [`[${memory.type}] ${memory.title || 'Untitled'}`];
  parts.push(memory.content);
  if (memory.summary) parts.push(`Summary: ${memory.summary}`);
  if (memory.tags.length > 0) parts.push(`Tags: ${memory.tags.join(', ')}`);
  if (memory.created_at) parts.push(`Created: ${memory.created_at}`);
  return { memory_id: memory.id, trust_tier: 'Secret', content: parts.join('\n') };
}

// ─── Shared Utilities ──────────────────────────────────────────────────────

/**
 * Get a human-readable label for a trust level.
 */
export function getTrustLevelLabel(trust: TrustLevel): string {
  return TRUST_LABELS[trust] ?? 'Public';
}

/**
 * Get LLM instruction text describing what to reveal at a given trust level.
 */
export function getTrustInstructions(trust: TrustLevel): string {
  switch (trust) {
    case TrustLevel.SECRET:
      return 'You have full access to this memory. Share all content and details freely.';
    case TrustLevel.RESTRICTED:
      return 'You have partial access. Share the main content but do not reveal sensitive personal details like exact locations, contact information, or financial data.';
    case TrustLevel.CONFIDENTIAL:
      return 'You have summary-level access. Share the title and summary only. Do not reveal the full content of this memory.';
    case TrustLevel.INTERNAL:
      return 'You have metadata-level access only. You may mention the type, date, and tags, but do not reveal any content or summary.';
    case TrustLevel.PUBLIC:
    default:
      return 'You may only acknowledge that a memory exists about this topic. Do not reveal any details.';
  }
}

/**
 * Redact sensitive fields from a memory for partial access.
 * Returns a copy with location, context, and references cleared.
 */
export function redactSensitiveFields(memory: Memory): Memory {
  return {
    ...memory,
    // Clear sensitive location data
    location: { gps: null, address: null, source: 'unavailable', confidence: 0, is_approximate: true },
    // Strip context details
    context: {
      ...memory.context,
      participants: undefined,
      environment: undefined,
      notes: undefined,
    },
    // Clear references (may contain private URLs)
    references: undefined,
  };
}

/**
 * Check whether an accessor's trust level is sufficient for a memory.
 * Access is granted when accessorTrust >= memoryTrust.
 */
export function isTrustSufficient(memoryTrust: number, accessorTrust: number): boolean {
  return accessorTrust >= memoryTrust;
}

/**
 * Determine the enforcement mode to use.
 * Convenience function that returns the mode from GhostConfig or falls back to 'query'.
 */
export function resolveEnforcementMode(mode?: TrustEnforcementMode): TrustEnforcementMode {
  return mode ?? 'query';
}
