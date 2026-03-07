# Bug Report: Phase 0 Weaviate Filter Chain + Phase 7 Classification Parse Failures

**Date**: 2026-03-07
**Reported by**: remember-rem worker logs
**remember-core version**: 0.43.1
**Severity**: Medium (non-fatal, phases degrade gracefully)

---

## Bug 1: Phase 0 — Weaviate `.and()` chain syntax error

### Error

```
{"level":"WARN","message":"Phase 0 scoring failed, continuing with relationship discovery","error":"collection.filter.byProperty(...).equal(...).and is not a function"}
```

### Root Cause

Several files use the **chained `.and()` method** on Weaviate filter builders, which does not exist in the Weaviate client v3 API. The correct API is `Filters.and(filter1, filter2, ...)`.

### Affected Files

- `src/services/rem-phase0.scoring.ts:62` — `collection.filter.byProperty('doc_type').equal('memory').and().byProperty('rem_touched_at').isNull(true)`
- `src/services/rem-phase0.scoring.ts:78` — same pattern with `.isNull(false)`
- `src/services/rem.service.ts:591` — same pattern
- `src/services/rem.service.ts:608` — same pattern
- `src/services/rem.pruning.ts:107-108` — chained `.and()` calls
- `src/services/rem.reconciliation.ts:74-75` — chained `.and()` calls
- `src/services/scoring-context.service.ts:81,117,170` — chained `.and()` calls

### Fix

Replace chained `.and()` with `Filters.and()`:

```typescript
// BEFORE (broken)
const filter = collection.filter.byProperty('doc_type').equal('memory')
  .and().byProperty('rem_touched_at').isNull(true);

// AFTER (correct)
import { Filters } from 'weaviate-client';

const filter = Filters.and(
  collection.filter.byProperty('doc_type').equal('memory'),
  collection.filter.byProperty('rem_touched_at').isNull(true),
);
```

### Note

The CHANGELOG (line 731) mentions this was previously fixed, but the fix was incomplete — several files still use the broken chained syntax. Files like `space.service.ts` and `rem.clustering.ts` already use the correct `Filters.and()` pattern.

---

## Bug 2: Phase 7 — Classification parse failures

### Error

```
{"level":"WARN","message":"Classification: Failed to parse Haiku response","memoryId":"af559fb6-2b3d-4c86-9f90-fdbc7ff0d314"}
{"level":"WARN","message":"Classification: Failed to parse Haiku response","memoryId":"c8732ecd-3863-54cb-8828-b75ff108dd6f"}
{"level":"WARN","message":"Classification: Failed to parse Haiku response","memoryId":"a75bd4bd-e468-57c6-8e3b-1616fde7eb5e"}
{"level":"WARN","message":"Classification: Failed to parse Haiku response","memoryId":"a19ae1ac-ed47-5a0a-ab89-a873ac2e3175"}
```

### Root Cause

`parseClassificationResponse()` in `src/services/rem.classification.ts:97` calls `JSON.parse()` on the Haiku response. Despite the prompt saying "Return ONLY valid JSON (no markdown fences)", Haiku frequently returns:
- Markdown-fenced JSON (handled by the regex strip, but edge cases may slip through)
- Explanatory text before/after the JSON
- Malformed JSON (trailing commas, unquoted keys)

The current parser strips `` ```json `` and `` ``` `` fences, but fails silently on anything else.

### Suggested Fixes

1. **Log the raw response** on parse failure for debugging:
   ```typescript
   if (!classification) {
     logger.warn?.('Classification: Failed to parse Haiku response', {
       memoryId: memory.uuid,
       rawResponse: rawResponse.slice(0, 500), // truncate for log safety
     });
   }
   ```

2. **Extract JSON from mixed text** — find the first `{...}` block:
   ```typescript
   const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
   if (!jsonMatch) return null;
   const parsed = JSON.parse(jsonMatch[0]);
   ```

3. **Retry with stricter prompting** — prefix with a system message or use `prefill` to force JSON output.

---

## Impact

- **Phase 0 failure**: Emotional scoring is entirely skipped for every collection. No `feel_*` or `functional_*` dimensions are scored. This means emotional weighting, mood updates, and perception (Phases 8-10) all operate without scoring data.
- **Phase 7 failures**: ~4 out of 20 memories failed classification in the observed run (~20% skip rate). Classifications are eventually retried on the next cycle, but high skip rates slow convergence.

Both bugs are non-fatal — the REM cycle continues and completes — but they prevent full phase coverage.
