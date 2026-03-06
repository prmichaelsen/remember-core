# Task 135: Unit Tests and Edge Cases

**Milestone**: M25 — byDiscovery Sort Mode
**Estimated Time**: 1-2 hours
**Dependencies**: Tasks 132, 133, 134
**Status**: Not Started

---

## Objective

Comprehensive unit test coverage for the byDiscovery interleaving algorithm and its integration into SpaceService and MemoryService.

---

## Steps

### 1. Core interleaving tests (`src/services/discovery.spec.ts`)

- **Basic interleaving**: 8 rated + 2 discovery → positions 5, 10 are discovery
- **Correct ratio**: Verify every 5th item is from discovery pool
- **`is_discovery` flag**: True for discovery items, false for rated items
- **Pool exhaustion — no discovery**: All items from rated pool, no discovery flags
- **Pool exhaustion — no rated**: All items from discovery pool, all flagged
- **Both pools empty**: Returns empty array
- **Fewer discovery than slots**: Remaining slots filled with rated
- **Fewer rated than slots**: Remaining slots filled with discovery
- **Offset/limit**: Page 1 and page 2 non-overlapping, correct items at each position
- **Single item pools**: 1 rated + 0 discovery, 0 rated + 1 discovery

### 2. SpaceService integration tests

- **byDiscovery in search**: Mock Weaviate returns rated + unrated, verify interleaved result
- **byDiscovery in query**: Same with vector search
- **Sort mode enum**: Verify `byDiscovery` accepted, invalid sort modes rejected

### 3. MemoryService integration tests

- **byDiscovery in personal search**: Mock returns, verify interleaving

### 4. Pagination edge cases

- **Cross-page consistency**: Same data → same interleaving across pages
- **Large offset**: Offset beyond total items → empty result
- **Limit larger than available**: Returns all available items

---

## Verification

- [ ] All interleaving unit tests pass
- [ ] Edge case coverage complete (empty pools, exhaustion, pagination)
- [ ] SpaceService integration tests pass
- [ ] MemoryService integration tests pass
- [ ] Existing sort mode tests still pass
- [ ] No regressions
