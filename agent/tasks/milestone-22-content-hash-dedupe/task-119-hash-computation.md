# Task 119: Hash Computation on Write

**Milestone**: [M22 - Content Hash Deduplication](../../milestones/milestone-22-content-hash-dedupe.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 118: Schema Migration](task-118-schema-migration.md)
**Status**: Not Started

---

## Objective

Compute SHA-256 content hash on every memory create and update, storing it as the `content_hash` property.

---

## Context

With the schema in place (task-118), MemoryService needs to compute and store the hash whenever a memory is created or updated. The hash is deterministic: SHA-256 of normalized `content` + sorted `references`. This enables exact-match deduplication and sync-drift detection.

---

## Steps

### 1. Create Hash Utility

Create a `computeContentHash` function (likely in `src/utils/` or colocated with MemoryService):

```typescript
import { createHash } from 'crypto';

export function computeContentHash(content: string, references?: string[]): string {
  const normalized = content.trim();
  const sortedRefs = (references ?? []).slice().sort().join('\n');
  const input = sortedRefs ? `${normalized}\n${sortedRefs}` : normalized;
  return createHash('sha256').update(input).digest('hex');
}
```

### 2. Wire into MemoryService.create()

Before persisting, compute `content_hash` from the input content and references. Set it on the memory object.

### 3. Wire into MemoryService.update()

On update, recompute `content_hash` if `content` or `references` changed. Always store the current hash.

### 4. Write Unit Tests

- `computeContentHash` returns consistent output for same input
- Different content produces different hashes
- Reference order doesn't matter (sorted)
- Empty references handled correctly
- Whitespace normalization works (trim)

---

## Verification

- [ ] `computeContentHash` utility created with unit tests
- [ ] MemoryService.create() stores content_hash
- [ ] MemoryService.update() recomputes content_hash on content/reference changes
- [ ] All new tests pass
- [ ] Existing tests still pass

---

**Next Task**: [Task 120: Origin Link on Publish](task-120-origin-link.md)
**Related Design Docs**: [Content Hash Deduplication](../../design/local.content-hash-dedupe.md)
