# Task 36: Fix Memory Search Indexing for Newly Created Memories

**Milestone**: M8 - Bug Fixes
**Estimated Time**: 4-8 hours
**Dependencies**: None
**Status**: Not Started
**Source**: [GitHub Issue #1](https://github.com/prmichaelsen/agentbase.me/issues/1)

---

## Objective

Fix the bug where newly created memories are successfully stored (receive success response with ID and correct timestamp) but are **not searchable** through `remember_search_memory` or `remember_query_memory` tools.

---

## Context

Users report that calling `remember_create_memory` returns a success response with a valid memory ID, but subsequent searches via `remember_search_memory` or `remember_query_memory` return no results — even after waiting for indexing delays. Older memories (e.g., those migrated from the PARM system in January 2025) ARE searchable, suggesting the issue is specific to the real-time creation path rather than the search infrastructure itself.

**Severity**: CRITICAL — makes the memory system non-functional for new data.

**Key observations from the issue**:
- Memory creation succeeds (returns ID + timestamp)
- No search method finds newly created memories (keyword, tag, semantic)
- Issue persists across chat sessions
- Pre-existing/migrated memories remain searchable
- Migration/bulk import may use a different indexing path than real-time creation

---

## Steps

### 1. Reproduce the Bug

Create a memory via `MemoryService.create()` and immediately attempt to find it via `MemoryService.search()`, `MemoryService.findSimilar()`, and `MemoryService.query()`.

Confirm:
- `create()` returns success with ID
- `search()` with matching keywords returns no results
- `query()` with semantic match returns no results
- `findSimilar()` with the created memory's ID returns no results

### 2. Investigate Weaviate Write-Read Path

Check whether the Weaviate client's insert operation completes before the object is available for search:

- Does `collection.data.insert()` return a promise that resolves before indexing completes?
- Does Weaviate v3 have an async indexing pipeline where objects aren't immediately queryable?
- Check if there's a `consistencyLevel` setting needed (e.g., `QUORUM` vs `ONE`)
- Check if `collection.data.insert()` vs `collection.data.insertMany()` have different indexing behavior (could explain why bulk migrations work)

### 3. Check Collection Configuration

Verify the Weaviate collection schema configuration in `src/database/weaviate/schema.ts` and `v2-collections.ts`:

- Are vectorization settings correct? (`vectorizer`, `moduleConfig`)
- Is the `invertedIndexConfig` properly configured for keyword search?
- Are new objects being assigned to the correct collection/tenant?
- Check if multi-tenancy or sharding configuration affects real-time indexing

### 4. Trace the Create → Search Pipeline

Walk through the code path in `src/services/memory.service.ts`:

- `create()`: What exact Weaviate API call is made? What properties are set?
- `search()`: What filters and query parameters are used? Could any filter exclude freshly created memories?
- Check `buildMemoryFilters()` in `src/utils/filters.ts` — does the default `DeletedFilter` or any other filter exclude memories without certain fields?
- Check if `deleted_at` or `moderation_status` filters could exclude new memories that haven't had those fields set

### 5. Check for Async Indexing Issues

- Does Weaviate's `nearText` or `hybrid` search require vectorization to complete before objects are queryable?
- Is there a Weaviate API to check object existence by ID (bypassing search index)?
- Test if `collection.query.fetchObjectById()` works immediately after insert (to distinguish storage vs. indexing issues)

### 6. Implement Fix

Based on findings, implement the appropriate fix:

**If indexing delay**: Add a brief wait or implement eventual consistency handling in the SDK
**If filter exclusion**: Fix filter logic to include memories with null/unset fields
**If collection config**: Update schema configuration
**If write consistency**: Set appropriate consistency level on insert operations

### 7. Add Regression Test

Create a test in `src/services/__tests__/memory.service.spec.ts` that:
- Creates a memory
- Immediately searches for it
- Asserts it is found

### 8. Verify Fix

- Run all existing tests (`npm test`)
- Run integration tests (`npm run test:e2e`)
- Manually verify with the test memory IDs from the issue if possible

---

## Verification

- [ ] Bug reproduced and root cause identified
- [ ] Fix implemented in appropriate file(s)
- [ ] Regression test added and passing
- [ ] All existing unit tests pass (323+)
- [ ] All integration tests pass (22+)
- [ ] Newly created memories are immediately searchable via `search()`
- [ ] Newly created memories are immediately queryable via `query()`
- [ ] Newly created memories are immediately findable via `findSimilar()`

---

## Expected Output

**Root cause**: Documented explanation of why new memories aren't searchable.

**Files Modified**:
- Fix file(s) — depends on root cause
- `src/services/__tests__/memory.service.spec.ts` — regression test

---

## Common Issues and Solutions

### Issue 1: Weaviate async vectorization
**Symptom**: Objects inserted but not found by nearText/hybrid until vectorization completes
**Solution**: Use `fetchObjectById()` to confirm storage, add consistency handling or await vectorization

### Issue 2: Filter excludes null fields
**Symptom**: Memories without `moderation_status` or `deleted_at` are excluded by default filters
**Solution**: Update filter builders to treat null/absent fields as passing (not excluding)

### Issue 3: Collection mismatch
**Symptom**: Memories written to one collection but searched in another
**Solution**: Verify collection names match between write and read paths

---

## Resources

- [GitHub Issue #1](https://github.com/prmichaelsen/agentbase.me/issues/1): Original bug report
- [Weaviate v3 Docs — Data Insert](https://weaviate.io/developers/weaviate/manage-data/create): Insert API reference
- [Weaviate v3 Docs — Consistency](https://weaviate.io/developers/weaviate/concepts/replication-architecture/consistency): Consistency levels

---

## Notes

- This is the highest-severity bug in the system — memory creation is a core feature
- Older/migrated memories work, so search infrastructure is functional
- The migration path likely uses `insertMany()` or a different write path
- Test memory IDs from the issue: `52673315-903c-4fca-8d37-2faffd753004`, `6b67cfcd-e09f-4e3a-a3b1-e8c8b9ec2b8a`, `3d1a1a8f-7a7f-4d2a-ae2b-e0e0fd8c0af1`

---

**Next Task**: TBD (depends on root cause analysis)
**Related Design Docs**: None yet
**Estimated Completion Date**: TBD
