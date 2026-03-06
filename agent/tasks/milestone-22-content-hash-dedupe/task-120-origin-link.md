# Task 120: Origin Link on Publish/Share

**Milestone**: [M22 - Content Hash Deduplication](../../milestones/milestone-22-content-hash-dedupe.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 118: Schema Migration](task-118-schema-migration.md)
**Status**: Not Started

---

## Objective

Set `source_memory_id` on group/space copies when a memory is published or shared, establishing lineage tracking for diverged copies.

---

## Context

When a user publishes a personal memory to a space or shares it to a group, a copy is created in the target collection. The `source_memory_id` field on the copy should point back to the original memory's UUID. This enables detecting "same memory, different content" scenarios even when content hashes diverge after independent edits.

Published memories stay in sync across spaces, but private and group copies can diverge independently.

---

## Steps

### 1. Identify Publish/Share Code Paths

Find the service methods that copy memories to spaces and groups:
- SpaceService publish flow
- Group share flow (if separate)
- Any other copy-on-publish patterns

### 2. Set source_memory_id on Copy

When creating the copy in the target collection, set `source_memory_id` to the UUID of the source memory.

### 3. Handle Chain Copies

If a copy is re-published (copy of a copy), decide:
- Option A: Point to the immediate source (chain)
- Option B: Point to the original root (flatten)

Recommendation: Point to immediate source — simpler, and chain can be traversed if needed.

### 4. Write Tests

- Publish personal memory to space → copy has `source_memory_id` = original UUID
- Share to group → copy has `source_memory_id` = original UUID
- Original memory has `source_memory_id` = null/undefined

---

## Verification

- [ ] Publish to space sets `source_memory_id` on the space copy
- [ ] Share to group sets `source_memory_id` on the group copy
- [ ] Original memories have no `source_memory_id`
- [ ] All new tests pass
- [ ] Existing publish/share tests still pass

---

**Next Task**: [Task 121: Service-Layer Deduplication](task-121-service-deduplication.md)
**Related Design Docs**: [Content Hash Deduplication](../../design/local.content-hash-dedupe.md)
