# Trust Enforcement System

**Concept**: Five-tier content redaction and trust filtering for cross-user memory access
**Created**: 2026-02-28
**Status**: Design Specification

---

## Overview

The trust enforcement system controls how memories are revealed to non-owner accessors based on trust levels. It implements three enforcement modes (query, prompt, hybrid) and a five-tier content redaction scheme. This is the core mechanism powering the ghost/persona system's privacy model.

Adapted from remember-mcp's `trust-system-implementation.md` and `trust-escalation-prevention.md` for the remember-core SDK.

---

## Problem Statement

- Users share memories across the system (via ghosts, spaces, groups). Not all memories should be equally visible to all accessors.
- Trust is asymmetric — User A may trust User B at level 0.75, but User B trusts User A at 0.5.
- Different enforcement strategies have different security/UX trade-offs. The system must support multiple modes.
- Without escalation prevention, malicious users could repeatedly probe for restricted content.

---

## Solution

### Trust Score Semantics

- `memory.trust_score` (0–1): How sensitive this memory is. 0 = very private, 1 = fully open.
- `accessor_trust_level` (0–1): How much the owner trusts this accessor. 0 = stranger, 1 = intimate.
- Rule: Memory is accessible when `accessor_trust_level >= memory.trust_score`.

### Three Enforcement Modes

| Mode | Behavior | Security | UX |
|------|----------|----------|----|
| `query` (default) | Weaviate filter excludes memories above threshold | Strongest — nothing to leak | No graduated disclosure |
| `prompt` | All memories returned, formatted by trust tier | Weaker — relies on LLM | Rich 5-level disclosure |
| `hybrid` | Query filter for trust 0.0, prompt filter for rest | Medium | Best of both |

### Five Trust Tiers

| Tier | Threshold | Label | Revealed |
|------|-----------|-------|----------|
| 1.0 | `>= 1.0` | Full Access | Full content, location, tags, all fields |
| 0.75 | `>= 0.75` | Partial Access | Content with sensitive details redacted, city+state |
| 0.5 | `>= 0.5` | Summary Only | High-level summary, city only |
| 0.25 | `>= 0.25` | Metadata Only | Title, type, tags — no content |
| 0.0 | `>= 0.0` | Existence Only | Hint at existence, no specifics |

---

## Implementation

### Trust Thresholds Constant

```typescript
export const TRUST_THRESHOLDS = {
  FULL_ACCESS: 1.0,
  PARTIAL_ACCESS: 0.75,
  SUMMARY_ONLY: 0.5,
  METADATA_ONLY: 0.25,
  EXISTENCE_ONLY: 0.0,
} as const;
```

### Query-Level Trust Filter

Injected into Weaviate search when `enforcement_mode` is `'query'` or `'hybrid'`:

```typescript
function buildTrustFilter(
  collection: WeaviateCollection,
  accessorTrustLevel: number
): WeaviateFilter {
  return collection.filter
    .byProperty('trust_score')
    .lessOrEqual(accessorTrustLevel);
}
```

### Prompt-Level Content Formatting

Used when `enforcement_mode` is `'prompt'` or `'hybrid'`:

```typescript
interface FormattedMemory {
  formatted: string;
  trustLevel: number;
  trustLabel: string;
}

function formatMemoryForPrompt(
  memory: Memory,
  accessorTrustLevel: number
): FormattedMemory {
  if (accessorTrustLevel >= TRUST_THRESHOLDS.FULL_ACCESS) {
    // Full content, location.address, tags
  } else if (accessorTrustLevel >= TRUST_THRESHOLDS.PARTIAL_ACCESS) {
    // redactSensitiveFields(content), location city+state
  } else if (accessorTrustLevel >= TRUST_THRESHOLDS.SUMMARY_ONLY) {
    // summary || generateSummary(content), city only
  } else if (accessorTrustLevel >= TRUST_THRESHOLDS.METADATA_ONLY) {
    // title, type, tags — no content
  } else {
    // type, vague date — hint only, CRITICAL restrictions
  }
}
```

### Sensitive Field Redaction

```typescript
function redactSensitiveFields(memory: Memory): Partial<Memory> {
  // Strip: location details, participants, environment, source
  // Keep: content (with inline redaction), tags, content_type, created_at
}
```

### Trust Level Utilities

```typescript
function getTrustLevelLabel(level: number): string;
function getTrustInstructions(level: number): string;   // LLM system prompt text
function isTrustSufficient(required: number, actual: number): boolean;
function resolveEnforcementMode(config?: GhostConfig): TrustEnforcementMode;
```

### Trust Validator

```typescript
interface TrustValidationResult {
  valid: boolean;
  errors: string[];
  suggested?: number;
}

function validateTrustAssignment(
  trustLevel: number,
  content?: string
): TrustValidationResult;

function suggestTrustLevel(
  contentType: ContentType,
  tags?: string[]
): number;
```

### Escalation Prevention

When a user **repeatedly** attempts to access the same memory above their trust level:

- First attempt: denial only, no penalty
- **-0.1 trust penalty** per subsequent failed attempt (automatic, applied only after repeated attempts)
- **Block after 3 penalized attempts** — memory-specific, not user-wide
- **Owner notification** after block
- **Owner can reset** blocks and restore trust manually

```typescript
interface AccessAttemptLog {
  owner_user_id: string;
  accessor_user_id: string;
  memory_id: string;
  required_trust: number;
  actual_trust: number;
  new_trust: number;
  attempt_number: number;
  blocked: boolean;
  timestamp: Date;
}
```

---

## Benefits

- **Defense in depth**: Query filtering prevents data leakage; prompt filtering enables graduated disclosure
- **Configurable**: Users choose their security/UX trade-off via enforcement mode
- **Content-aware**: `suggestTrustLevel()` recommends trust scores based on content type
- **Escalation-resistant**: Automatic penalties deter repeated probing

---

## Trade-offs

- **No graduated disclosure in query mode**: Ghost genuinely cannot see filtered memories (mitigated by hybrid mode)
- **Prompt-mode LLM dependency**: Relies on LLM following instructions (mitigated by validation layer in consumer)
- **Performance**: Search-on-every-message pattern adds latency (mitigated by query-level filtering reducing result set)
- **Complexity**: Three enforcement modes, five trust tiers, escalation rules — significant surface area

---

## Dependencies

- `src/types/ghost-config.types.ts` — `TrustEnforcementMode`, `GhostConfig`
- `src/types/access-result.types.ts` — `AccessResult` union
- `src/utils/filters.ts` — Weaviate filter builders
- `src/constants/content-types.ts` — Content type categories for `suggestTrustLevel()`
- Weaviate `trust_score` field on memories

---

## Testing Strategy

- Unit tests for all 5 trust tiers in `formatMemoryForPrompt()`
- Unit tests for `buildTrustFilter()` with mock collection
- Unit tests for `suggestTrustLevel()` across all content type categories
- Unit tests for `validateTrustAssignment()` boundary conditions (0, 0.5, 1, negative, >1)
- Unit tests for escalation: penalty application, block after 3 attempts, owner reset

---

## Migration Path

1. Task 16: Create trust-related types (`TrustEnforcementMode`, `GhostConfig`)
2. Task 17: Create `TrustEnforcementService` and `TrustValidatorService`
3. Task 18: Create `EscalationService` with penalty/block logic
4. Task 20: Unit tests for all trust enforcement scenarios

---

## Future Considerations

- Trust validation of LLM responses (post-generation compliance check)
- Trust analytics dashboard for memory owners
- Adaptive trust — automatic trust adjustment based on conversation quality
- Group-level trust defaults

---

**Status**: Design Specification
**Recommendation**: Implement in Tasks 16–17, 20
**Related Documents**: [ghost-persona-system.md](ghost-persona-system.md), [access-control-result.md](access-control-result.md), [milestone-5](../milestones/milestone-5-trust-and-ghost-system.md)
