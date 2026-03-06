# Content Hash Deduplication

**Concept**: Deduplicate memories across aggregate feeds using content hashes and origin links
**Created**: 2026-03-06
**Status**: Design Specification

---

## Overview

Aggregate feeds display memories from multiple sources (personal, group, space). When the same memory exists across multiple contexts, users see duplicates. This design introduces content-hash-based deduplication at the remember-core API level, plus an origin link for tracking diverged copies.

---

## Problem Statement

- A user creates a personal memory, shares it to a group, and publishes it to a space. All three copies appear in aggregate feeds.
- Published memories stay in sync across spaces, but private and group copies can diverge when edited independently.
- Without deduplication, users see the same content repeated multiple times in search results, home feeds, and similar-memory suggestions.

---

## Solution

Two complementary mechanisms:

1. **Content hash** (`content_hash`) — SHA-256 of normalized `content` + sorted `references`. Computed on write, stored as a Weaviate property. Used for exact-match deduplication in aggregate feeds.

2. **Origin link** (`source_memory_id`) — Points to the original memory from which a copy was created (at publish/share time). Used for detecting diverged copies ("same memory, different content").

Deduplication runs in the **service layer** after merging results from multiple Weaviate collections, using precedence rules to pick the winning copy.

### Precedence

| Priority | Source | Notes |
|----------|--------|-------|
| 1 (highest) | Space | The void wins over profiles |
| 2 | Group | Prefer group user is viewing; fallback: alphanumeric sort of group ID |
| 3 (lowest) | Personal | User's private collection |

- **Winning copy** is displayed as-is — no metadata merging across copies.
- **Near-duplicates are NOT deduped** — only exact content hash matches.

---

## Implementation

### Content Hash Property

Add `content_hash` as a new Weaviate property on all memory collections (`Memory_users_*`, `Memory_groups_*`, `Memory_spaces_public`).

```typescript
// Hash computation — on memory create and update
import { createHash } from 'crypto';

function computeContentHash(content: string, references?: string[]): string {
  const normalized = content.trim();
  const sortedRefs = (references ?? []).slice().sort().join('\n');
  const input = sortedRefs ? `${normalized}\n${sortedRefs}` : normalized;
  return createHash('sha256').update(input).digest('hex');
}
```

- Computed on every `create` and `update` call in `MemoryService`
- Stored as a string property in Weaviate (filterable)
- Enables sync-drift detection: compare `content_hash` of private vs published copy

### Origin Link Property

Add `source_memory_id` as a new Weaviate property on all memory collections.

- Set at publish/share time — the group/space copy records the UUID of the original memory
- Nullable — original memories have no source
- Enables "same memory, diverged content" detection even when hashes differ

### Service-Layer Deduplication

Deduplication runs after results are fetched and merged from multiple collections.

```typescript
interface DedupeOptions {
  enabled?: boolean;          // default: true
  viewingGroupId?: string;    // for same-tier sub-precedence
}

function dedupeMemories(
  memories: MemoryWithSource[],
  options: DedupeOptions
): DedupeResult[] {
  if (options.enabled === false) return memories.map(toResult);

  const seen = new Map<string, DedupeResult>();

  for (const memory of memories) {
    const key = memory.content_hash;
    if (!key) { /* no hash — keep as-is */ continue; }

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { memory, also_in: [] });
      continue;
    }

    // Compare precedence: space > group > personal
    const winner = pickByPrecedence(existing.memory, memory, options.viewingGroupId);
    const loser = winner === existing.memory ? memory : existing.memory;

    seen.set(key, {
      memory: winner,
      also_in: [...existing.also_in, { source: loser.source, id: loser.id }],
    });
  }

  return [...seen.values()];
}
```

### Pagination

No over-fetching — pages may be slightly short after deduplication. This is acceptable and avoids complexity.

### API Contract

- Response includes `also_in` metadata on deduped memories (contexts where duplicates exist)
- API accepts a parameter to **disable deduplication** for specific use cases (e.g., admin views)

---

## Benefits

- **Clean feeds**: Users see each memory once, from its highest-precedence context
- **Sync-drift detection**: `content_hash` comparison enables "your private copy is out of date" features
- **Origin tracking**: `source_memory_id` preserves the lineage even when content diverges
- **API-level**: Clients get deduped results without any client-side logic
- **Extensible**: `also_in` metadata enables future "Also in: Group X" UI indicators

---

## Trade-offs

- **Write overhead**: SHA-256 computed on every create/update (negligible — sub-millisecond)
- **Schema migration**: Two new Weaviate properties (`content_hash`, `source_memory_id`) must be added to all collections. Existing memories need backfill.
- **Short pages**: Pagination may return fewer results than requested after deduplication. Acceptable trade-off vs over-fetching complexity.
- **No near-duplicate detection**: Only exact hash matches are deduped. Memories with minor formatting differences appear as separate entries.

---

## Dependencies

- Weaviate schema migration (add `content_hash` and `source_memory_id` properties)
- `MemoryService.create()` and `MemoryService.update()` must compute and store hash
- Publish/share flows must set `source_memory_id` on the target copy
- Aggregate feed queries (any service method that merges results from multiple collections)

---

## Testing Strategy

- **Unit tests**: `computeContentHash` — verify deterministic output, reference sorting, normalization
- **Unit tests**: `dedupeMemories` — precedence logic, same-tier sub-precedence, `also_in` metadata, disable flag
- **Integration tests**: Create memory, share to group, publish to space — verify aggregate search returns one result with correct `also_in`
- **Edge cases**: Memory with no references, memory with empty content, diverged copies (different hashes, same `source_memory_id`)

---

## Migration Path

1. Add `content_hash` and `source_memory_id` properties to Weaviate collection schemas
2. Backfill `content_hash` for all existing memories (batch job)
3. Update `MemoryService.create()` and `update()` to compute hash on write
4. Update publish/share flows to set `source_memory_id`
5. Add deduplication to aggregate feed service methods
6. Add `also_in` to API response and `dedupe` parameter to API contract

---

## Future Considerations

- "Also in: Group X, Personal" UI indicator (TBD on exact UX)
- Sync-drift notifications ("your private copy is out of date with the published version")
- Near-duplicate detection using embedding similarity (separate from content hash)
- `source_memory_id` could enable "update all copies" workflows

---

**Status**: Design Specification
**Recommendation**: Create implementation tasks for schema migration, hash computation, origin link, and service-layer deduplication
**Related Documents**: [clarification-13-content-hash-dedupe.md](../clarifications/clarification-13-content-hash-dedupe.md)
