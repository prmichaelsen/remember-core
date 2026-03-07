# Task 183: byCurated Sort Mode (MemoryService + SpaceService)

**Milestone**: M36 — byCurated Sort Mode
**Status**: Not Started
**Estimated Hours**: 4
**Dependencies**: Task 179, Task 181
**Design Reference**: [byCurated Sort Mode](../../design/local.by-curated-sort-mode.md)

---

## Objective

Add `byCurated` sort mode to MemoryService and SpaceService. Supports both browse mode (no query, native sort by curated_score) and search mode (hybrid search → re-rank by curated_score). Unscored memories interleaved at 4:1 ratio.

## Steps

### 1. MemoryService.byCurated()

```typescript
export interface CuratedModeRequest {
  query?: string;        // optional search query for re-ranking
  limit?: number;
  offset?: number;
  direction?: 'asc' | 'desc';
  filters?: SearchFilters;
  deleted_filter?: DeletedFilter;
  ghost_context?: GhostSearchContext;
}

export interface CuratedMemory {
  // all standard memory fields plus:
  curated_score: number;
  curated_breakdown?: CuratedSubScores;  // optional, from Firestore
  is_discovery?: boolean;  // true if unscored (interleaved)
}

export interface CuratedModeResult {
  memories: CuratedMemory[];
  total: number;
  limit: number;
  offset: number;
}
```

**Browse mode** (no query): Native Weaviate sort by `curated_score` DESC.

**Search mode** (with query): Hybrid search (BM25 + vector) → re-rank results by `curated_score` DESC.

### 2. Unscored Memory Interleaving

Memories without `curated_score` (value 0 or unset) are interleaved with scored results at 4:1 ratio, using the same pattern as `byDiscovery`:
- Every 5th position filled with an unscored memory (sorted by `created_at` DESC within unscored pool)
- Marked with `is_discovery: true`

Reuse `interleaveDiscovery` from `src/services/discovery.ts` or adapt pattern.

### 3. SpaceService.byCurated()

Same cross-collection pattern as other space sort modes:
- `validateSpaceGroupInput()` → `fetchAcrossCollections()` → sort by `curated_score` DESC
- Supports `spaces`, `groups`, moderation filtering

### 4. Response Shape

Include `curated_breakdown` sub-scores when available (fetched from Firestore). This is optional — skip if Firestore read fails or sub-scores don't exist.

### 5. Barrel Exports

Add types and methods to `src/services/index.ts`.

## Verification

- [ ] `byCurated` browse mode sorts by `curated_score` DESC
- [ ] `byCurated` search mode re-ranks hybrid search results
- [ ] Unscored memories interleaved at 4:1 ratio
- [ ] Unscored memories sorted by `created_at` DESC within pool
- [ ] `is_discovery: true` on interleaved unscored memories
- [ ] SpaceService.byCurated works across spaces and groups
- [ ] `curated_breakdown` included when Firestore sub-scores available
- [ ] Ghost/trust filtering applied correctly
- [ ] Moderation filtering applied for spaces
- [ ] Unit tests for both browse and search modes
- [ ] Tests colocated
