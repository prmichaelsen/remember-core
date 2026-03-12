# Task 511: Core Space Interception in SpaceService

**Milestone**: M76 — Synthetic Core Space
**Status**: not_started
**Estimated Hours**: 3
**Dependencies**: None

---

## Objective

Intercept `'core'` in the `spaces` array within SpaceService search/sort methods. Strip it before Weaviate queries, fetch synthetic results, merge with real results.

## Context

SpaceService methods (`search`, `byTime`, `byDiscovery`, etc.) accept `spaces: string[]`. When `'core'` is present:
1. Remove `'core'` from the spaces array
2. Fetch synthetic core memories (mood, perception, etc.) via a registry
3. If other spaces remain, run the normal Weaviate search
4. Merge synthetic + real results
5. If only `'core'`, return just synthetic results (no Weaviate query)

The interception should happen early in each method, before `fetchAcrossCollections()`.

## Steps

### 1. Add core space detection helper

```typescript
private extractCoreSpace(spaces: string[]): { hasCoreSpace: boolean; remainingSpaces: string[] } {
  const hasCoreSpace = spaces.includes('core');
  const remainingSpaces = spaces.filter(s => s !== 'core');
  return { hasCoreSpace, remainingSpaces };
}
```

### 2. Add synthetic result fetcher

SpaceService needs access to a `SyntheticMemoryRegistry` (injected via deps or constructor param). When `hasCoreSpace` is true, call:

```typescript
const syntheticResults = await this.syntheticRegistry.fetchAll(userId, ghostCompositeId);
```

Returns `Record<string, unknown>[]` — memory-shaped objects.

### 3. Wire interception into search methods

For each method that accepts `spaces`:
- `search()`, `byTime()`, `byRating()`, `byProperty()`, `byBroad()`, `byCurated()`, `byDiscovery()`, `byRecommendation()`

Add early interception:
```typescript
const { hasCoreSpace, remainingSpaces } = this.extractCoreSpace(spaces);
// Use remainingSpaces for Weaviate queries
// If hasCoreSpace, fetch synthetic and prepend to results
```

### 4. Merge logic

- Synthetic results go at the **front** of the results array (they're high-priority internal state)
- They count toward `total` but not toward `hasMore` (synthetic results are always complete)
- If `remainingSpaces` is empty and no groups, skip Weaviate entirely

### 5. Add SpaceService dependency

```typescript
interface SpaceServiceDeps {
  // ... existing ...
  syntheticRegistry?: SyntheticMemoryRegistry;
}
```

Optional — if not provided, `'core'` space is silently ignored (backward compatible).

### 6. Add SYNTHETIC_SPACES constant to space.types.ts

Separate from `SUPPORTED_SPACES` (publishable spaces) — synthetic spaces are read-only.

```typescript
export type SyntheticSpaceId = 'core';

export const SYNTHETIC_SPACES: SyntheticSpaceId[] = ['core'];

export const SYNTHETIC_SPACE_DISPLAY_NAMES: Record<SyntheticSpaceId, string> = {
  core: 'Core',
};

export const SYNTHETIC_SPACE_DESCRIPTIONS: Record<SyntheticSpaceId, string> = {
  core: 'Internal state — mood, perception, preferences. Read-only, not publishable.',
};
```

Export from `src/types/index.ts` so consumers (remember-mcp) can include synthetic spaces in tool descriptions alongside real spaces.

### 7. Guard publish/retract against synthetic spaces

In `SpaceService.publish()` and `SpaceService.retract()`, reject if any space_id is in `SYNTHETIC_SPACES`:

```typescript
if (SYNTHETIC_SPACES.includes(input.space_id as SyntheticSpaceId)) {
  throw new ValidationError(`Cannot publish to synthetic space '${input.space_id}'`);
}
```

## Verification

- [ ] `spaces: ['core']` returns synthetic results without hitting Weaviate
- [ ] `spaces: ['core', 'the_void']` merges synthetic + real
- [ ] `spaces: ['the_void']` unchanged behavior
- [ ] Synthetic results appear first in results array
- [ ] No registry provided → `'core'` silently stripped, no error
- [ ] All existing SpaceService tests pass
- [ ] Tests in `space-sort-modes.spec.ts`
- [ ] `SYNTHETIC_SPACES` exported from `src/types/index.ts`
- [ ] `SYNTHETIC_SPACE_DESCRIPTIONS` available for tool description generation
- [ ] Publish to `'core'` throws ValidationError
- [ ] Retract from `'core'` throws ValidationError
