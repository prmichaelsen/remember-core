# Task 82: Add includeSimilar Support to AppClient.memories.get()

**Milestone**: [M15 - Relationship GUI App Endpoints](../../milestones/milestone-15-relationship-gui-app-endpoints.md)
**Estimated Time**: 1-2 hours
**Dependencies**: [Task 73](task-73-app-endpoint-a-memory-with-relationships.md)
**Status**: Not Started

---

## Objective

Add `includeSimilar` and `similarLimit` options to `AppClient.memories.get()` so the app-tier endpoint can return memory + relationships + similar memories in a single compound response. This eliminates the need for agentbase.me to make a parallel SvcClient call for similar memories.

---

## Context

Currently agentbase.me's memory detail page makes two parallel calls:
1. `appClient.memories.get(userId, memoryId, { includeRelationships: true })` — memory + relationships
2. `svcClient.memories.get(userId, memoryId, { author, space, group, include: 'similar' })` — similar memories

The second call passes `author/space/group` context params which can be stale/invalid, causing 404s. By adding `includeSimilar` to the app-tier endpoint, the frontend can make a single call and the server uses `MemoryResolutionService` to resolve the correct collection for both the memory and similar lookups.

---

## Steps

### 1. Update MemoriesResource options and response type

**File**: `src/app/memories.ts`

Add `includeSimilar` and `similarLimit` to the options, and `similar_memories` to the response:

```typescript
export interface MemoryWithRelationships {
  memory: unknown;
  relationships?: RelationshipWithPreviews[];
  similar_memories?: unknown[];
}

export interface MemoriesResource {
  get(
    userId: string,
    memoryId: string,
    options?: {
      includeRelationships?: boolean;
      relationshipMemoryLimit?: number;
      includeSimilar?: boolean;
      similarLimit?: number;
    },
  ): Promise<SdkResponse<MemoryWithRelationships>>;
}
```

### 2. Pass new params in SDK request

In `createMemoriesResource`, add the new query params:

```typescript
if (options?.includeSimilar) params.includeSimilar = 'true';
if (options?.similarLimit != null) params.similarLimit = String(options.similarLimit);
```

### 3. Update OpenAPI spec

**File**: `docs/openapi-web.yaml`

Add `GET /api/app/v1/memories/{memoryId}` endpoint with query parameters:
- `includeRelationships` (boolean)
- `relationshipMemoryLimit` (integer)
- `includeSimilar` (boolean)
- `similarLimit` (integer, default 5)

Response schema includes `similar_memories` array.

### 4. Update tests

Add unit test verifying `includeSimilar` and `similarLimit` are passed as query params.

### 5. Verify

```bash
npm run build
npm run test
```

---

## Verification

- [ ] `MemoryWithRelationships` includes optional `similar_memories` field
- [ ] `MemoriesResource.get()` accepts `includeSimilar` and `similarLimit` options
- [ ] SDK passes params as query strings to `GET /api/app/v1/memories/:id`
- [ ] OpenAPI spec updated with new endpoint and params
- [ ] Unit tests pass
- [ ] TypeScript builds cleanly

---

## Notes

- `similarLimit` defaults to 5 on the server side (SDK just passes the param)
- The server-side handler (in remember-rest-service) will use `MemoryResolutionService` to find the memory and `MemoryService.findSimilar()` on the resolved collection
- This eliminates the need for agentbase.me to make a parallel SvcClient call with potentially stale context params
- The SvcClient `memories.get()` is unchanged — raw, single-collection, no fallback
