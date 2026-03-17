# Task 522: Filter Deleted Memories from getOrderedContent

**Milestone**: Unassigned (gap in M77 — Ordered Relationships)
**Design Reference**: [Ordered Relationships](../design/local.ordered-relationships.md)
**Estimated Time**: 2-3 hours
**Dependencies**: None (M77 complete, this is a follow-up fix)
**Status**: Not Started

---

## Objective

`getOrderedContent` currently returns all memories in a relationship including soft-deleted ones. It should exclude memories where `deleted_at` is set, unless the caller explicitly requests them via `include_deleted=true`.

---

## Context

When a memory is soft-deleted (`deleted_at`, `deleted_by`, `deletion_reason` set), it remains in the relationship's `related_memory_ids` and `member_order_json`. This is correct — deleted memories are "ghosts" that maintain their relationship link and can be restored.

However, `getOrderedContent` returns these deleted memories alongside active ones with no distinction. The task-72 design doc (relationship GUI app endpoints) states: "Exclude soft-deleted, adjust `total`" — but this was never implemented.

**Current behavior**: All memories returned, deleted or not.
**Desired behavior**: Exclude deleted by default. Include if `include_deleted=true` query param is passed.

The existing `buildDeletedFilter()` in `src/utils/filters.ts` already supports `'exclude' | 'include' | 'only'` modes for search/query operations, but the by-ID fetches used by ordered content don't use it.

---

## Steps

### 1. Add `include_deleted` Query Parameter to OpenAPI Spec

In `docs/openapi-web.yaml`, add to the `appGetOrderedContent` operation's parameters:

```yaml
- name: include_deleted
  in: query
  required: false
  schema:
    type: boolean
    default: false
  description: Include soft-deleted memories in results. Default false.
```

### 2. Regenerate Types

Run the OpenAPI type generation to pick up the new parameter:

```bash
npm run generate:types  # or whatever the project's type generation command is
```

### 3. Update the REST Handler

The handler that serves `GET /api/app/v1/relationships/:relationshipId/ordered-content` needs to:

1. Parse `include_deleted` from query params (default `false`)
2. After fetching memories by ID from the sorted `related_memory_ids`, filter out any where `deleted_at` is truthy (unless `include_deleted` is true)
3. Adjust `total` count to reflect filtered results
4. Adjust pagination (`has_more`, offset) based on filtered count

**Note**: The handler may live in the REST server package rather than in remember-core's `src/`. Locate it by searching for the route that serves `/api/app/v1/relationships/:relationshipId/ordered-content`.

### 4. Update App Client SDK

In `src/app/relationships.ts`, update `getOrderedContent` to accept and pass through the new parameter:

```typescript
getOrderedContent(userId, relationshipId, options?) {
  const params: Record<string, string> = {};
  if (options?.limit != null) params.limit = String(options.limit);
  if (options?.offset != null) params.offset = String(options.offset);
  if (options?.include_deleted) params.include_deleted = 'true';

  return http.request('GET', `/api/app/v1/relationships/${relationshipId}/ordered-content`, {
    userId,
    params,
  });
}
```

### 5. Update Tests

- **Unit test**: getOrderedContent passes `include_deleted` param when set
- **E2e test** in `ordered-relationships.e2e.ts`:
  - Create relationship with 3 memories
  - Soft-delete one memory
  - Call getOrderedContent — verify only 2 returned, total is 2
  - Call getOrderedContent with `include_deleted=true` — verify all 3 returned
  - Restore the deleted memory
  - Call getOrderedContent — verify all 3 returned again

### 6. Publish

Bump patch version and publish so agentbase.me can consume the fix.

---

## Verification

- [ ] `getOrderedContent` excludes soft-deleted memories by default
- [ ] `total` and `has_more` reflect filtered (non-deleted) count
- [ ] `include_deleted=true` returns all memories including soft-deleted
- [ ] Pagination is correct after filtering (offset/limit applied to filtered set)
- [ ] App client SDK passes `include_deleted` param
- [ ] OpenAPI spec updated with new parameter
- [ ] Types regenerated
- [ ] Unit tests pass
- [ ] E2e test covers delete → exclude → include_deleted → restore cycle
- [ ] `npm run typecheck` passes

---

## Key Design Decisions

### Filtering Approach

| Decision | Choice | Rationale |
|---|---|---|
| Where to filter | Handler level, after by-ID fetch | by-ID fetches can't use Weaviate filters; must filter in application code after retrieval |
| Default behavior | Exclude deleted | Matches existing search/query behavior where `deleted_filter` defaults to `'exclude'` |
| Opt-in parameter | `include_deleted=true` | Consistent naming with potential future use in other endpoints; allows admin/restore UIs to see deleted content |
| Pagination adjustment | Filter before pagination slice | Total, has_more, and offset must reflect the filtered set, not the raw set |

---

## Notes

- Soft-deleted memories remain in `related_memory_ids` and `member_order_json` — this is intentional for restore support
- The `buildDeletedFilter()` utility in `src/utils/filters.ts` handles search/query filtering but doesn't apply to by-ID fetches — this task adds the equivalent for ordered content
- agentbase.me's reorder page will consume this fix to correctly hide deleted memories while keeping them linked for restore
