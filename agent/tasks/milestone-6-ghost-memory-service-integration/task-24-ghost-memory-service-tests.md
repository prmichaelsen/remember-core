# Task 24: Unit Tests for Ghost-Integrated MemoryService

**Milestone**: [M6 - Ghost/Trust Integration](../../milestones/milestone-6-ghost-memory-service-integration.md)
**Estimated Time**: 3 hours
**Dependencies**: Task 23
**Status**: Not Started

---

## Objective

Add unit tests verifying that MemoryService correctly applies ghost/trust filtering when ghost_context is provided, and that default behavior is unchanged when it's absent.

---

## Steps

### 1. Add ghost search tests to memory.service.spec.ts

New describe block: `'ghost-integrated search'`

Tests:
- `search with ghost_context applies trust filter` — verify buildTrustFilter called with accessor_trust_level
- `search with ghost_context excludes ghost content by default` — verify content_type != 'ghost' filter applied
- `search with ghost_context.include_ghost_content=true skips ghost exclusion` — explicit ghost search
- `search without ghost_context does not apply trust filter` — backwards compat
- `search without ghost_context does not exclude ghost content` — backwards compat (personal collection may not have ghosts, but filter shouldn't be there)

### 2. Add ghost query tests

New describe block: `'ghost-integrated query'`

Tests (mirror search tests):
- `query with ghost_context applies trust filter`
- `query with ghost_context excludes ghost content`
- `query without ghost_context unchanged`

### 3. Add ghost findSimilar tests

New describe block: `'ghost-integrated findSimilar'`

Tests:
- `findSimilar with ghost_context excludes ghost content` — no post-filter needed
- `findSimilar without ghost_context unchanged`

### 4. Trust level edge cases

- `trust level 0 restricts to existence-only (trust >= 0)` — should match all
- `trust level 1.0 allows full access` — should match all
- `trust level 0.5 filters memories with trust > 0.5`

---

## Verification

- [ ] All new ghost-integrated tests pass
- [ ] All existing MemoryService tests still pass
- [ ] Coverage for search/query/findSimilar ghost paths
- [ ] Edge cases covered (trust 0, trust 1.0, no ghost_context)
