# Task 101: Weaviate Schema Migration

**Milestone**: M19 — Trust Level Redesign
**Status**: not_started
**Estimated Hours**: 3–4
**Dependencies**: Task 98 (TrustLevel types)

---

## Objective

Migrate all existing `trust_score` values in Weaviate from float 0–1 (higher=open) to integer 1–5 (higher=confidential). Handle the schema field type change and provide a migration script.

## Context

Every memory in Weaviate has a `trust_score` float field. We need to:
1. Invert the semantics (old 0 = private → new 5 = Secret)
2. Map continuous floats to discrete integers
3. Handle intermediate values that don't land on exact tier boundaries

## Steps

### 1. Define migration mapping

| Old Float Range | New Integer | Label |
|----------------|-------------|-------|
| 0.0–0.124 | 5 | Secret |
| 0.125–0.374 | 4 | Restricted |
| 0.375–0.624 | 3 | Confidential |
| 0.625–0.874 | 2 | Internal |
| 0.875–1.0 | 1 | Public |

Rounding strategy: nearest tier boundary with inversion. For exact old tier values:
- 0.0 → 5 (Secret)
- 0.25 → 4 (Restricted)
- 0.5 → 3 (Confidential)
- 0.75 → 2 (Internal)
- 1.0 → 1 (Public)

### 2. Investigate Weaviate field type change

Determine if Weaviate supports:
- In-place field type change (float → int) — likely not
- Adding new int field alongside old float, migrating, then removing old
- Weaviate v3 `number` type can store integers — may not need schema change if we just store integer values as floats (1.0, 2.0, etc.)

Pragmatic approach: keep Weaviate field as `number` type, store integer values (1, 2, 3, 4, 5). Validate at application layer.

### 3. Write migration function

```typescript
function migrateTrustScore(oldFloat: number): TrustLevel {
  // Invert and map to nearest tier
  const inverted = 1 - oldFloat;
  if (inverted >= 0.875) return TrustLevel.SECRET;      // 5
  if (inverted >= 0.625) return TrustLevel.RESTRICTED;   // 4
  if (inverted >= 0.375) return TrustLevel.CONFIDENTIAL; // 3
  if (inverted >= 0.125) return TrustLevel.INTERNAL;     // 2
  return TrustLevel.PUBLIC;                               // 1
}
```

### 4. Create batch migration script

- Iterate all collections in Weaviate
- For each memory, read `trust_score`, apply `migrateTrustScore()`, write back
- Log stats: total migrated, per-tier distribution, any anomalies
- Idempotent: skip if value is already integer 1–5

### 5. Update Weaviate schema definitions

- Update `schema.ts` / `space-schema.ts` property definitions
- Update any filter builders that reference `trust_score`
- Ensure query filters use integer comparison

### 6. Update Weaviate filter utilities

- `buildTrustFilter()` already updated in task-99 — verify integration

## Verification

- [ ] Migration function correctly maps all 5 canonical values
- [ ] Migration function handles intermediate floats (0.33, 0.6, etc.)
- [ ] Migration is idempotent (safe to run multiple times)
- [ ] Weaviate schema property updated or compatible with integer storage
- [ ] Batch migration script processes all collections
- [ ] Migration logs show per-tier distribution
