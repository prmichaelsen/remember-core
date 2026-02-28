# Task 22: Extend MemoryService Input Types with Ghost Context

**Milestone**: [M6 - Ghost/Trust Integration](../../milestones/milestone-6-ghost-memory-service-integration.md)
**Estimated Time**: 2 hours
**Dependencies**: M5 complete
**Status**: Not Started

---

## Objective

Add optional `ghost_context` parameter to `SearchMemoryInput`, `QueryMemoryInput`, and `FindSimilarInput` so MemoryService can apply trust filtering and ghost content exclusion.

---

## Steps

### 1. Define GhostSearchContext type

In `src/types/search.types.ts` (or a new ghost-search.types.ts), add:

```typescript
export interface GhostSearchContext {
  /** Trust level of the user accessing ghost memories (0-1) */
  accessor_trust_level: number;
  /** Owner of the ghost memories being searched */
  owner_user_id: string;
  /** If true, skip ghost content_type exclusion (explicit ghost search) */
  include_ghost_content?: boolean;
}
```

### 2. Add ghost_context to SearchMemoryInput

In `src/services/memory.service.ts`:

```typescript
export interface SearchMemoryInput {
  // ... existing fields ...
  ghost_context?: GhostSearchContext;
}
```

### 3. Add ghost_context to QueryMemoryInput

```typescript
export interface QueryMemoryInput {
  // ... existing fields ...
  ghost_context?: GhostSearchContext;
}
```

### 4. Add ghost_context to FindSimilarInput

```typescript
export interface FindSimilarInput {
  // ... existing fields ...
  ghost_context?: GhostSearchContext;
}
```

### 5. Export from barrels

Update `src/types/index.ts` to export `GhostSearchContext`.

---

## Verification

- [ ] `GhostSearchContext` type exported from `@prmichaelsen/remember-core`
- [ ] All 3 input types accept optional `ghost_context`
- [ ] Build passes
- [ ] All existing tests pass (backwards compatible — field is optional)
