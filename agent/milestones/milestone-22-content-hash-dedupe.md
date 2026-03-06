# Milestone 22: Content Hash Deduplication

**Goal**: Deduplicate memories across aggregate feeds using content hashes and origin links
**Duration**: 1-2 weeks
**Dependencies**: M18 (Memory Index Lookup), M21 (Content Moderation)
**Status**: Not Started

---

## Overview

Aggregate feeds display memories from multiple sources (personal, group, space). When the same memory exists across multiple contexts, users see duplicates. This milestone introduces SHA-256 content hashing on all memories, origin links for tracking copy lineage, and service-layer deduplication with precedence rules (space > group > personal).

See: [Design Document](../design/local.content-hash-dedupe.md)
See: [Clarification 13](../clarifications/clarification-13-content-hash-dedupe.md)

---

## Deliverables

### 1. Schema Changes
- `content_hash` property on all Weaviate memory collections
- `source_memory_id` property on all Weaviate memory collections
- Updated Memory type definitions

### 2. Hash Computation
- SHA-256 hash of normalized `content` + sorted `references`
- Computed on every create and update in MemoryService

### 3. Origin Links
- `source_memory_id` set at publish/share time
- Links group/space copies to original memory

### 4. Service-Layer Deduplication
- Dedupe logic after cross-collection result merging
- Precedence: space > group > personal
- Same-tier sub-precedence (viewing group, alphanumeric fallback)

### 5. API Contract
- `also_in` metadata on deduped responses
- `dedupe` parameter to disable deduplication

---

## Success Criteria

- [ ] `content_hash` stored on all new/updated memories
- [ ] `source_memory_id` set on publish/share
- [ ] Aggregate searches return deduped results by default
- [ ] Precedence rules work correctly (space > group > personal)
- [ ] `also_in` metadata present on deduped results
- [ ] `dedupe=false` parameter disables deduplication
- [ ] Backfill script populates `content_hash` for existing memories
- [ ] All new tests pass, no regressions

---

## Tasks

1. [Task 118: Schema Migration](../tasks/milestone-22-content-hash-dedupe/task-118-schema-migration.md) - Add content_hash and source_memory_id to Weaviate schema and types
2. [Task 119: Hash Computation on Write](../tasks/milestone-22-content-hash-dedupe/task-119-hash-computation.md) - Compute and store SHA-256 hash on create/update
3. [Task 120: Origin Link on Publish](../tasks/milestone-22-content-hash-dedupe/task-120-origin-link.md) - Set source_memory_id at publish/share time
4. [Task 121: Service-Layer Deduplication](../tasks/milestone-22-content-hash-dedupe/task-121-service-deduplication.md) - Dedupe logic with precedence rules
5. [Task 122: API Contract](../tasks/milestone-22-content-hash-dedupe/task-122-api-contract.md) - also_in metadata and dedupe parameter

---

## Testing Requirements

- [ ] Unit tests for computeContentHash (determinism, normalization, reference sorting)
- [ ] Unit tests for dedupeMemories (precedence, same-tier, also_in, disable flag)
- [ ] Integration tests for end-to-end dedupe across collections
- [ ] Backfill script tested against real data

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Weaviate schema migration breaks existing queries | High | Low | Test migration on staging first, property additions are non-breaking |
| Backfill performance on large datasets | Medium | Medium | Batch processing with progress tracking |
| Short pages after deduplication confuse clients | Low | Medium | Document behavior, accepted trade-off per design |

---

**Next Milestone**: TBD
**Blockers**: None
**Notes**: Design specifies no over-fetching for pagination — pages may be short after dedupe
