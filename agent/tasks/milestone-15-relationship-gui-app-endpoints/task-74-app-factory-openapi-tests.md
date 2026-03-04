# Task 74: AppClient Factory + OpenAPI Specs + Tests

**Milestone**: [M15 - Relationship GUI App Endpoints](../../milestones/milestone-15-relationship-gui-app-endpoints.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 72](task-72-app-endpoint-b-relationship-memories.md), [Task 73](task-73-app-endpoint-a-memory-with-relationships.md)
**Status**: Not Started

---

## Objective

Wire the new `MemoriesResource` and `RelationshipsResource` into the `AppClient` factory, update OpenAPI specs with endpoint schemas, regenerate types, update barrel exports, and ensure all tests pass.

---

## Context

Tasks 72 and 73 create the individual resource modules. This task integrates them into the `createAppClient()` factory, updates the OpenAPI specs so generated types stay in sync, and runs the full test suite to verify nothing broke.

---

## Steps

### 1. Update `src/app/index.ts`

Add imports and wire new resources:

```typescript
import { createMemoriesResource } from './memories.js';
import { createRelationshipsResource } from './relationships.js';
import type { MemoriesResource } from './memories.js';
import type { RelationshipsResource } from './relationships.js';

export interface AppClient {
  profiles: ProfilesResource;
  ghost: GhostResource;
  memories: MemoriesResource;          // NEW
  relationships: RelationshipsResource; // NEW
}

export function createAppClient(config: HttpClientConfig): AppClient {
  assertServerSide();
  const http = new HttpClient(config);

  return {
    profiles: createProfilesResource(http),
    ghost: createGhostResource(http),
    memories: createMemoriesResource(http),          // NEW
    relationships: createRelationshipsResource(http), // NEW
  };
}

// Re-export new types
export type { MemoriesResource } from './memories.js';
export type { RelationshipsResource } from './relationships.js';
```

### 2. Update `src/app/index.spec.ts`

Update the existing app client test to verify `memories` and `relationships` resources are present on the client object.

### 3. Update OpenAPI Spec — App Tier (`docs/openapi-web.yaml`)

Add schemas for:
- `GET /api/app/v1/memories/{memoryId}` — with query params, response schema including `RelationshipWithPreviews` and `MemoryPreview`
- `GET /api/app/v1/relationships/{relationshipId}/memories` — with query params, response schema including `RelationshipMetadata`

### 4. Update OpenAPI Spec — Svc Tier (`docs/openapi.yaml`)

Add `relationship_ids` to the `SearchFilters` schema (array of strings, optional).

### 5. Regenerate Types

```bash
npm run generate:types
```

Verify generated types compile and match expected shapes.

### 6. Export new types from services barrel

If `GetRelationshipResult` was added in task-71, ensure it's exported from `src/services/index.ts`.

### 7. Run Full Test Suite

```bash
npm test
```

All tests (536+ existing + new from tasks 71-73) must pass.

### 8. Typecheck

```bash
npm run typecheck
```

---

## Verification

- [ ] `AppClient` interface includes `memories: MemoriesResource` and `relationships: RelationshipsResource`
- [ ] `createAppClient()` wires both new resources
- [ ] `src/app/index.spec.ts` updated with new resource assertions
- [ ] `docs/openapi-web.yaml` has both endpoint schemas
- [ ] `docs/openapi.yaml` has `relationship_ids` on SearchFilters
- [ ] `npm run generate:types` succeeds
- [ ] Generated types match response shapes
- [ ] `npm test` passes (all suites)
- [ ] `npm run typecheck` passes
- [ ] New type exports in barrels

---

**Related Design Docs**: [Relationship GUI App Endpoints](../../design/local.relationship-gui-app-endpoints.md)
