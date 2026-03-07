# Task 184: Engagement Counters + SVC Client

**Milestone**: M36 — byCurated Sort Mode
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 179, Task 183
**Design Reference**: [byCurated Sort Mode](../../design/local.by-curated-sort-mode.md)

---

## Objective

Add engagement counter increment methods to MemoryService (click_count, share_count, comment_count), add byCurated to the SVC client, and update OpenAPI spec.

## Steps

### 1. MemoryService Engagement Counters

Add to MemoryService:

```typescript
async incrementClick(memoryId: string): Promise<void>
async incrementShare(memoryId: string): Promise<void>
async incrementComment(memoryId: string): Promise<void>
```

Each reads current count from Weaviate, increments by 1, writes back. These are atomic per-memory (no concurrent increment concern at current scale).

### 2. SVC Client — byCurated

Add to `SpacesResource` and `MemoriesResource`:

```typescript
byCurated(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
```

Routes:
- `POST /api/svc/v1/memories/by-curated`
- `POST /api/svc/v1/spaces/by-curated`

### 3. SVC Client — Engagement

Add to `MemoriesResource`:

```typescript
incrementClick(userId: string, memoryId: string): Promise<SdkResponse<void>>;
incrementShare(userId: string, memoryId: string): Promise<SdkResponse<void>>;
incrementComment(userId: string, memoryId: string): Promise<SdkResponse<void>>;
```

Routes:
- `POST /api/svc/v1/memories/:id/click`
- `POST /api/svc/v1/memories/:id/share`
- `POST /api/svc/v1/memories/:id/comment-count` (avoids conflict with comments resource)

### 4. OpenAPI Spec Updates

Update `docs/openapi.yaml` with:
- `by-curated` endpoints for memories and spaces
- Engagement counter endpoints
- `CuratedMemory` response schema with `curated_score` and optional `curated_breakdown`

### 5. Update Method Count

Update `src/clients/svc/v1/index.spec.ts` method count assertion.

### 6. Live E2E Tests

Add to `test/live/suites/`:
- byCurated for memories and spaces
- Engagement counter increment + verify

## Verification

- [ ] `incrementClick/Share/Comment` increment Weaviate counters
- [ ] SVC client `byCurated` methods on memories and spaces resources
- [ ] SVC client engagement counter methods
- [ ] OpenAPI spec updated with new endpoints
- [ ] Method count assertion updated
- [ ] Unit tests for increment methods
- [ ] Unit tests for SVC client methods
- [ ] Live e2e test file created
- [ ] Barrel exports updated
