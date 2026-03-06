# Source-ID Deduplication

**Concept**: Deduplicate memories across aggregate feeds using origin links (`original_memory_id`)
**Created**: 2026-03-06
**Status**: Implemented (task-124 simplified from content-hash to source-ID approach)

---

## Overview

Aggregate feeds display memories from multiple sources (personal, group, space). When the same memory exists across multiple contexts, users see duplicates. This design uses `original_memory_id`-based deduplication at the remember-core service layer.

**History**: The original design used SHA-256 content hashing (`content_hash`) for exact-match deduplication. Task-124 simplified this to use `original_memory_id` instead, since all duplicates enter the system through explicit publish/share operations which already set this field. Content hashing was unnecessary complexity for a case that doesn't meaningfully occur (two users independently creating identical memories).

---

## Problem Statement

- A user creates a personal memory, shares it to a group, and publishes it to a space. All three copies appear in aggregate feeds.
- Without deduplication, users see the same content repeated multiple times in search results, home feeds, and similar-memory suggestions.

---

## Solution

**Origin link** (`original_memory_id`) — Set at publish/share time. The group/space copy records the UUID of the original personal memory. Deduplication groups by this ID and applies precedence rules.

Deduplication runs in the **service layer** after merging results from multiple Weaviate collections, using precedence rules to pick the winning copy.

### Precedence

| Priority | Source | Notes |
|----------|--------|-------|
| 1 (highest) | Space | The void wins over profiles |
| 2 | Group | Prefer group user is viewing; fallback: alphanumeric sort of group ID |
| 3 (lowest) | Personal | User's private collection |

- **Winning copy** is displayed as-is — no metadata merging across copies.
- Memories without `original_memory_id` (originals) pass through without deduplication.

---

## Implementation

### Origin Link Property

`original_memory_id` on published memory collections (already existed in schema).

- Set at publish/share time — the group/space copy records the UUID of the original memory
- Nullable — original memories have no source
- Used as the dedupe key in aggregate feeds

### Service-Layer Deduplication

`dedupeBySourceId()` in `src/utils/dedupe.ts`:

```typescript
// Groups by original_memory_id, applies precedence rules
// Memories without original_memory_id pass through
dedupeBySourceId(taggedObjects, { enabled: true, viewingGroupId })
```

Wired into `SpaceService.search()` after UUID deduplication and before pagination.

### Pagination

No over-fetching — pages may be slightly short after deduplication. This is acceptable and avoids complexity.

### API Contract

- Response includes `also_in` metadata on deduped memories (contexts where duplicates exist)
- API accepts a `dedupe` parameter to disable deduplication for specific use cases (e.g., admin views)

---

## Benefits

- **Clean feeds**: Users see each memory once, from its highest-precedence context
- **Simple**: No write-path overhead — deduplication is read-only using existing data
- **Origin tracking**: `original_memory_id` preserves the lineage for diverged copies
- **API-level**: Clients get deduped results without any client-side logic
- **Extensible**: `also_in` metadata enables future "Also in: Group X" UI indicators

---

## Trade-offs

- **Short pages**: Pagination may return fewer results than requested after deduplication. Acceptable trade-off vs over-fetching complexity.
- **No near-duplicate detection**: Only memories sharing the same `original_memory_id` are deduped. Independently created identical memories are not detected.

---

## Dependencies

- Publish/share flows must set `original_memory_id` on the target copy (already implemented in `SpaceService.executePublish()`)
- Aggregate feed queries (any service method that merges results from multiple collections)

---

## Testing Strategy

- **Unit tests**: `dedupeBySourceId` — precedence logic, same-tier sub-precedence, `also_in` metadata, disable flag, originals pass through
- **Edge cases**: Memory without `original_memory_id`, mixed original/copy results

---

## Future Considerations

- "Also in: Group X, Personal" UI indicator (TBD on exact UX)
- Near-duplicate detection using embedding similarity (separate feature)
- `original_memory_id` could enable "update all copies" workflows

---

**Status**: Implemented
**Related Documents**: [clarification-13-content-hash-dedupe.md](../clarifications/clarification-13-content-hash-dedupe.md)
