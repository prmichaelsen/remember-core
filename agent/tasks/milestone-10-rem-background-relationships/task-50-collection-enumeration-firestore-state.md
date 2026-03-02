# Task 50: Collection enumeration and Firestore REM state

**Milestone**: [M10 - REM Background Relationships](../../milestones/milestone-10-rem-background-relationships.md)
**Estimated Time**: 3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Create two foundational utilities REM needs: (1) a way to list all Weaviate memory collections, and (2) Firestore CRUD for REM cursor/collection state tracking.

---

## Context

REM processes one collection per hourly run, round-robining via cursor. It needs to list all memory collections (user, group, space) to iterate through them, and persist its cursor position in Firestore so it resumes correctly across invocations.

---

## Steps

### 1. Create src/rem/rem.collections.ts

List all Weaviate collections matching memory collection naming patterns:

```typescript
export async function listMemoryCollections(
  client: WeaviateClient
): Promise<string[]>
```

- Use `client.collections.listAll()` or equivalent Weaviate v3 API
- Filter to collections matching `Memory_users_*`, `Memory_spaces_*`, `Memory_groups_*`
- Sort alphabetically (stable ordering for cursor)
- Return collection names

### 2. Create src/rem/rem.types.ts

Define REM state types:

```typescript
export interface RemCursorState {
  last_collection_id: string;
  last_run_at: string;  // ISO timestamp
}

export interface RemCollectionState {
  collection_id: string;
  last_processed_at: string;  // ISO timestamp
  memory_cursor: string;      // created_at cursor for "unprocessed" third
}

export interface RemConfig {
  min_collection_size: number;     // Default: 50
  similarity_threshold: number;    // Default: 0.75
  max_candidates_per_run: number;  // Default: 30 (10 per third)
  max_similar_per_candidate: number; // Default: 20
  overlap_merge_threshold: number;   // Default: 0.60
  max_relationship_members: number;  // Default: 50
}

export const DEFAULT_REM_CONFIG: RemConfig;
```

### 3. Create src/rem/rem.state.ts

Firestore CRUD for REM state:

```typescript
export class RemStateStore {
  constructor(db: FirebaseFirestore.Firestore);

  async getCursor(): Promise<RemCursorState | null>;
  async saveCursor(state: RemCursorState): Promise<void>;

  async getCollectionState(collectionId: string): Promise<RemCollectionState | null>;
  async saveCollectionState(state: RemCollectionState): Promise<void>;
}
```

### 4. Add Firestore paths to firestore/paths.ts

```typescript
export function getRemCursorPath(): string;
// Returns: {BASE}.rem_state/cursor

export function getRemCollectionStatePath(collectionId: string): string;
// Returns: {BASE}.rem_state/collections/{collectionId}
```

### 5. Update barrel exports

Create `src/rem/index.ts` barrel. Do NOT add to root `src/index.ts` yet (wait until RemService is complete).

---

## Verification

- [ ] `listMemoryCollections()` returns filtered, sorted collection names
- [ ] `RemStateStore` reads/writes cursor and collection state to Firestore
- [ ] Firestore paths follow existing conventions (`{BASE}.rem_state/...`)
- [ ] `RemConfig` and `DEFAULT_REM_CONFIG` exported
- [ ] `RemCursorState` and `RemCollectionState` types exported
- [ ] Build compiles

---

**Next Task**: [Task 51: REM types and clustering algorithm](task-51-rem-types-clustering.md)
**Related Design Docs**: [REM Design](../../design/local.rem-background-relationships.md) (Processing Tracking, Scope & Targeting)
