# Milestone 10: REM Background Relationships

**Goal**: Build the Relationship Engine for Memories (REM) — a background service that automatically discovers and creates relationships between memories using embedding similarity and Haiku validation
**Duration**: 2 weeks
**Dependencies**: M3 (Core Services), M5 (Trust & Ghost System)
**Status**: Not Started

---

## Overview

REM is a background process that runs hourly, round-robining through memory collections, discovering semantically related memories and grouping them into N-ary relationships. It emulates how human REM sleep consolidates memories — running quietly in the background, strengthening connections between related concepts.

Users rarely create relationships manually. REM fills this gap by automatically building a web of connections that makes memory collections more navigable and discoverable. The `RemService` follows the same pattern as all other remember-core services — pure business logic with injected dependencies, consumed by a thin Cloud Run wrapper.

**Design doc**: `agent/design/local.rem-background-relationships.md`
**Clarifications**: 6-7 (all completed)

---

## Deliverables

### 1. Schema Changes
- `source` field on Relationship type (`'user' | 'rem' | 'rule'`)
- `source` property in Weaviate schema (all collection types)
- Updated `ALL_MEMORY_PROPERTIES` constant

### 2. Service Extensions
- `RelationshipService.findByMemoryIds()` — find relationships that overlap with a set of memory IDs (dedup support)
- Collection enumeration utility — list all Weaviate memory collections

### 3. Firestore State
- `rem_state/cursor` path and types (RemCursorState)
- `rem_state/collections/{id}` path and types (RemCollectionState)
- Firestore CRUD helpers for REM state

### 4. RemService
- `RemService` class with `runCycle()` entry point
- Collection cursor sweep (round-robin with startAfter)
- Memory selection (1/3 newest, 1/3 unprocessed, 1/3 random)
- Clustering algorithm (greedy agglomerative, cosine >= 0.75)
- Deduplication (60% memory_ids overlap = merge)
- Haiku validation and observation generation
- Merge/split logic (50-member cap)
- Firestore state persistence

### 5. Tests
- Unit tests for clustering, dedup, merge/split, cursor logic
- Haiku mock tests (gating validation)
- RemService integration test with mock Weaviate

### 6. Documentation
- CHANGELOG entry
- README update

---

## Success Criteria

- [ ] `source` field exists on Relationship type and Weaviate schema
- [ ] `RelationshipService.findByMemoryIds()` returns overlapping relationships
- [ ] Collection listing works across user/group/space collections
- [ ] `RemService.runCycle()` processes one collection per invocation
- [ ] Clustering produces valid relationship candidates (cosine >= 0.75)
- [ ] Dedup correctly merges when overlap > 60%
- [ ] Relationships split when exceeding 50 members
- [ ] Haiku validation gates weak clusters
- [ ] Firestore cursor persists across runs
- [ ] All tests pass (`npm test`)
- [ ] Build compiles (`npm run build`)

---

## Key Files to Create

```
src/
├── rem/
│   ├── rem.service.ts          # RemService class with runCycle()
│   ├── rem.types.ts            # RemCursorState, RemCollectionState, ClusterCandidate, HaikuValidation
│   ├── rem.clustering.ts       # Clustering algorithm, dedup, merge/split logic
│   ├── rem.haiku.ts            # Haiku validation client
│   ├── rem.state.ts            # Firestore state CRUD (cursor, collection state)
│   ├── rem.collections.ts      # Collection enumeration utility
│   ├── index.ts                # Barrel exports
│   ├── rem.service.spec.ts     # RemService unit tests
│   ├── rem.clustering.spec.ts  # Clustering/dedup/split tests
│   └── rem.state.spec.ts       # Firestore state tests
```

---

## Tasks

1. [Task 48: Schema — Add source field to Relationship type and Weaviate schema](../tasks/milestone-10-rem-background-relationships/task-48-schema-source-field.md)
2. [Task 49: RelationshipService extension — findByMemoryIds](../tasks/milestone-10-rem-background-relationships/task-49-relationship-service-find-by-memory-ids.md)
3. [Task 50: Collection enumeration and Firestore REM state](../tasks/milestone-10-rem-background-relationships/task-50-collection-enumeration-firestore-state.md)
4. [Task 51: REM types and clustering algorithm](../tasks/milestone-10-rem-background-relationships/task-51-rem-types-clustering.md)
5. [Task 52: Haiku validation client](../tasks/milestone-10-rem-background-relationships/task-52-haiku-validation.md)
6. [Task 53: RemService — runCycle orchestration](../tasks/milestone-10-rem-background-relationships/task-53-rem-service-run-cycle.md)
7. [Task 54: Unit tests for REM modules](../tasks/milestone-10-rem-background-relationships/task-54-rem-unit-tests.md)
8. [Task 55: Documentation — CHANGELOG, README](../tasks/milestone-10-rem-background-relationships/task-55-documentation.md)

---

## Testing Requirements

- [ ] Clustering algorithm tests (cluster formation, min similarity, min cluster size)
- [ ] Deduplication tests (overlap calculation, merge decision, no-merge decision)
- [ ] Merge/split tests (add members, split at 50, handle remainders)
- [ ] Haiku mock tests (valid cluster accepted, weak cluster rejected)
- [ ] Cursor tests (persist, resume, wrap-around)
- [ ] Memory selection tests (newest/unprocessed/random thirds)
- [ ] RemService integration test (full cycle with mocks)

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Haiku API costs higher than expected | Low | Low | Bounded by API key spending limit; ~$1-3/month estimated |
| Clustering produces too many false positives | Medium | Low | 0.75 threshold + Haiku gating; can raise threshold later |
| Large collections slow down processing | Medium | Medium | Limit candidate selection per run; cursor-based pagination |

---

**Next Milestone**: TBD
**Blockers**: None
**Notes**: No migration needed — collections are recreated (hard cutover). `source` field defaults to `'user'` for new relationships created without it.
