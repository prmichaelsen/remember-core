# Task 177: SpaceService byProperty + byBroad + byRandom

**Milestone**: M35 — SpaceService Sort Modes
**Status**: Not Started
**Estimated Hours**: 3

---

## Objective

Implement `SpaceService.byProperty()`, `SpaceService.byBroad()`, and `SpaceService.byRandom()` following the same cross-collection pattern established in Task 176.

---

## Context

- MemoryService byProperty: `src/services/memory.service.ts:1049-1112`
- MemoryService byBroad: `src/services/memory.service.ts:1116-1189`
- MemoryService byRandom: `src/services/memory.service.ts:1193-1254`
- `sliceContent()`: `src/services/memory.service.ts:349` (already exported)
- `BroadSearchResult` type: `src/services/memory.service.ts:260-273`
- Task 176 helpers: `validateSpaceGroupInput()`, `searchAcrossCollections()`

---

## Steps

### 1. Implement byProperty

Sort by any valid Weaviate property across space/group collections.

```typescript
async byProperty(input: PropertySpaceInput, authContext?: AuthContext): Promise<PropertySpaceResult> {
  // Validate sort_field against ALL_MEMORY_PROPERTIES
  // Use searchAcrossCollections with sort by sort_field
  // Merge + re-sort by sort_field across collections
  // Paginate + return
}
```

Key detail: After merging results from multiple collections, re-sort by the sort_field property to maintain correct ordering. Numeric fields sort numerically, string fields sort lexicographically.

### 2. Implement byBroad

Truncated content for scan-and-drill-in across space/group collections.

```typescript
async byBroad(input: BroadSpaceInput, authContext?: AuthContext): Promise<BroadSpaceResult> {
  // Use searchAcrossCollections with sort by created_at
  // Apply sliceContent() to each result (import from memory.service.ts)
  // Build BroadSearchResult objects with head/mid/tail
  // Include title, total_significance, feel_significance, functional_significance if present
  // Dedupe + paginate + return
}
```

Import `sliceContent` and `BroadSearchResult` from `./memory.service.js`.

### 3. Implement byRandom

Random sampling from space/group collections.

```typescript
async byRandom(input: RandomSpaceInput, authContext?: AuthContext): Promise<RandomSpaceResult> {
  // Use searchAcrossCollections with large POOL_FETCH_LIMIT (1000)
  // Merge all results from all collections into one pool
  // Dedupe pool
  // Fisher-Yates partial shuffle to select N random items
  // Return results + total_pool_size
}
```

Key detail: No offset or pagination for byRandom (same as MemoryService).

---

## Verification

- [ ] `byProperty()` validates sort_field against ALL_MEMORY_PROPERTIES
- [ ] `byProperty()` re-sorts merged cross-collection results by sort_field
- [ ] `byBroad()` uses `sliceContent()` for content truncation
- [ ] `byBroad()` includes significance scores when present
- [ ] `byRandom()` uses Fisher-Yates partial shuffle
- [ ] `byRandom()` returns total_pool_size across all searched collections
- [ ] All 3 methods validate spaces/groups, check moderation, dedupe
- [ ] `sliceContent` and `BroadSearchResult` imported from memory.service (not duplicated)
