# Milestone 13: Performance

**Goal**: Reduce latency on user-facing hot paths — search pipeline and Weaviate collection overhead
**Duration**: 0.5-1 week
**Dependencies**: None
**Status**: Not Started

---

## Overview

Two high-impact bottleneck areas for user-facing operations:

1. **Search pipeline** — time-slice (14) and density-slice (9) always fire all bucket queries, even when early buckets satisfy the limit. Progressive fetching could cut queries by 50%+.
2. **Collection initialization** — every operation calls `ensureUserCollection()` / `ensurePublicCollection()` which hits Weaviate schema API. Process-level cache with TTL eliminates redundant checks.

All optimizations are transparent — no API changes, no behavioral differences, no schema migrations.

---

## Deliverables

### 1. Search Pipeline Progressive Fetching
- Short-circuit bucket queries when limit is satisfied
- Progressive strategy: query top buckets first, expand if needed
- Apply to both time-slice and density-slice

### 2. Collection Initialization Cache
- Process-level TTL cache for ensureUserCollection / ensurePublicCollection
- Skip reconcileCollectionProperties on cache hit
- Deduplicate redundant ensure calls in SpaceService

---

## Success Criteria

- [ ] Search pipeline short-circuits when limit met from early buckets
- [ ] Collection ensure results cached (TTL-based, process-level)
- [ ] All existing tests pass (509+)
- [ ] `npm run build` compiles cleanly

---

## Key Files to Modify

```
src/
├── services/
│   └── space.service.ts            # Deduplicate ensure calls
├── search/
│   ├── search-by-time-slice.ts     # Progressive bucket fetching
│   └── search-by-density-slice.ts  # Progressive bucket fetching
└── database/
    └── weaviate/v2-collections.ts  # Collection cache with TTL
```

---

## Tasks

1. [Task 66: Progressive bucket fetching for search pipelines](../tasks/milestone-13-performance/task-66-progressive-bucket-fetching.md) — Short-circuit time-slice and density-slice when limit met
2. [Task 67: Collection initialization cache](../tasks/milestone-13-performance/task-67-collection-init-cache.md) — TTL cache for ensureUserCollection/ensurePublicCollection, skip reconcile on hit

---

## Testing Requirements

- [ ] All existing tests pass unchanged (transparent optimizations)
- [ ] Search tests: verify early termination returns correct results
- [ ] Collection cache tests: TTL expiry, cache hit/miss, concurrent access

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Cache staleness after schema migration | Medium | Low | Short TTL (60s), manual invalidation option |
| Progressive fetch missing results in sparse buckets | Medium | Low | Conservative threshold — only skip after 2x limit collected |

---

**Next Milestone**: TBD
**Blockers**: None
**Notes**: Both tasks are independent and can be implemented in any order.
