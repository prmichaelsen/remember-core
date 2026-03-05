# Task 108: SVC Client Methods

**Milestone**: [M20 - Memory Ratings System](../../milestones/milestone-20-memory-ratings-system.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 107](task-107-rest-endpoints.md)
**Status**: Not Started

---

## Objective

Add rating methods to the SVC client's MemoriesResource so consumers can rate memories via the typed SDK.

---

## Context

The SVC client wraps REST endpoints as typed methods with Supabase-style `{ data, error }` responses. Rating methods go on the existing MemoriesResource (not a new resource) since ratings are scoped to individual memories.

**Design Doc**: [agent/design/local.memory-ratings.md](../../design/local.memory-ratings.md)

---

## Steps

### 1. Add Methods to MemoriesResource

In `src/clients/svc/v1/memories.ts`, add:

```typescript
async rate(memoryId: string, rating: number): Promise<SdkResponse<RatingResponse>> {
  return this.http.put(`/memories/${memoryId}/rating`, { rating });
}

async retractRating(memoryId: string): Promise<SdkResponse<void>> {
  return this.http.delete(`/memories/${memoryId}/rating`);
}

async getMyRating(memoryId: string): Promise<SdkResponse<UserRatingResponse>> {
  return this.http.get(`/memories/${memoryId}/rating`);
}
```

### 2. Import Generated Types

Use the generated types from `types.generated.ts` for request/response typing.

### 3. Update Barrel Exports

Ensure new types are re-exported from `src/clients/svc/v1/index.ts`.

---

## Verification

- [ ] `client.memories.rate(id, 4)` sends PUT with `{ rating: 4 }`
- [ ] `client.memories.retractRating(id)` sends DELETE
- [ ] `client.memories.getMyRating(id)` sends GET
- [ ] All methods return `SdkResponse<T>` with `.throwOnError()` support
- [ ] Types match OpenAPI spec (generated, not hand-written)
- [ ] Exported from SVC client barrel
- [ ] `tsc --noEmit` clean

---

**Next Task**: [Task 109: Unit Tests](task-109-unit-tests.md)
**Related Design Docs**: [agent/design/local.memory-ratings.md](../../design/local.memory-ratings.md)
