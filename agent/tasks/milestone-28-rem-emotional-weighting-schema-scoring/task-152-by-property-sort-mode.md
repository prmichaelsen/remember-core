# Task 152: byProperty Sort Mode

**Milestone**: [M28 - REM Emotional Weighting -- Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 3 hours
**Dependencies**: Task 145
**Status**: Not Started

---

## Objective

Implement a generic `byProperty` sort mode that sorts memories by any Weaviate property value, supporting `sort_field`, `sort_direction` (asc/desc), `limit`, and `offset` parameters. This is a pure sort mode -- no vector search involved.

---

## Context

With 37 new properties on memories (31 dimensions + 3 composites + 2 REM metadata + 1 observation), users and applications need the ability to sort by any of them. The design doc specifies a generic `byProperty` sort mode rather than dimension-specific sort modes, making it future-proof for any new properties.

Examples from the design doc:
```typescript
// Most emotionally significant memories
{ sort_mode: 'byProperty', sort_field: 'total_significance', sort_direction: 'desc' }

// Highest coherence tension (conflicting beliefs)
{ sort_mode: 'byProperty', sort_field: 'feel_coherence_tension', sort_direction: 'desc' }

// Most traumatic memories
{ sort_mode: 'byProperty', sort_field: 'feel_trauma', sort_direction: 'desc' }
```

---

## Key Design Decisions

### Sort Mode Architecture

| Decision | Choice | Rationale |
|---|---|---|
| Sort mode name | `byProperty` | Generic, not tied to emotional dimensions |
| Required params | `sort_field` + `sort_direction` | Explicit field and direction |
| sort_direction values | `'asc'` or `'desc'` | Standard ascending/descending |
| Pagination | `limit` + `offset` | Standard pagination params |
| Vector search | None -- pure sort | No embedding similarity involved |
| sort_field validation | Must be a valid Weaviate property name | Reject invalid fields with clear error |
| Applicable to | Any Weaviate property (feel_*, functional_*, total_significance, created_at, etc.) | Fully generic |

---

## Steps

### 1. Add byProperty to sort_mode Enum

Add `byProperty` as a new value in the sort_mode enum/type:

```typescript
type SortMode = 'byRelevance' | 'byDate' | 'byProperty' | /* existing modes */;

interface ByPropertySortParams {
  sort_mode: 'byProperty';
  sort_field: string;        // Any valid Weaviate property name
  sort_direction: 'asc' | 'desc';
  limit?: number;            // Default pagination limit
  offset?: number;           // Default 0
}
```

When `sort_mode` is `byProperty`, `sort_field` and `sort_direction` are required parameters.

### 2. Implement Property Validation

Create a validation function that checks `sort_field` against valid Weaviate property names:
- All 21 `feel_*` properties: `feel_emotional_significance`, `feel_vulnerability`, `feel_trauma`, `feel_humor`, `feel_happiness`, `feel_sadness`, `feel_fear`, `feel_anger`, `feel_surprise`, `feel_disgust`, `feel_contempt`, `feel_embarrassment`, `feel_shame`, `feel_guilt`, `feel_excitement`, `feel_pride`, `feel_valence`, `feel_arousal`, `feel_dominance`, `feel_intensity`, `feel_coherence_tension`
- All 10 `functional_*` properties: `functional_salience`, `functional_urgency`, `functional_social_weight`, `functional_agency`, `functional_novelty`, `functional_retrieval_utility`, `functional_narrative_importance`, `functional_aesthetic_quality`, `functional_valence`, `functional_coherence_tension`
- Composites: `feel_significance`, `functional_significance`, `total_significance`
- REM metadata: `rem_touched_at`, `rem_visits`
- Existing properties (e.g., `created_at`, `content_type`, etc.)
- Return clear error message for invalid `sort_field`

### 3. Implement Weaviate Sort Query

Use Weaviate's native sort capability (not vector search) to order results:

```typescript
// Weaviate GraphQL sort syntax
{
  Get {
    Memory(
      sort: [{ path: [sort_field], order: sort_direction }]
      limit: limit
      offset: offset
    ) {
      // ... properties
    }
  }
}
```

- Null values: memories with null values for the sort field should be sorted last (regardless of direction) or filtered out -- document the chosen behavior
- Pagination: respect `limit` and `offset` parameters

### 4. Integrate with Search APIs

Wire `byProperty` into search endpoints:
- Space search / space query
- Memory search
- When `sort_mode: 'byProperty'` is specified, use the Weaviate sort query instead of vector search
- Ensure existing filters (collection, space, trust level, etc.) still apply alongside the sort

### 5. Update OpenAPI Specs

Update both `docs/openapi.yaml` (svc) and `docs/openapi-web.yaml` (app):
- Add `byProperty` to the `sort_mode` enum
- Add `sort_field` (string) and `sort_direction` (enum: asc, desc) parameters
- Document that these are required when `sort_mode` is `byProperty`
- Document that `byProperty` is a pure sort (no vector search)

### 6. Write Tests

Create colocated `.spec.ts` tests:
- `sort_mode: 'byProperty'` accepted by search APIs
- `sort_field` accepts all `feel_*` property names (test with `feel_trauma`, `feel_valence`, `feel_coherence_tension`)
- `sort_field` accepts all `functional_*` property names (test with `functional_salience`, `functional_urgency`)
- `sort_field` accepts composite names (`total_significance`, `feel_significance`, `functional_significance`)
- `sort_field` accepts REM metadata (`rem_touched_at`, `rem_visits`)
- `sort_direction: 'asc'` returns ascending order
- `sort_direction: 'desc'` returns descending order
- Invalid `sort_field` returns clear error
- `limit` and `offset` pagination works correctly
- No vector search involved (pure sort)
- Existing filters apply alongside byProperty sort
- Memories with null sort_field values handled gracefully

---

## Verification

- [ ] `sort_mode: 'byProperty'` accepted by space search, space query, and memory search
- [ ] `sort_field` accepts any valid Weaviate property name
- [ ] `sort_field` validated -- invalid names return clear error
- [ ] `sort_direction` supports both `'asc'` and `'desc'`
- [ ] Results correctly ordered by the specified property and direction
- [ ] Pagination (`limit`, `offset`) works with `byProperty`
- [ ] No vector search involved (pure sort)
- [ ] Existing filters (collection, space, trust level) still apply
- [ ] Null sort_field values handled gracefully (sorted last or documented behavior)
- [ ] OpenAPI specs updated in both `docs/openapi.yaml` and `docs/openapi-web.yaml`
- [ ] Tests colocated with source file using `.spec.ts` suffix
- [ ] All tests pass

---

## Expected Output

A generic `byProperty` sort mode available across all search APIs that sorts memories by any Weaviate property in ascending or descending order. Supports pagination via `limit` and `offset`. Validates `sort_field` against known properties. Pure sort with no vector search involved. Works alongside existing filters.

---

**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
