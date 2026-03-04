# Task 73: App Client Endpoint A — memories.get with Relationship Previews

**Milestone**: [M15 - Relationship GUI App Endpoints](../../milestones/milestone-15-relationship-gui-app-endpoints.md)
**Estimated Time**: 3-4 hours
**Dependencies**: [Task 71](task-71-relationship-getbyid-searchfilters.md)
**Status**: Not Started

---

## Objective

Create `src/app/memories.ts` with a `MemoriesResource` exposing `get()` — a compound endpoint returning a memory plus its relationships with memory title previews.

---

## Context

The agentbase.me memory view page (`/memory/$memoryId`) needs to display the memory document alongside a list of its relationships, each showing preview titles of related memories. Without this compound endpoint, the consumer must: (1) fetch memory, (2) find relationships containing it, (3) for each relationship, batch-fetch preview memories — an N+1 fan-out.

Route: `GET /api/app/v1/memories/:memoryId?includeRelationships=true&relationshipMemoryLimit=5`

---

## Steps

### 1. Create `src/app/memories.ts`

```typescript
import type { HttpClient } from '../clients/http.js';
import type { SdkResponse } from '../clients/response.js';

export interface MemoriesResource {
  get(
    userId: string,
    memoryId: string,
    options?: {
      includeRelationships?: boolean;
      relationshipMemoryLimit?: number;
    }
  ): Promise<SdkResponse<MemoryWithRelationships>>;
}

interface MemoryWithRelationships {
  memory: unknown;  // Full Memory document
  relationships?: RelationshipWithPreviews[];
}

interface RelationshipWithPreviews {
  id: string;
  relationship_type: string;
  observation: string;
  strength: number;
  confidence: number;
  source: 'user' | 'rem' | 'rule';
  memory_count: number;
  memory_previews: MemoryPreview[];
}

interface MemoryPreview {
  memory_id: string;
  title: string;        // Memory.title ?? content[:80]
  author_id: string;    // Memory.owner_id ?? Memory.user_id
  space_ids: string[];
  group_ids: string[];
}

export function createMemoriesResource(http: HttpClient): MemoriesResource {
  return {
    get(userId, memoryId, options) {
      const params: Record<string, string> = {};
      if (options?.includeRelationships) params.includeRelationships = 'true';
      if (options?.relationshipMemoryLimit != null) {
        params.relationshipMemoryLimit = String(options.relationshipMemoryLimit);
      }

      return http.request('GET', `/api/app/v1/memories/${memoryId}`, {
        userId,
        params,
      });
    },
  };
}
```

### 2. Create colocated test `src/app/memories.spec.ts`

Test with mocked HttpClient:
- Correct URL with memoryId path param
- `includeRelationships=true` query param when set
- `relationshipMemoryLimit` query param when provided
- Params omitted when options not provided
- userId in headers
- Response shape

### 3. Server-side implementation notes

The REST server handler (in remember-rest-service) will:
1. Call `MemoryService.getById(memoryId)` — return 404 if not found
2. If `includeRelationships=true`:
   a. Call `RelationshipService.findByMemoryIds({ memory_ids: [memoryId] })`
   b. For each relationship, take `memory_ids`, exclude current `memoryId`
   c. Batch-fetch up to `relationshipMemoryLimit` (default 5, max 10) memories
   d. Sort previews alphabetically by title
   e. Build `MemoryPreview` objects:
      - `title`: `memory.title ?? memory.content.substring(0, 80)`
      - `author_id`: `memory.owner_id ?? memory.user_id`
      - `space_ids`: `memory.space_ids ?? []`
      - `group_ids`: `memory.group_ids ?? []`
   f. Set `memory_count` to full `relationship.memory_ids.length`
3. Return `{ memory, relationships }` (or just `{ memory }` if includeRelationships=false)

---

## Verification

- [ ] `src/app/memories.ts` created with `MemoriesResource` interface
- [ ] `createMemoriesResource()` factory exported
- [ ] `get()` constructs correct URL with path param and query params
- [ ] `includeRelationships` and `relationshipMemoryLimit` passed as query params
- [ ] Types exported: `MemoryWithRelationships`, `RelationshipWithPreviews`, `MemoryPreview`
- [ ] Colocated spec file with tests
- [ ] Build compiles without errors
- [ ] All existing tests pass

---

**Next Task**: [Task 74](task-74-app-factory-openapi-tests.md)
**Related Design Docs**: [Relationship GUI App Endpoints](../../design/local.relationship-gui-app-endpoints.md)
