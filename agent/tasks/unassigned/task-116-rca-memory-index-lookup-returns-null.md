# Task 116: RCA — MemoryIndexService.lookup() Returns Null Despite Document Existing

**Milestone**: Unassigned (RCA / bug investigation)
**Estimated Time**: 2-4 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Root-cause why `GET /api/svc/v1/memories/3c6c8dfd-dea0-4c54-99ac-595efe39ff5b?include=similar` returns 404 "Memory not found" when the memory index document exists in Firestore.

---

## Context

### Symptom
- `GET /api/svc/v1/memories/3c6c8dfd-dea0-4c54-99ac-595efe39ff5b?include=similar` returns 404
- Error: "Memory not found" — traced to `MemoryIndexService.lookup()` returning null

### What We Confirmed
- Memory index document **exists** at `remember-mcp.memory_index/3c6c8dfd-dea0-4c54-99ac-595efe39ff5b`
  - `collection_name: Memory_users_geTmbcAMyhYUyeIfQj0ZRFmorhA2`
  - `created_at: 2026-03-05T20:39:21.069Z`
- Memory **exists** in Weaviate collection `Memory_users_geTmbcAMyhYUyeIfQj0ZRFmorhA2`
  - `user_id: geTmbcAMyhYUyeIfQj0ZRFmorhA2` (matches collection owner)
  - `doc_type: memory`, `content_type: note`, `trust_score: 4`
- No `user_id` mismatch — stale UID hypothesis ruled out
- REST service (e1) uses `NODE_ENV=production`, no `ENVIRONMENT` set → `BASE` = `remember-mcp` (correct prefix)

### What We Haven't Confirmed
- Whether the issue is reproducible now or was transient
- Whether Firestore initialization is correct in the REST service at request time
- Whether the issue affects other memories or just this one
- Whether the `include=similar` path triggers a different code path that fails
- Whether the backfill-memory-index migration ran before or after the first failure

### Hypotheses to Investigate
1. **Firestore not initialized** — REST service may not have Firebase initialized when the lookup runs
2. **Race condition** — Memory was created before index backfill, first request hit before index existed
3. **Code path issue** — The `include=similar` flow may use a different lookup path that doesn't check the index correctly
4. **Caching** — A stale null result may be cached somewhere
5. **Firebase project mismatch** — REST service's `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY` may point to a different project than where the index doc lives

---

## Steps

### 1. Reproduce
- Hit the endpoint again and check if it still 404s
- Check REST service logs for the specific error

### 2. Trace the Code Path
- Follow `GET /memories/:id?include=similar` through the REST controller
- Identify exactly where `MemoryIndexService.lookup()` is called
- Check if Firestore is initialized before the call

### 3. Check Firebase Config
- Verify the REST service's Firebase project matches where the index doc lives
- Compare `FIREBASE_PROJECT_ID` secret with the project used by scripts

### 4. Test Other Memories
- Check if other memories in the same collection also fail
- Check if memories from other collections work

### 5. Document Findings
- Write up root cause
- Propose fix if applicable

---

## Verification

- [ ] Root cause identified
- [ ] Fix proposed or transient issue documented
- [ ] Other affected memories identified (if any)

---

## Scripts Created During Investigation

- `scripts/inspect-memory.ts` — Fetch memory from Weaviate via index lookup, show key properties
- `scripts/lookup-memory-index.ts` — Check if a memory UUID exists in Firestore memory index
