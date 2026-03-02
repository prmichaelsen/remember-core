# Task 54: Unit tests for REM modules

**Milestone**: [M10 - REM Background Relationships](../../milestones/milestone-10-rem-background-relationships.md)
**Estimated Time**: 4 hours
**Dependencies**: [Task 53](task-53-rem-service-run-cycle.md)
**Status**: Not Started

---

## Objective

Comprehensive unit tests for all REM modules: clustering, dedup, merge/split, Haiku validation, state persistence, collection enumeration, and the RemService orchestration.

---

## Context

Tests are colocated with source files using `.spec.ts` suffix (project convention). Mock the Weaviate client, Firestore, and Haiku API. Focus on algorithmic correctness — the clustering and dedup logic is the most critical to test thoroughly.

---

## Steps

### 1. Create src/rem/rem.clustering.spec.ts

- **selectCandidates**: returns deduplicated candidates from 3 thirds
- **selectCandidates**: respects memory_cursor for unprocessed third
- **formClusters**: produces clusters with >= 3 members
- **formClusters**: skips candidates with < 2 similar memories
- **formClusters**: deduplicates overlapping clusters (>80% same members)
- **resolveClusterActions**: returns 'create' when no existing overlap
- **resolveClusterActions**: returns 'merge' when overlap > 60%
- **resolveClusterActions**: returns 'create' when overlap <= 60%
- **computeOverlap**: calculates correct ratio
- **computeOverlap**: handles empty sets
- **shouldSplit**: true when > 50 members
- **shouldSplit**: false when <= 50 members
- **splitCluster**: produces sub-clusters within limit

Target: ~15 tests

### 2. Create src/rem/rem.state.spec.ts

- **RemStateStore.getCursor**: returns null when no cursor exists
- **RemStateStore.saveCursor**: persists and reads back
- **RemStateStore.getCollectionState**: returns null for unknown collection
- **RemStateStore.saveCollectionState**: persists and reads back

Target: ~5 tests (mock Firestore)

### 3. Create src/rem/rem.haiku.spec.ts (optional, if needed)

- **validateCluster**: returns valid result for coherent cluster
- **validateCluster**: returns invalid for weak cluster
- **validateCluster**: handles API error gracefully

Target: ~3 tests (use createMockHaikuClient)

### 4. Create src/rem/rem.service.spec.ts

- **runCycle**: processes one collection and advances cursor
- **runCycle**: skips collections below min size
- **runCycle**: wraps around to first collection after last
- **runCycle**: returns early when no collections exist
- **runCycle**: creates relationships with source='rem'
- **runCycle**: merges into existing when overlap detected
- **runCycle**: Haiku rejection skips cluster (no relationship created)
- **runCycle**: persists cursor after completion

Target: ~8 tests (mock all dependencies)

### 5. Create src/rem/rem.collections.spec.ts

- **listMemoryCollections**: filters to Memory_* collections
- **listMemoryCollections**: returns sorted list
- **listMemoryCollections**: excludes non-memory collections

Target: ~3 tests

---

## Verification

- [ ] rem.clustering.spec.ts: ~15 tests passing
- [ ] rem.state.spec.ts: ~5 tests passing
- [ ] rem.service.spec.ts: ~8 tests passing
- [ ] rem.collections.spec.ts: ~3 tests passing
- [ ] All existing tests still pass
- [ ] Total new tests: ~30+
- [ ] No test uses real Weaviate or Firestore (all mocked)
- [ ] `npm test` passes

---

**Next Task**: [Task 55: Documentation — CHANGELOG, README](task-55-documentation.md)
**Related Design Docs**: [REM Design](../../design/local.rem-background-relationships.md) (Testing Strategy)
