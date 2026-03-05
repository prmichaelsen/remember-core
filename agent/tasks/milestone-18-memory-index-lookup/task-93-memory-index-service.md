# Task 93: MemoryIndexService

**Milestone**: [M18 - Memory Index Lookup Table](../../milestones/milestone-18-memory-index-lookup.md)
**Estimated Time**: 2-3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Create `MemoryIndexService` — a Firestore-backed service that maps memory UUIDs to Weaviate collection names. This is the foundation for O(1) cross-collection memory resolution.

---

## Context

Today, resolving a memory by ID requires knowing which Weaviate collection it lives in. `MemoryResolutionService` guesses with a 2-try fallback, but callers provide wrong context >90% of the time. This service provides the index that replaces guessing.

---

## Steps

### 1. Add Firestore path helper

Add `getMemoryIndexPath()` to `src/database/firestore/paths.ts`:

```typescript
export function getMemoryIndexPath(): string {
  return `${BASE}.memory_index`;
}
```

Export from `src/database/firestore/index.ts` barrel.

### 2. Create MemoryIndexService

Create `src/services/memory-index.service.ts`:

```typescript
interface MemoryIndexEntry {
  collection_name: string;
  created_at: string;
}

class MemoryIndexService {
  constructor(
    private firestore: FirebaseFirestore.Firestore,
    private logger: Logger,
  ) {}

  async index(memoryUuid: string, collectionName: string): Promise<void>
  async lookup(memoryUuid: string): Promise<string | null>
}
```

- `index()`: Writes `{ collection_name, created_at }` to `memory_index/{memoryUuid}`
- `lookup()`: Reads doc, returns `collection_name` or `null` if not found

### 3. Export from barrel

Add exports to `src/services/index.ts`.

### 4. Create colocated unit tests

Create `src/services/memory-index.service.spec.ts`:

- Test `index()` writes correct Firestore doc
- Test `lookup()` returns collection name for existing entry
- Test `lookup()` returns null for missing entry
- Test path uses correct Firestore prefix

---

## Verification

- [ ] `src/services/memory-index.service.ts` exists
- [ ] `src/services/memory-index.service.spec.ts` exists with passing tests
- [ ] `getMemoryIndexPath()` added to `src/database/firestore/paths.ts`
- [ ] Exported from `src/database/firestore/index.ts`
- [ ] `MemoryIndexService` and `MemoryIndexEntry` exported from `src/services/index.ts`
- [ ] Build passes (`npm run build`)
- [ ] Tests pass (`npm test`)

---

## Expected Output

**Files Created**:
- `src/services/memory-index.service.ts`
- `src/services/memory-index.service.spec.ts`

**Files Modified**:
- `src/database/firestore/paths.ts` — add `getMemoryIndexPath()`
- `src/database/firestore/index.ts` — export new path helper
- `src/services/index.ts` — export `MemoryIndexService`, `MemoryIndexEntry`

---

**Next Task**: [Task 94: Wire index write into MemoryService.create](task-94-wire-index-write.md)
**Related Design Docs**: [agent/design/local.memory-index-lookup.md](../../design/local.memory-index-lookup.md)
