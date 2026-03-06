# Task 121: Service-Layer Deduplication

**Milestone**: [M22 - Content Hash Deduplication](../../milestones/milestone-22-content-hash-dedupe.md)
**Estimated Time**: 4-6 hours
**Dependencies**: [Task 119: Hash Computation](task-119-hash-computation.md)
**Status**: Not Started

---

## Objective

Implement deduplication logic in the service layer that removes duplicate memories (by content hash) after merging results from multiple Weaviate collections, applying precedence rules.

---

## Context

Aggregate feeds query multiple collections (user, group, space) and merge results. After merging, memories with the same `content_hash` should be deduped using precedence: space > group > personal. The winning copy is displayed as-is. Same-tier sub-precedence: prefer the group the user is currently viewing, otherwise alphanumeric sort of group ID. For spaces, the void wins.

---

## Steps

### 1. Create Dedupe Utility

Create a `dedupeMemories` function:

```typescript
interface DedupeOptions {
  enabled?: boolean;          // default: true
  viewingGroupId?: string;    // for same-tier sub-precedence
}

interface DedupeResult {
  memory: MemoryWithSource;
  also_in: Array<{ source: string; id: string }>;
}

function dedupeMemories(
  memories: MemoryWithSource[],
  options: DedupeOptions
): DedupeResult[];
```

### 2. Implement Precedence Logic

- Assign tier to each memory based on its source collection:
  - `Memory_spaces_*` → tier 1 (highest)
  - `Memory_groups_*` → tier 2
  - `Memory_users_*` → tier 3 (lowest)
- For same-tier conflicts:
  - Groups: prefer `viewingGroupId` if provided, else alphanumeric sort of group ID
  - Spaces: the void wins

### 3. Wire into Aggregate Query Methods

Identify service methods that merge results from multiple collections and add deduplication as a post-processing step. Pass through `DedupeOptions` from the caller.

### 4. Handle Memories Without Hashes

Memories without `content_hash` (e.g., pre-backfill) should pass through without deduplication.

### 5. Write Unit Tests

- Two memories with same hash, different tiers → higher tier wins
- Same hash, same tier (two groups) → viewing group wins
- Same hash, same tier, no viewing group → alphanumeric fallback
- `enabled: false` → no deduplication
- `also_in` correctly populated with losers
- Memories without hash → not deduped
- Single memory → passed through unchanged

---

## Verification

- [ ] `dedupeMemories` utility created with comprehensive unit tests
- [ ] Precedence logic correct (space > group > personal)
- [ ] Same-tier sub-precedence works (viewing group, alphanumeric)
- [ ] Wired into aggregate query methods
- [ ] `also_in` metadata populated correctly
- [ ] Disable flag works
- [ ] No regressions on existing query tests

---

**Next Task**: [Task 122: API Contract](task-122-api-contract.md)
**Related Design Docs**: [Content Hash Deduplication](../../design/local.content-hash-dedupe.md)
