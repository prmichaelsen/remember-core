# Trust Enforcement System

**Concept**: Five-tier content redaction and trust filtering for cross-user memory access
**Created**: 2026-02-28
**Updated**: 2026-03-05
**Status**: Design Specification (Updated for integer TrustLevel 1–5)

---

## Overview

The trust enforcement system controls how memories are revealed to non-owner accessors based on trust levels. It implements three enforcement modes (query, prompt, hybrid) and a five-tier content redaction scheme. This is the core mechanism powering the ghost/persona system's privacy model.

Uses integer TrustLevel 1–5 scale where higher = more confidential. Aligned with industry classification standards (ISO 27001, NIST FIPS 199).

---

## Problem Statement

- Users share memories across the system (via ghosts, spaces, groups). Not all memories should be equally visible to all accessors.
- Trust is asymmetric — User A may trust User B at level 4, but User B trusts User A at 2.
- Different enforcement strategies have different security/UX trade-offs. The system must support multiple modes.
- Without escalation prevention, malicious users could repeatedly probe for restricted content.

---

## Solution

### Trust Level Scale (Integer 1–5)

| Level | Label | Who Can Access | Description |
|-------|-------|---------------|-------------|
| 1 | **Public** | Anyone, including strangers | Open to all |
| 2 | **Internal** | Friends, known users | Standard visibility |
| 3 | **Confidential** | Trusted friends only | Limited access |
| 4 | **Restricted** | Close/intimate contacts only | Highly private |
| 5 | **Secret** | Owner only (or explicitly granted) | Maximum confidentiality |

- `memory.trust_score` (1–5): How confidential this memory is. Higher = more restricted.
- `accessor_trust_level` (1–5): How much the owner trusts this accessor. Higher = more access.
- Rule: Memory is accessible when `accessor_trust_level >= memory.trust_score`.

### Three Enforcement Modes

| Mode | Behavior | Security | UX |
|------|----------|----------|----|
| `query` (default) | Weaviate filter excludes memories above threshold | Strongest — nothing to leak | No graduated disclosure |
| `prompt` | All memories returned, formatted by trust tier | Weaker — relies on LLM | Rich 5-level disclosure |
| `hybrid` | Query filter for PUBLIC, prompt filter for rest | Medium | Best of both |

### Five Trust Tiers (Prompt-Level Formatting)

| Accessor Level | Label | Revealed |
|---------------|-------|----------|
| 5 (Secret) | Full Access | Full content, location, tags, all fields |
| 4 (Restricted) | Partial Access | Content with sensitive details redacted |
| 3 (Confidential) | Summary Only | Title + summary, no content body |
| 2 (Internal) | Metadata Only | Type, date, tags — no content |
| 1 (Public) | Existence Only | Hint at existence, no specifics |

---

## Implementation

### TrustLevel Type

```typescript
export const TrustLevel = {
  PUBLIC: 1,
  INTERNAL: 2,
  CONFIDENTIAL: 3,
  RESTRICTED: 4,
  SECRET: 5,
} as const;
export type TrustLevel = (typeof TrustLevel)[keyof typeof TrustLevel];
```

### Query-Level Trust Filter

```typescript
function buildTrustFilter(collection: any, accessorTrustLevel: TrustLevel): any {
  return collection.filter.byProperty('trust_score').lessOrEqual(accessorTrustLevel);
}
```

### Prompt-Level Content Formatting

```typescript
function formatMemoryForPrompt(
  memory: Memory, accessorTrustLevel: TrustLevel, isSelfAccess?: boolean
): FormattedMemory {
  if (isSelfAccess) return formatFullAccess(memory);
  switch (accessorTrustLevel) {
    case TrustLevel.SECRET:      // Full content
    case TrustLevel.RESTRICTED:  // Redacted content
    case TrustLevel.CONFIDENTIAL: // Title + summary
    case TrustLevel.INTERNAL:    // Metadata only
    case TrustLevel.PUBLIC:      // Existence only
  }
}
```

### Trust Level Utilities

```typescript
function getTrustLevelLabel(level: TrustLevel): string;
function getTrustInstructions(level: TrustLevel): string;
function isTrustSufficient(memoryTrust: TrustLevel, accessorTrust: TrustLevel): boolean;
function resolveEnforcementMode(mode?: TrustEnforcementMode): TrustEnforcementMode;
```

### Trust Validator

```typescript
function validateTrustAssignment(trustLevel: number): TrustValidationResult;
function suggestTrustLevel(contentType: ContentType, tags?: string[]): TrustLevel;
```

### Escalation Prevention

Simplified flow (no penalty, deny → deny → block):

- Each attempt: denial with attempts remaining count
- **Block after 3 attempts** — memory-specific, not user-wide
- **Owner notification** after block
- **Owner can reset** blocks and restore access manually

No trust penalty is applied. The escalation is purely a probe-prevention mechanism.

---

## Read-Time Normalization

A `normalizeTrustScore()` function handles mixed data (legacy float 0–1 + new integer 1–5):

```typescript
function normalizeTrustScore(value: number | undefined | null): TrustLevel {
  if (value == null) return TrustLevel.INTERNAL;
  if (isValidTrustLevel(value)) return value; // already integer
  // Legacy float: invert and map
  const inverted = 1 - value;
  // Maps to nearest tier boundary
}
```

This allows the system to work correctly during migration without requiring all data to be migrated upfront.

---

## Data Migration

Script: `scripts/migrations/migrate-trust-scores.ts`

Maps legacy float values to integers:
- 0.0 → 5 (Secret), 0.25 → 4 (Restricted), 0.5 → 3 (Confidential), 0.75 → 2 (Internal), 1.0 → 1 (Public)
- Intermediate floats rounded to nearest tier
- Idempotent — skips already-migrated integers
- Weaviate schema unchanged (NUMBER type stores integers as-is)

---

## Dependencies

- `src/types/trust.types.ts` — `TrustLevel`, `TRUST_LABELS`, `normalizeTrustScore()`
- `src/types/ghost-config.types.ts` — `TrustEnforcementMode`, `GhostConfig`
- `src/types/access-result.types.ts` — `AccessResult` union
- `src/utils/filters.ts` — Weaviate filter builders
- Weaviate `trust_score` NUMBER field on memories

---

## Testing Strategy

- Unit tests for all 5 trust tiers in `formatMemoryForPrompt()`
- Unit tests for `buildTrustFilter()` with mock collection
- Unit tests for `suggestTrustLevel()` across all content type categories
- Unit tests for `validateTrustAssignment()` integer 1–5 validation
- Unit tests for escalation: deny → deny → block, owner reset
- Unit tests for `normalizeTrustScore()` float-to-integer mapping

---

**Status**: Design Specification
**Related Documents**: [ghost-persona-system.md](ghost-persona-system.md), [access-control-result.md](access-control-result.md), [milestone-19](../milestones/milestone-19-trust-level-redesign.md)
