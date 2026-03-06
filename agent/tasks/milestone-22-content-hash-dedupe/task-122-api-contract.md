# Task 122: API Contract — also_in Metadata and Dedupe Parameter

**Milestone**: [M22 - Content Hash Deduplication](../../milestones/milestone-22-content-hash-dedupe.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 121: Service-Layer Deduplication](task-121-service-deduplication.md)
**Status**: Not Started

---

## Objective

Expose deduplication metadata (`also_in`) in API responses and add a `dedupe` parameter to allow disabling deduplication.

---

## Context

With service-layer deduplication in place (task-121), the API needs to surface the results. Responses should include `also_in` on deduped memories (listing contexts where duplicates were removed). A `dedupe` query parameter allows clients to disable deduplication for admin views or debugging.

---

## Steps

### 1. Update Response Types

Add `also_in` to the memory response type:

```typescript
interface MemoryResponse {
  // ... existing fields
  also_in?: Array<{ source: string; id: string }>;
}
```

### 2. Add dedupe Query Parameter

Add `dedupe` (boolean, default true) to relevant search/query endpoints:
- Search endpoint
- Any aggregate feed endpoints
- Similar memories endpoint (if applicable)

### 3. Pass Options Through

Wire the `dedupe` parameter through from the REST layer to the service layer's `DedupeOptions`.

### 4. Update OpenAPI Spec

Update `docs/openapi.yaml` (and `docs/openapi-web.yaml` if applicable):
- Add `also_in` to memory response schema
- Add `dedupe` query parameter to search endpoints

### 5. Write Tests

- Search with default dedupe → duplicates removed, `also_in` present
- Search with `dedupe=false` → all results returned, no `also_in`
- `also_in` contains correct source and ID info

---

## Verification

- [ ] `also_in` field in memory response types
- [ ] `dedupe` query parameter accepted on search endpoints
- [ ] Default behavior deduplicates (dedupe=true)
- [ ] `dedupe=false` disables deduplication
- [ ] OpenAPI specs updated
- [ ] All new tests pass
- [ ] Existing API tests still pass

---

**Next Task**: None (final task in M22)
**Related Design Docs**: [Content Hash Deduplication](../../design/local.content-hash-dedupe.md)
