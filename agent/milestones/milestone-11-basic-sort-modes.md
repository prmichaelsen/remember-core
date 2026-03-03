# Milestone 11: Basic Sort Modes (MVP)

**Status**: Not Started
**Started**: TBD
**Target Completion**: 1 week
**Progress**: 0%

---

## Objective

Implement basic server-side sort modes (Smart, Time, Density) for remember-core using existing Weaviate capabilities. This is the MVP phase that enables different browsing patterns without requiring full infrastructure (analytics, REM curation, reputation, etc.).

**Design Reference**: agent/design/memory-sorting-algorithms.md (Phase 1 MVP section)

---

## Scope

### In Scope
- ✅ Smart mode: Use existing hybrid search (already works)
- ✅ Time mode: Native Weaviate sort by created_at (ascending/descending)
- ✅ Density mode: Sort by relationship count using new relationship_count property
- ✅ Server-side implementation only (no client-side sorting)
- ✅ Add relationship_count property to Memory schema
- ✅ Backfill relationship_count for existing memories
- ✅ Maintain relationship_count in RelationshipService

### Out of Scope (Phase 2)
- ⏭️ User ratings and reputation system
- ⏭️ Analytics pipeline (click tracking, engagement metrics)
- ⏭️ REM curation (quality evaluation, PageRank, curated feeds)
- ⏭️ Temporal decay
- ⏭️ RAG-optimized quality endpoint
- ⏭️ Density diversity (cluster representatives)

---

## Success Criteria

- [ ] MemoryService has byTime() method with native Weaviate sort
- [ ] MemoryService has byDensity() method using relationship_count
- [ ] Memory schema includes relationship_count property
- [ ] RelationshipService maintains relationship_count on create/delete
- [ ] Backfill script populates relationship_count for existing memories
- [ ] All sorting is server-side (no client-side filtering)
- [ ] Unit tests cover new methods
- [ ] Integration tests verify sorting behavior

---

## Tasks

1. **Task 1**: Add byTime sort mode to MemoryService (30 min)
2. **Task 2**: Add relationship_count property to Memory schema (15 min)
3. **Task 3**: Create backfill script for relationship_count (1 hour)
4. **Task 4**: Update RelationshipService to maintain relationship_count (1 hour)
5. **Task 5**: Add byDensity sort mode to MemoryService (30 min)

**Total Estimated Time**: ~3.5 hours

---

## Dependencies

**Upstream**:
- M10 (REM Background Relationships) - Completed ✅
  - Relationship system must exist for density sorting

**Downstream**:
- remember-rest-service: Add REST endpoints for sort modes
- agentbase.me-e1: Frontend UI for sort mode selection (optional)

---

## Technical Approach

### Smart Mode
Already implemented via `MemoryService.search()` with hybrid search (BM25 + vector). No changes needed.

### Time Mode
Use Weaviate's native `sort` parameter:
```typescript
collection.query.fetchObjects({
  sort: [{ property: 'created_at', order: 'desc' }],
  limit: 50,
  offset: 0,
});
```

### Density Mode
Add denormalized `relationship_count` property:
- Denormalizes `relationships.length` into scalar field for sorting
- Updated by RelationshipService on create/delete
- Backfilled for existing memories

```typescript
collection.query.fetchObjects({
  sort: [{ property: 'relationship_count', order: 'desc' }],
  limit: 50,
  offset: 0,
});
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Weaviate doesn't support sort by created_at | High | Verify Weaviate capability before starting |
| relationship_count gets out of sync | Medium | Add verification in tests, document maintenance |
| Backfill takes too long for large collections | Low | Implement batch processing with progress logging |
| Performance issues with large result sets | Low | Start with reasonable limits (50-100), optimize later |

---

## Notes

- This is Phase 1 MVP from the full design document
- Focus is on proving the concept with minimal infrastructure
- Phase 2 will add analytics, reputation, REM curation, etc.
- Smart mode already works - no implementation needed
- Time and Density modes use native Weaviate features only

---

**Milestone ID**: M11
**Created**: 2026-03-03
**Owner**: remember-core team
