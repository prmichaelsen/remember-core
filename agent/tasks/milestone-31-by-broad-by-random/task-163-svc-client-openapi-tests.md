# Task 163: SVC Client, OpenAPI, Unit Tests

**Milestone**: M31 — byBroad & byRandom
**Status**: Not Started
**Estimated Hours**: 2-3
**Dependencies**: Tasks 161-162

---

## Objective

Add SVC client methods, OpenAPI spec endpoints, and comprehensive unit tests for byBroad and byRandom.

## Context

- **Design doc**: `agent/design/local.new-search-tools.md`
- SVC client at `remember-core/clients/svc/v1` — 1:1 REST mirror
- OpenAPI spec: `docs/openapi.yaml`
- Tests colocated with source files using `.spec.ts` suffix

## SVC Client Methods

```typescript
// Add to SVC client
memories.byBroad(userId: string, input: BroadModeRequest): Promise<{ data: BroadModeResult | null; error: ApiError | null }>;
memories.byRandom(userId: string, input: RandomModeRequest): Promise<{ data: RandomModeResult | null; error: ApiError | null }>;
```

### Endpoints

- `POST /api/svc/v1/memories/by-broad` — accepts BroadModeRequest, returns BroadModeResult
- `POST /api/svc/v1/memories/by-random` — accepts RandomModeRequest, returns RandomModeResult

## OpenAPI Spec Additions

Add to `docs/openapi.yaml`:

### `/api/svc/v1/memories/by-broad` POST

- **Request body**: BroadModeRequest schema (query, sort_order, limit, offset, filters, deleted_filter)
- **Response**: BroadModeResult schema with BroadSearchResult array
- **BroadSearchResult schema**: memory_id, title, content_type, content_head, content_mid, content_tail, created_at, tags, weight, total_significance, feel_significance, functional_significance

### `/api/svc/v1/memories/by-random` POST

- **Request body**: RandomModeRequest schema (query, limit, filters, deleted_filter)
- **Response**: RandomModeResult schema with Memory array and total_pool_size

## Unit Tests

**IMPORTANT**: Tests are COLOCATED with source files using `.spec.ts` suffix. NEVER use `__tests__/` directories.

### byBroad Unit Tests

```
describe('byBroad')
  describe('content truncation')
    - long content (> 300 chars): head=first 100, mid=middle 100, tail=last 100
    - short content (< 100 chars): all in head, mid and tail empty
    - medium content (100-200 chars): split between head and tail
    - content just under 300 chars: three even slices

  describe('response shape')
    - returns BroadSearchResult with all required fields
    - includes memory_id, title, content_type, created_at, tags, weight
    - includes emotional composites when available (total_significance, etc.)
    - emotional composites are undefined when not REM-scored

  describe('defaults')
    - default limit is 50
    - default sort_order is desc by created_at

  describe('filters')
    - types filter works
    - exclude_types filter works
    - tags filter works
    - weight_min/max filter works
    - trust_min/max filter works
    - date_from/to filter works
    - deleted_filter works (exclude, include, only)
    - ghost memories excluded by default

  describe('sorting')
    - sort_order asc returns oldest first
    - sort_order desc returns newest first
```

### byRandom Unit Tests

```
describe('byRandom')
  describe('random sampling')
    - returns random memories (not always the same set)
    - returns correct number of results (up to limit)
    - total_pool_size reflects actual pool size

  describe('edge cases')
    - empty collection returns empty results and total_pool_size=0
    - collection smaller than limit returns all available
    - deduplicates when same index picked twice
    - maxAttempts prevents infinite loop

  describe('filters')
    - types filter narrows the random pool
    - tags filter works
    - weight_min/max filter works
    - trust_min/max filter works
    - date_from/to filter works
    - deleted_filter works
    - ghost memories excluded by default

  describe('response shape')
    - returns full Memory objects (not truncated)
    - includes total_pool_size
```

### SVC Client Tests

```
describe('SVC Client - byBroad')
  - calls POST /api/svc/v1/memories/by-broad
  - returns { data, error } pattern
  - returns data on success
  - returns error on failure
  - passes filters correctly

describe('SVC Client - byRandom')
  - calls POST /api/svc/v1/memories/by-random
  - returns { data, error } pattern
  - returns data on success
  - returns error on failure
  - passes filters correctly
```

## Steps

1. Add `memories.byBroad(userId, input)` to SVC client — `POST /api/svc/v1/memories/by-broad`
2. Add `memories.byRandom(userId, input)` to SVC client — `POST /api/svc/v1/memories/by-random`
3. Update OpenAPI spec (`docs/openapi.yaml`) with both endpoints, request/response schemas
4. Write byBroad unit tests: content truncation for all length categories, response shape, defaults, filters, sorting
5. Write byRandom unit tests: random sampling, edge cases (empty, small collection, dedup), filters, response shape
6. Write SVC client tests for both methods (request/response, error handling)

## Verification

- [ ] SVC client methods `byBroad` and `byRandom` work correctly
- [ ] OpenAPI spec includes both endpoints with full request/response schemas
- [ ] All unit tests pass
- [ ] Content truncation tests cover: < 100 chars, 100-200 chars, 200-300 chars, > 300 chars
- [ ] Random sampling tests verify non-determinism and deduplication
- [ ] Edge case tests: empty collection, small collection, max attempts
- [ ] Filter tests for all supported filter fields
- [ ] SVC client tests verify { data, error } return pattern
- [ ] Existing tests unaffected
- [ ] Tests colocated with source files using `.spec.ts` suffix
- [ ] No `__tests__/` directories created
