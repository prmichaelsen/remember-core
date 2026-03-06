# Task 142: SVC Client, OpenAPI Spec, and Generated Types

**Milestone**: M27 — byRecommendation Sort Mode
**Status**: Not Started
**Estimated Hours**: 1-2
**Dependencies**: Task 140, Task 141

---

## Objective

Add `byRecommendation` to the SVC client SDK, update OpenAPI spec with the new sort mode value and response fields, and regenerate types.

---

## Steps

1. Add `byRecommendation` to `sort_mode` enum in `docs/openapi.yaml`
2. Add `similarity_pct` field to memory response schema (optional, number 0-100)
3. Add `fallback_sort_mode` field to search response schema (optional, enum: `byDiscovery`)
4. Run type generation: `npx openapi-typescript docs/openapi.yaml -o src/clients/svc/v1/types.generated.ts`
5. Add `byRecommendation` method to SVC client memories resource (1:1 REST mirror)
6. Verify generated types include new fields

---

## Verification

- [ ] OpenAPI spec includes `byRecommendation` in sort_mode enum
- [ ] `similarity_pct` and `fallback_sort_mode` in response schema
- [ ] Generated types compile without errors
- [ ] SVC client method makes correct REST call
- [ ] SVC client response includes new fields
