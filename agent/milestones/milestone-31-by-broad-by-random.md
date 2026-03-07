# Milestone 31: byBroad & byRandom Sort Modes

**Goal**: Add two new search modes — `byBroad` (massive results with truncated head/mid/tail content) and `byRandom` (random sampling via Firestore memory index).

**Status**: Not Started
**Estimated Duration**: 0.5 weeks
**Dependencies**: M18 (Memory Index Lookup, complete)

---

## Overview

`byBroad` enables scan-and-drill-in workflows by returning many memories with truncated content (first ~100 chars, middle ~100 chars, last ~100 chars). `byRandom` enables serendipitous rediscovery by sampling random memories from the Firestore memory index without expensive Weaviate offset scanning.

Design doc: `agent/design/local.new-search-tools.md`

---

## Deliverables

1. `byBroad` method on MemoryService — truncated content response format
2. `byRandom` method on MemoryService — Firestore index random sampling
3. SVC client methods and OpenAPI spec updates
4. Unit tests for both modes

---

## Key Decisions

- **byBroad**: Returns `BroadSearchResult` with `content_head`, `content_mid`, `content_tail` (~100 chars each). Default limit: 50.
- **byRandom**: Queries Firestore memory index for all UUIDs in collection, picks N random offsets via `floor(N * rand())`, batch-fetches from Weaviate by UUID.
- Neither mode follows the standard sort-mode-method pattern (no Weaviate property sort).

---

## Tasks

### Task 161: byBroad Core Method — Truncated Content Response

**Objective**: Implement `MemoryService.byBroad()` that returns large result sets with truncated content to avoid context overload.

**Interface**:

```typescript
interface BroadSearchResult {
  memory_id: string;
  title?: string;
  content_type: string;
  content_head: string;   // First ~100 chars of content
  content_mid: string;    // ~100 chars from middle of content
  content_tail: string;   // Last ~100 chars of content
  created_at: string;
  tags: string[];
  weight: number;
  // Emotional composites (when REM-scored)
  total_significance?: number;
  feel_significance?: number;
  functional_significance?: number;
}

interface BroadSearchInput {
  user_id: string;
  collection?: string;
  query?: string;           // Optional text filter
  filters?: SearchFilters;  // Standard filters (types, tags, weight, trust, date, etc.)
  deleted_filter?: 'exclude' | 'include' | 'only';  // Default: 'exclude'
  limit?: number;           // Default: 50, max: 200
  offset?: number;
}
```

**Implementation Details**:
- Add `byBroad()` to `MemoryService` — does NOT follow standard sort-mode-method pattern
- Fetches full memories from Weaviate (any existing sort — default `byTime desc`), then truncates content in the service layer
- Content truncation logic: `content_head = content.slice(0, 100)`, `content_mid = content.slice(Math.floor(content.length / 2) - 50, Math.floor(content.length / 2) + 50)`, `content_tail = content.slice(-100)`
- For short content (< 300 chars): return full content in `content_head`, empty string for `content_mid` and `content_tail`
- Default limit: 50 (vs. 10 for other modes). Max limit: 200
- Standard `SearchFilters` supported (types, exclude_types, tags, weight_min/max, trust_min/max, date_from/to, rating_min, relationship_count_min/max, has_relationships)
- Include composite significance scores when available (null when memory not yet REM-scored)
- Optional `query` parameter for text filtering within the broad scan
- Add `BroadSearchResult` and `BroadSearchInput` types to `src/types/`
- Export from `src/services/` barrel

**Tests** (colocated `.spec.ts`):
- Truncation: content > 300 chars produces correct head/mid/tail slices
- Short content: content < 300 chars returns full content in head, empty mid/tail
- Default limit is 50
- SearchFilters work (type filtering, date range, tag filtering)
- Composite scores included when present, null/undefined when not scored
- Empty results return empty array

---

### Task 162: byRandom Core Method — Firestore Index Random Sampling

**Objective**: Implement `MemoryService.byRandom()` that returns random memories by sampling from the Firestore memory index.

**Interface**:

```typescript
interface RandomSearchInput {
  user_id: string;
  collection?: string;
  query?: string;           // Optional: constrain the random pool (e.g., tagged "idea")
  filters?: SearchFilters;  // Standard filters
  deleted_filter?: 'exclude' | 'include' | 'only';
  limit?: number;           // Default: 10
}
```

**Returns**: Standard `Memory[]` (full content, not truncated).

**Implementation Details**:
- Add `byRandom()` to `MemoryService` — does NOT follow standard sort-mode-method pattern
- **Fast path** (no query/filters): Query Firestore memory index (`memory_index` collection) for UUIDs belonging to user/collection. Select N random UUIDs using `Math.floor(Math.random() * totalCount)` offset picks. Batch-fetch selected UUIDs from Weaviate by ID.
- **Filtered path** (query or filters provided): Fetch a larger pool from Weaviate using standard search, then randomly sample N from the results (client-side shuffle). Less efficient but necessary since Firestore index doesn't have content/tags.
- Depends on M18 Firestore memory index (`memory_index/{memory_id}` documents with `user_id`, `collection`, `weaviate_id`)
- Default limit: 10
- Add `RandomSearchInput` type to `src/types/`
- Export from `src/services/` barrel

**Tests** (colocated `.spec.ts`):
- Returns requested number of results (or fewer if collection is smaller)
- Results are memories with full content
- No duplicate results in a single call
- With filters: results respect filter constraints
- Empty collection returns empty array
- Randomness: two calls with same params should (usually) return different results

---

### Task 163: SVC Client, OpenAPI Spec, and Unit Tests

**Objective**: Expose byBroad and byRandom through the SVC client and update OpenAPI spec.

**Implementation Details**:
- Add `byBroad` and `byRandom` to OpenAPI spec (`docs/openapi.yaml`):
  - `GET /api/svc/v1/memories/search/byBroad` — query params for filters, limit, offset
  - `GET /api/svc/v1/memories/search/byRandom` — query params for filters, limit
  - Response schemas for `BroadSearchResult[]` and `Memory[]`
- Regenerate types from OpenAPI spec (`npm run generate-types` or equivalent)
- Add SVC client methods:
  - `svc.memories.searchByBroad(input): SdkResponse<BroadSearchResult[]>`
  - `svc.memories.searchByRandom(input): SdkResponse<Memory[]>`
- Follow existing SVC client pattern (1:1 REST mirror, `{ data, error }` response, `.throwOnError()`)
- Add SVC client unit tests (colocated `.spec.ts`):
  - Verify correct HTTP method and path
  - Verify query parameter serialization
  - Verify response deserialization
