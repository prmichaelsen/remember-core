# Task 103: Read-Time Trust Score Normalization

**Milestone**: M19 — Trust Level Redesign
**Status**: not_started
**Estimated Hours**: 2-3
**Dependencies**: Task 98 (TrustLevel types)
**Priority**: HIGH — blocks remember-rest-service deployment with integer trust DTOs

---

## Objective

Add a normalization layer that converts legacy float trust_score values (0-1) to integer TrustLevel (1-5) on read, so that the system works correctly with mixed data (pre-migration floats + post-migration integers) in Weaviate.

## Context

remember-rest-service has already migrated its DTOs to validate trust as `@IsInt() @Min(1) @Max(5)`. But existing memories in Weaviate still have float trust_score values (0.0, 0.25, 0.5, 0.75, 1.0). Without read-time normalization:

- Search results return float trust values to clients expecting integers
- `trust_min`/`trust_max` filters (now integers 1-5) won't match float-stored data
- Ghost context `accessor_trust_level` as integer vs stored floats causes incorrect access decisions
- New memories get integer trust, old memories keep float trust — inconsistent responses

This task provides a **safe transition layer** that works before, during, and after the batch migration (Task 101). Once all data is migrated, the normalization becomes a no-op but can remain as a safety net.

## Migration Mapping

| Old Float Range | New Integer | Label |
|----------------|-------------|-------|
| 0.0-0.124      | 5           | Secret |
| 0.125-0.374    | 4           | Restricted |
| 0.375-0.624    | 3           | Confidential |
| 0.625-0.874    | 2           | Internal |
| 0.875-1.0      | 1           | Public |

Values already in 1-5 integer range pass through unchanged.

## Steps

### 1. Create normalizeTrustScore() utility

```typescript
import { TrustLevel, isValidTrustLevel } from '../types/trust.types.js';

/**
 * Normalize a trust_score from Weaviate to integer TrustLevel.
 * Handles both legacy floats (0-1) and already-migrated integers (1-5).
 */
export function normalizeTrustScore(value: number): TrustLevel {
  // Already a valid integer trust level
  if (isValidTrustLevel(value)) return value;

  // Legacy float: invert and map to nearest tier
  const inverted = 1 - value;
  if (inverted >= 0.875) return TrustLevel.SECRET;
  if (inverted >= 0.625) return TrustLevel.RESTRICTED;
  if (inverted >= 0.375) return TrustLevel.CONFIDENTIAL;
  if (inverted >= 0.125) return TrustLevel.INTERNAL;
  return TrustLevel.PUBLIC;
}
```

Location: `src/utils/trust-normalization.ts` or inline in `src/types/trust.types.ts`

### 2. Apply normalization at MemoryService read boundaries

Identify all points where trust_score is read from Weaviate and returned to callers:

- `MemoryService.search()` — normalize result trust values
- `MemoryService.query()` — same
- `MemoryService.findSimilar()` — same
- `MemoryService.getById()` / `resolveById()` — same
- `MemoryService.byTime()` — same
- Any raw Weaviate reads in `web/memories.ts`, `web/spaces.ts`

Apply `normalizeTrustScore()` to `trust_score` before returning to callers.

### 3. Apply normalization at filter/comparison boundaries

Where trust values are compared (e.g., `buildTrustFilter()`), ensure the filter logic accounts for mixed storage:

- Option A: Normalize on read (preferred — single pass)
- Option B: Dual filter (trust_score <= X OR trust_score <= oldFloatEquivalent) — complex, avoid

### 4. Apply normalization to MemoryService.create/update defaults

Ensure new memories are written with integer trust values:

- `MemoryService.create()`: default trust should be `TrustLevel.INTERNAL` (2) not `0.25`
- `MemoryService.update()`: if trust field provided, validate it's integer 1-5

### 5. Export from barrel

Add `normalizeTrustScore` to appropriate barrel export (`utils` or `types`).

## Verification

- [ ] `normalizeTrustScore(0.0)` returns 5 (Secret)
- [ ] `normalizeTrustScore(0.25)` returns 4 (Restricted)
- [ ] `normalizeTrustScore(0.5)` returns 3 (Confidential)
- [ ] `normalizeTrustScore(0.75)` returns 2 (Internal)
- [ ] `normalizeTrustScore(1.0)` returns 1 (Public)
- [ ] `normalizeTrustScore(3)` returns 3 (passthrough for already-migrated)
- [ ] Intermediate floats (0.33, 0.6) map to correct tier
- [ ] MemoryService.create() defaults to integer trust level
- [ ] Search results return integer trust values regardless of stored format
- [ ] Unit tests cover all canonical values + edge cases
- [ ] Works correctly both before and after batch migration (Task 101)
