# Task 72: App Client Endpoint B — relationships.getMemories

**Milestone**: [M15 - Relationship GUI App Endpoints](../../milestones/milestone-15-relationship-gui-app-endpoints.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 71](task-71-relationship-getbyid-searchfilters.md)
**Status**: Not Started

---

## Objective

Create `src/app/relationships.ts` with a `RelationshipsResource` exposing `getMemories()` — a paginated endpoint that returns a relationship's metadata plus its resolved memories.

---

## Context

The agentbase.me relationship view page (`/relationships/$relationshipId`) needs to display relationship metadata and infinite-scroll through its memories. This endpoint avoids the consumer having to fetch the relationship, extract memory_ids, paginate the array, and batch-fetch memories separately.

Route: `GET /api/app/v1/relationships/:relationshipId/memories?limit=20&offset=0`

---

## Steps

### 1. Create `src/app/relationships.ts`

```typescript
import type { HttpClient } from '../clients/http.js';
import type { SdkResponse } from '../clients/response.js';

export interface RelationshipsResource {
  getMemories(
    userId: string,
    relationshipId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<SdkResponse<RelationshipMemoriesResponse>>;
}

interface RelationshipMemoriesResponse {
  relationship: RelationshipMetadata;
  memories: unknown[];  // Full Memory documents
  total: number;
  has_more: boolean;
}

interface RelationshipMetadata {
  id: string;
  relationship_type: string;
  observation: string;
  strength: number;
  confidence: number;
  source: 'user' | 'rem' | 'rule';
  memory_count: number;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export function createRelationshipsResource(http: HttpClient): RelationshipsResource {
  return {
    getMemories(userId, relationshipId, options) {
      const params: Record<string, string> = {};
      if (options?.limit != null) params.limit = String(options.limit);
      if (options?.offset != null) params.offset = String(options.offset);

      return http.request('GET', `/api/app/v1/relationships/${relationshipId}/memories`, {
        userId,
        params,
      });
    },
  };
}
```

### 2. Create colocated test `src/app/relationships.spec.ts`

Test with mocked HttpClient:
- Correct URL constructed with relationshipId
- Query params passed for limit/offset
- Default params omitted when not provided
- userId passed in headers
- Response shape matches SdkResponse

### 3. Server-side implementation notes

The REST server handler (in remember-rest-service, not remember-core) will:
1. Call `RelationshipService.getById(relationshipId)`
2. Verify `relationship.user_id === authenticated userId` (else 404)
3. Sort `memory_ids` alphabetically by resolved title
4. Slice by `offset` and `limit` (defaults: 0, 20; max limit: 50)
5. Batch-fetch memories via `MemoryService.getById()` per ID
6. Exclude soft-deleted, adjust `total`
7. Set `has_more = total > offset + memories.length`

---

## Verification

- [ ] `src/app/relationships.ts` created with `RelationshipsResource` interface
- [ ] `createRelationshipsResource()` factory exported
- [ ] `getMemories()` constructs correct URL with path param and query params
- [ ] Colocated spec file with tests for URL, params, headers, response shape
- [ ] Build compiles without errors
- [ ] All existing tests pass

---

**Next Task**: [Task 73](task-73-app-endpoint-a-memory-with-relationships.md)
**Related Design Docs**: [Relationship GUI App Endpoints](../../design/local.relationship-gui-app-endpoints.md)
